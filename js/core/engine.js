/**
 * 万能麻将 - 核心游戏引擎
 */

class MahjongEngine extends Utils.EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            mahjongType: config.mahjongType ?? 'guangdong',
            playerCount: config.playerCount ?? 4,
            targetScore: config.targetScore ?? 1000,
            aiDifficulty: config.aiDifficulty ?? 'normal',
            speed: config.speed ?? 'normal',
            maxRounds: config.maxRounds ?? 4,
            ...config
        };
        
        this.typeConfig = Tiles.getConfig(this.config.mahjongType);
        // 防御：无效的 mahjongType 回退到 guangdong 默认配置
        if (!this.typeConfig) {
            console.warn('Invalid mahjongType:', this.config.mahjongType, 'falling back to guangdong');
            this.typeConfig = Tiles.getConfig('guangdong');
            this.config.mahjongType = 'guangdong';
        }
        this.ruleConfig = { mahjongType: this.config.mahjongType, ...(this.typeConfig?.rules || {}) };
        
        this.state = 'idle'; // idle, dealing, playing, waiting, action, ended
        this.players = [];
        this.deck = [];
        this.discardPile = [];
        this.currentPlayerIndex = 0;
        this.currentWind = 0; // 0=东,1=南,2=西,3=北
        this.round = 1;
        this.deckCount = 0;
        this.doraIndicators = [];
        this.hunPai = null;
        this.lastDiscard = null;
        this.pendingAction = null;
        this.gameHistory = [];
        this.matchHistory = []; // 跨局保存所有对局历史
        this.replayData = [];
        this.timer = null;
        this.turnTimeout = 30000;
        this._token = new Utils.CancelToken();
        
        this.speedMap = {
            slow: 2000,
            normal: 1000,
            fast: 400,
            instant: 0
        };
        // 防御：无效speed回退到normal（不能用 !speedMap[speed]，因为 instant 的值为 0 是 falsy）
        if (!(this.config.speed in this.speedMap)) {
            this.config.speed = 'normal';
        }
    }

    /**
     * 初始化玩家
     */
    initPlayers(playerConfigs) {
        if (this.config.playerCount <= 0) {
            console.error('initPlayers: invalid playerCount', this.config.playerCount);
            return;
        }
        // 清理旧玩家监听器，防止内存泄漏
        if (this.players) {
            for (const p of this.players) {
                if (p && typeof p.removeAllListeners === 'function') p.removeAllListeners();
            }
        }
        this.players = [];
        const configs = playerConfigs || [];
        for (let i = 0; i < this.config.playerCount; i++) {
            const cfg = configs[i] || { name: `玩家${i + 1}`, isAI: true };
            const player = new Player(i, cfg.name, cfg.isAI, this.config.autoSort !== false);
            player.position = i;
            player.score = this.config.targetScore;
            this.players.push(player);
        }
        this.players[0].isDealer = true;
    }

    /**
     * 开始游戏
     */
    async start() {
        // 取消旧 token，终止所有遗留异步操作
        if (this._token) this._token.cancel();
        // 每次开始游戏时创建新的 CancelToken，确保旧游戏的取消状态不影响新游戏
        this._token = new Utils.CancelToken();
        
        // 防御：玩家必须已初始化
        if (!this.players || this.players.length === 0) {
            console.error('Engine start: players not initialized');
            return;
        }
        // 确保轮次和风位已初始化（防止异常调用导致状态混乱）
        if (!this.round || this.round < 1) this.round = 1;
        if (this.currentWind === undefined || this.currentWind === null) this.currentWind = 0;
        
        // 清理上一局可能遗留的状态
        this.stopTimer();
        this.pendingAction = null;
        this._pendingActions = [];
        this.lastHuPlayer = null;
        this.doraIndicators = [];
        this.hunPai = null;
        
        this.state = 'dealing';
        this.emit('gameStart', { round: this.round, wind: this.currentWind });
        
        // 生成牌堆
        this.deck = Tiles.generateDeck(this.config.mahjongType);
        this.deckCount = this.deck.length;
        
        // 保存当前庄家（用于轮换）
        const prevDealerIndex = this.players.findIndex(p => p.isDealer);
        
        // 重置玩家
        for (const player of this.players) {
            player.reset();
        }
        
        // 恢复庄家状态（第一局默认position 0）
        const dealerIndex = prevDealerIndex >= 0 ? prevDealerIndex : 0;
        this.players[dealerIndex].isDealer = true;
        
        this.discardPile = [];
        this.lastDiscard = null;
        this.currentPlayerIndex = 0;
        // 注意：gameHistory 不清空，跨局累积；matchHistory 在新对局开始时清空
        if (this.round === 1) {
            this.matchHistory = [];
        }
        this.replayData = [];
        
        try {
            // 发牌
            await this.dealTiles();
            // 防御：dealTiles 内部吞掉 CANCELLED 后 return，此处需二次检查
            if (this._token.isCancelled || this.state === 'destroyed') {
                if (this.state !== 'destroyed') this.state = 'idle';
                return;
            }
            
            // 设置庄家
            this.currentPlayerIndex = this.players.findIndex(p => p.isDealer);
            
            // 四川麻将：选择缺一门
            if (this.ruleConfig.queYiMen) {
                await this.selectQueYiMen();
            }
            
            // 记录开局状态（用于回放）
            this.recordHistory('gameStart', {
                round: this.round,
                wind: this.currentWind,
                dealer: this.currentPlayerIndex,
                players: this.players.map(p => p.toJSON(true))
            });
            
            this.state = 'playing';
            this.emit('dealComplete');
            
            // 开始第一回合
            await this.startTurn();
        } catch (e) {
            if (e.message === 'CANCELLED') {
                if (this.state !== 'destroyed') this.state = 'idle';
                return;
            }
            throw e;
        }
    }

    /**
     * 发牌
     */
    async dealTiles() {
        if (this.state === 'destroyed') return;
        const handSize = this.typeConfig.handSize;
        const drawOrder = [];
        
        for (let i = 0; i < handSize; i++) {
            for (let p = 0; p < this.config.playerCount; p++) {
                drawOrder.push(p);
            }
        }
        
        for (let i = 0; i < drawOrder.length; i++) {
            if (this._token.isCancelled || this.state === 'destroyed') return;
            const playerIndex = drawOrder[i];
            const player = this.players[playerIndex];
            if (!player) {
                console.error('dealTiles: invalid player index', playerIndex);
                continue;
            }
            if (this.deck.length === 0) {
                console.error('Deck exhausted during deal');
                break;
            }
            const tile = this.deck.pop();
            this.deckCount = this.deck.length;
            player.draw(tile);
            
            this.emit('tileDealt', {
                playerIndex,
                tile,
                progress: (i + 1) / drawOrder.length,
                deckCount: this.deckCount
            });
            
            if (tile.isFlower && this.ruleConfig.huaPai) {
                try { await this.handleFlower(this.players[playerIndex]); } catch (e) { if (e.message === 'CANCELLED') return; throw e; }
            }
            
            if (this.config.speed !== 'instant') {
                try { await Utils.sleep(30, this._token); } catch (e) { if (e.message === 'CANCELLED') return; throw e; }
            }
        }
        
        this.emit('tilesDealt');
    }

    /**
     * 四川麻将：选择缺一门
     */
    async selectQueYiMen() {
        if (this.state === 'destroyed') return;
        const suits = ['wan', 'tong', 'tiao'];
        
        for (const player of this.players) {
            // 统计手牌中各花色数量
            const suitCounts = {};
            for (const tile of player.hand) {
                if (!tile.isHonor && !tile.isFlower) {
                    suitCounts[tile.suit] = (suitCounts[tile.suit] || 0) + 1;
                }
            }
            
            if (player.isAI) {
                let queSuit;
                // 困难/专家级使用向听数驱动的缺门选择
                if (this.config.aiDifficulty === 'hard' || this.config.aiDifficulty === 'expert') {
                    const choice = AIUtils.evaluateQueYiMenChoice(player.hand, this.ruleConfig);
                    queSuit = choice.suit;
                } else {
                    // 简单/普通：选择数量最少的花色
                    let minCount = Infinity;
                    queSuit = suits[0];
                    for (const suit of suits) {
                        const count = suitCounts[suit] || 0;
                        if (count < minCount) {
                            minCount = count;
                            queSuit = suit;
                        }
                    }
                }
                player.setQueYiMen(queSuit);
            } else {
                // 人类玩家：UI需要选择缺门
                // 如果玩家没有设置过，默认选择数量最少的花色
                let minCount = Infinity;
                let queSuit = suits[0];
                for (const suit of suits) {
                    const count = suitCounts[suit] || 0;
                    if (count < minCount) {
                        minCount = count;
                        queSuit = suit;
                    }
                }
                player.setQueYiMen(queSuit);
                this.emit('queYiMenSelected', { player: player.toJSON(), suit: queSuit });
            }
        }
    }

    /**
     * 检查玩家是否已打完缺门花色的牌
     */
    checkQueYiMenComplete(player) {
        if (!player.queYiMen) return true;
        const inHand = player.hand.some(t => t.suit === player.queYiMen);
        const inMelds = player.melds.some(m => m.tiles && m.tiles.some(t => t.suit === player.queYiMen));
        return !inHand && !inMelds;
    }

    /**
     * 处理花牌
     * 使用while循环确保补花后摸到的花牌也能被处理
     */
    async handleFlower(player) {
        let flowerCount = 0;
        const maxFlowers = 16;
        while (this.deck.length > 0 && player.hand.some(t => t.isFlower) && flowerCount < maxFlowers) {
            flowerCount++;
            if (this._token.isCancelled) return;
            const flower = player.hand.find(t => t.isFlower);
            if (!flower) break;
            
            player.hand = player.hand.filter(t => t.id !== flower.id);
            player.flowers.push(flower);
            this.emit('flower', { player: player.toJSON(), flower });
            
            if (this.deck.length > 0) {
                const replacement = this.deck.pop();
                if (replacement) {
                    this.deckCount = this.deck.length;
                    player.draw(replacement);
                } else {
                    console.error('handleFlower: deck.pop() returned undefined');
                }
            }
            
            if (this.config.speed !== 'instant') {
                try { await Utils.sleep(250, this._token); } catch (e) { if (e.message === 'CANCELLED') return; throw e; }
            }
        }
        
        // 牌堆已空但手中仍有花牌：将剩余花牌移出（无法补牌，避免花牌留在手中影响胡牌判断）
        const remainingFlowers = player.hand.filter(t => t.isFlower);
        for (const flower of remainingFlowers) {
            player.hand = player.hand.filter(t => t.id !== flower.id);
            player.flowers.push(flower);
            this.emit('flower', { player: player.toJSON(), flower, noReplacement: true });
        }
    }

    /**
     * 开始回合
     */
    async startTurn() {
        if (this.state === 'destroyed') return;
        try {
            this.stopTimer();
            const player = this.players[this.currentPlayerIndex];
            if (!player) {
                console.error('startTurn: invalid player index', this.currentPlayerIndex);
                await this.handleDrawGame();
                return;
            }
            
            if (player.isHu) {
                await this.nextTurn();
                return;
            }
            
            this.emit('turnStart', { player: player.toJSON(), index: this.currentPlayerIndex });
            
            // AI直接操作
            if (player.isAI) {
                await this.aiTurn(player);
            }
            // 人类玩家的操作由UI控制，摸牌在turnStart事件处理中执行
        } catch (e) {
            if (e.message === 'CANCELLED') {
                if (this.state !== 'destroyed') this.state = 'idle';
                return;
            }
            throw e;
        }
    }

    /**
     * 玩家摸牌
     */
    async playerDraw() {
        if (this.state !== 'playing') return null;
        try {
            const player = this.players[this.currentPlayerIndex];
            if (!player) {
                console.error('playerDraw: invalid player index', this.currentPlayerIndex);
                await this.handleDrawGame();
                return null;
            }
            
            if (this.deck.length === 0) {
                await this.handleDrawGame();
                return null;
            }
            
            const tile = this.deck.pop();
            this.deckCount = this.deck.length;
            player.draw(tile);
            this.recordHistory('draw', { playerId: player.id, tile: tile.id });
            
            this.emit('draw', { player: player.toJSON(), tile: tile ? { ...tile } : null, index: this.currentPlayerIndex, deckCount: this.deckCount });
            
            // 花牌补牌
            if (tile.isFlower && this.ruleConfig.huaPai) {
                try {
                    await this.handleFlower(player);
                } catch (e) {
                    if (e.message === 'CANCELLED') throw e;
                    console.error('handleFlower error in playerDraw:', e);
                }
            }
            
            // 检查自摸
            const winResult = Rules.canWin(player.hand, this.ruleConfig);
            if (winResult.canWin) {
                // 四川麻将：缺门未完成时不emit ziMo（避免无效自摸提示）
                if (this.ruleConfig.queYiMen && !this.checkQueYiMenComplete(player)) {
                    // 继续检查暗杠等
                } else {
                    this.emit('ziMo', { player: player.toJSON(), winInfo: winResult });
                    return { ziMo: true, winInfo: winResult };
                }
            }
            
            // 检查暗杠
            const anGangOptions = Rules.canAnGang(player.hand, player.melds, this.ruleConfig);
            if (anGangOptions.length > 0) {
                this.emit('anGangOptions', { player: player.toJSON(), options: anGangOptions });
            }
            
            return { ziMo: false, anGangOptions };
        } catch (e) {
            if (e.message === 'CANCELLED') {
                if (this.state !== 'destroyed') this.state = 'idle';
                return null;
            }
            throw e;
        }
    }

    /**
     * 玩家打牌
     */
    async playerDiscard(tileId) {
        if (this.state !== 'playing') return;
        try {
            this.stopTimer();
            
            const player = this.players[this.currentPlayerIndex];
            if (!player) {
                console.error('playerDiscard: invalid player index');
                await this.handleDrawGame();
                return;
            }
            const tile = player.discard(tileId);
            
            if (!tile) {
                console.error('Invalid discard: tile not in hand', tileId);
                this.emit('error', { type: 'invalidDiscard', tileId });
                // 恢复计时器让玩家有机会重新选择（仅当仍在playing状态）
                if (this.state === 'playing') {
                    this.startTimer();
                }
                return;
            }
            
            this.lastDiscard = tile;
            this.discardPile.push(tile);
            
            this.recordHistory('discard', { playerId: player.id, tile: tile.id });
            this.emit('discard', { player: player.toJSON(), tile: tile ? { ...tile } : null });
            
            // 等待其他玩家响应
            await this.waitForActions(tile);
        } catch (e) {
            if (e.message === 'CANCELLED') {
                if (this.state !== 'destroyed') this.state = 'idle';
                return;
            }
            throw e;
        }
    }

    /**
     * 等待其他玩家吃碰杠胡
     */
    async waitForActions(tile) {
        try {
            this.state = 'waiting';
            this._pendingActions = [];
            const allActions = [];
            
            for (let i = 1; i < this.config.playerCount; i++) {
                const idx = (this.currentPlayerIndex + i) % this.config.playerCount;
                const player = this.players[idx];
                
                if (player.isHu) continue;
                
                const actions = this.checkActions(player, tile, i === 1);
                for (const action of actions) {
                    allActions.push({ player, action, priority: action.priority });
                }
            }
            
            if (allActions.length === 0) {
                await this.nextTurn();
                return;
            }
            
            // AI 决策过滤：让 AI 逐项决定是否愿意执行动作
            const willingActions = [];
            for (const item of allActions) {
                if (item.player.isAI) {
                    const ctx = this.buildAIContext(item.player);
                    const wants = AIPlayer.shouldAction(item.player, item.action, tile, this.config.aiDifficulty, ctx);
                    if (wants) {
                        willingActions.push(item);
                    }
                } else {
                    willingActions.push(item);
                }
            }
            
            if (willingActions.length === 0) {
                await this.nextTurn();
                return;
            }
            
            // 按优先级排序
            willingActions.sort((a, b) => b.priority - a.priority);
            const highestPriority = willingActions[0].priority;
            const topActions = willingActions.filter(a => a.priority === highestPriority);
            
            // 最高优先级中，按逆时针顺序
            const winner = topActions.sort((a, b) => {
                const distA = (a.player.position - this.currentPlayerIndex + this.config.playerCount) % this.config.playerCount;
                const distB = (b.player.position - this.currentPlayerIndex + this.config.playerCount) % this.config.playerCount;
                return distA - distB;
            })[0];
            
            this._pendingActions = willingActions;
            await this._offerNextAction();
        } catch (e) {
            if (e.message === 'CANCELLED') {
                if (this.state !== 'destroyed') this.state = 'idle';
                return;
            }
            throw e;
        }
    }

    /**
     * 检查玩家可以执行的操作
     */
    checkActions(player, tile, isNextPlayer) {
        if (!tile) return [];
        const actions = [];
        
        // 胡
        const testHand = [...player.hand, tile];
        const winResult = Rules.canWin(testHand, this.ruleConfig);
        if (winResult.canWin) {
            // 四川麻将：缺门未完成时不提供胡牌选项，避免无效胡牌导致死锁
            if (this.ruleConfig.queYiMen && !this.checkQueYiMenComplete(player)) {
                // 继续检查其他动作
            } else {
                actions.push({ type: 'hu', winInfo: winResult, priority: this.getActionPriority('hu') });
            }
        }
        
        // 四川麻将：不能吃碰杠缺门花色的牌
        if (this.ruleConfig.queYiMen && tile.suit === player.queYiMen) {
            return actions;
        }
        
        // 杠
        if (Rules.canGang(player.hand, tile, this.ruleConfig)) {
            actions.push({ type: 'gang', priority: this.getActionPriority('gang') });
        }
        
        // 碰
        if (Rules.canPeng(player.hand, tile, this.ruleConfig)) {
            actions.push({ type: 'peng', priority: this.getActionPriority('peng') });
        }
        
        // 吃（只有下家可以吃）
        if (isNextPlayer) {
            const chiOptions = Rules.canChi(player.hand, tile, this.ruleConfig);
            if (chiOptions.length > 0) {
                actions.push({ type: 'chi', options: chiOptions, priority: this.getActionPriority('chi') });
            }
        }
        
        return actions;
    }

    /**
     * 获取操作优先级
     */
    getActionPriority(actionType) {
        const priorities = { hu: 4, gang: 3, peng: 2, chi: 1 };
        return priorities[actionType] || 0;
    }

    /**
     * 执行操作
     */
    async executeAction(player, action) {
        this.state = 'action';
        this.stopTimer();
        
        try {
            switch (action.type) {
                case 'chi':
                    await this.executeChi(player, action);
                    break;
                case 'peng':
                    await this.executePeng(player, action);
                    break;
                case 'gang':
                    await this.executeGang(player, action);
                    break;
                case 'hu': {
                    const huSuccess = await this.executeHu(player, action);
                    if (!huSuccess) {
                        // 胡牌被拒绝（缺门未完成或起胡不足），继续游戏
                        this.state = 'playing';
                        await this.nextTurn();
                    }
                    return;
                }
                default:
                    console.error('Unknown action type:', action.type);
                    this.state = 'playing';
                    await this.nextTurn();
                    return;
            }
        } catch (e) {
            // 防御：任何异常都不应让游戏卡死在 action 状态
            if (e.message === 'CANCELLED') {
                if (this.state !== 'destroyed') this.state = 'idle';
                this.pendingAction = null;
                return;
            }
            if (e.message !== 'CANCELLED') {
                console.error('executeAction error:', e);
            }
            // 不要覆盖已结束/已销毁的状态
            if (this.state !== 'ended' && this.state !== 'destroyed') {
                this.state = 'playing';
            }
            this.pendingAction = null;
            throw e;
        } finally {
            this.pendingAction = null;
            this._pendingActions = [];
        }
    }

    /**
     * 执行吃
     */
    async executeChi(player, action) {
        try {
            if (!action.options || action.options.length === 0) {
                console.error('executeChi: no options available');
                if (this.state !== 'ended' && this.state !== 'destroyed') this.state = 'playing';
                await this.nextTurn();
                return;
            }
            // 防御：lastDiscard 可能为 null
            if (!this.lastDiscard) {
                console.error('executeChi: lastDiscard is null');
                if (this.state !== 'ended' && this.state !== 'destroyed') this.state = 'playing';
                await this.nextTurn();
                return;
            }
            let chiTiles;
            if (player.isAI) {
                const ctx = this.buildAIContext(player);
                chiTiles = AIPlayer.chooseChiOption(player, action.options, this.config.aiDifficulty, ctx);
            } else {
                chiTiles = action.selectedOption || action.options[0];
            }
            const discardTile = this.lastDiscard;
            
            // 从弃牌堆移除被吃的牌
            this.removeFromDiscardPile(discardTile);
            
            // 移除手牌中的两张
            const handTiles = chiTiles.filter(t => t.id !== discardTile.id);
            player.removeFromHand(handTiles);
            
            // 添加副露
            player.addMeld({
                type: 'sequence',
                tiles: [...chiTiles],
                from: this.currentPlayerIndex
            });
            
            const fromPlayerIndex = this.currentPlayerIndex;
            this.recordHistory('chi', { playerId: player.id, tiles: chiTiles.map(t => t.id), from: fromPlayerIndex });
            this.emit('chi', { player: player.toJSON(), tiles: chiTiles, from: fromPlayerIndex });
            
            this.currentPlayerIndex = player.position;
            this.state = 'playing';
            
            // 吃牌后需要打牌，不摸牌
            this.emit('needDiscard', { player: player.toJSON(), index: this.currentPlayerIndex });
            
            if (player.isAI) {
                try { await Utils.sleep(this.speedMap[this.config.speed] * 0.5, this._token); } catch (e) { if (e.message === 'CANCELLED') return; throw e; }
                const ctx = this.buildAIContext(player);
                let tileToDiscard = AIPlayer.chooseDiscard(player, this.config.aiDifficulty, ctx);
                if (!tileToDiscard) {
                    tileToDiscard = player.hand[0];
                    if (!tileToDiscard) {
                        console.error('AI has no tile to discard after chi');
                        this.state = 'playing';
                        await this.nextTurn();
                        return;
                    }
                }
                await this.playerDiscard(tileToDiscard.id);
            }
        } catch (e) {
            if (e.message === 'CANCELLED') {
                if (this.state !== 'destroyed') this.state = 'idle';
                return;
            }
            throw e;
        }
    }

    /**
     * 执行碰
     */
    async executePeng(player, action) {
        try {
            const discardTile = this.lastDiscard;
            if (!discardTile) {
                console.error('executePeng: lastDiscard is null');
                this.state = 'playing';
                await this.nextTurn();
                return;
            }
            
            // 从弃牌堆移除被碰的牌
            this.removeFromDiscardPile(discardTile);
            
            const sameTiles = player.hand.filter(t => Tiles.isSameTile(t, discardTile));
            if (sameTiles.length < 2) {
                console.error('executePeng: not enough tiles');
                this.state = 'playing';
                await this.nextTurn();
                return;
            }
            const usedTiles = sameTiles.slice(0, 2);
            
            player.removeFromHand(usedTiles);
            player.addMeld({
                type: 'triplet',
                tiles: [...usedTiles, discardTile],
                from: this.currentPlayerIndex
            });
            
            const fromPlayerIndex = this.currentPlayerIndex;
            this.recordHistory('peng', { playerId: player.id, tiles: [...usedTiles, discardTile].map(t => t.id), from: fromPlayerIndex });
            this.emit('peng', { player: player.toJSON(), tiles: [...usedTiles, discardTile], from: fromPlayerIndex });
            
            this.currentPlayerIndex = player.position;
            this.state = 'playing';
            
            // 碰牌后需要打牌，不摸牌
            this.emit('needDiscard', { player: player.toJSON(), index: this.currentPlayerIndex });
            
            if (player.isAI) {
                try { await Utils.sleep(this.speedMap[this.config.speed] * 0.5, this._token); } catch (e) { if (e.message === 'CANCELLED') return; throw e; }
                const ctx = this.buildAIContext(player);
                let tileToDiscard = AIPlayer.chooseDiscard(player, this.config.aiDifficulty, ctx);
                if (!tileToDiscard) {
                    tileToDiscard = player.hand[0];
                    if (!tileToDiscard) {
                        console.error('AI has no tile to discard after peng');
                        this.state = 'playing';
                        await this.nextTurn();
                        return;
                    }
                }
                await this.playerDiscard(tileToDiscard.id);
            }
        } catch (e) {
            if (e.message === 'CANCELLED') {
                if (this.state !== 'destroyed') this.state = 'idle';
                return;
            }
            throw e;
        }
    }

    /**
     * 执行杠
     */
    async executeGang(player, action) {
        try {
            this.stopTimer();
            this.state = 'action';
            
            const discardTile = this.lastDiscard;
            if (!discardTile) {
                console.error('executeGang: lastDiscard is null');
                this.state = 'playing';
                await this.nextTurn();
                return;
            }
            
            // 从弃牌堆移除被杠的牌
            this.removeFromDiscardPile(discardTile);
            
            // 明杠只取3张手牌（防止手牌有4张时变成5张副露）
            const sameTiles = player.hand.filter(t => Tiles.isSameTile(t, discardTile)).slice(0, 3);
            if (sameTiles.length < 3) {
                console.error('executeGang: not enough tiles');
                this.state = 'playing';
                await this.nextTurn();
                return;
            }
            
            player.removeFromHand(sameTiles);
            player.addMeld({
                type: 'gang',
                tiles: [...sameTiles, discardTile],
                from: this.currentPlayerIndex,
                isMingGang: true
            });
            player.gangCount++;
            
            const fromPlayerIndex = this.currentPlayerIndex;
            this.recordHistory('gang', { playerId: player.id, tiles: [...sameTiles, discardTile].map(t => t.id), from: fromPlayerIndex });
            
            // 切换当前玩家为杠的人（必须在gangShangKaiHua检查之前，确保自摸判断正确）
            this.currentPlayerIndex = player.position;
            this.state = 'playing';
            
            // 杠后摸牌
            let gangTile = null;
            if (this.deck.length > 0) {
                gangTile = this.deck.pop();
                this.deckCount = this.deck.length;
                player.draw(gangTile);
                this.recordHistory('draw', { playerId: player.id, tile: gangTile.id, fromGang: true });
                
                // 检查花牌（在emit draw之前处理，确保手牌正确）
                if (gangTile.isFlower && this.ruleConfig.huaPai) {
                    await this.handleFlower(player);
                }
                
                // 先emit摸牌事件，确保UI手牌状态正确
                this.emit('draw', { player: player.toJSON(), tile: gangTile ? { ...gangTile } : null, fromGang: true, index: this.currentPlayerIndex, deckCount: this.deckCount });
            } else {
                // 杠后无牌可摸：流局
                await this.handleDrawGame();
                return;
            }
            
            // emit gang事件，确保UI副露状态正确
            this.emit('gang', { player: player.toJSON(), tiles: [...sameTiles, discardTile], from: fromPlayerIndex });
            
            // 检查杠上开花
            const winResult = Rules.canWin(player.hand, this.ruleConfig);
            if (winResult.canWin) {
                const huSuccess = await this.executeHu(player, { type: 'hu', winInfo: winResult, isGangShangKaiHua: true });
                if (huSuccess) return;
                // minFan 不足被拒绝，继续打牌
            }
            
            // 杠后已经摸过牌，直接要求打牌（不再走turnStart的摸牌流程）
            this.emit('needDiscard', { player: player.toJSON(), index: this.currentPlayerIndex });
            
            if (player.isAI) {
                try { await Utils.sleep(this.speedMap[this.config.speed] * 0.5, this._token); } catch (e) { if (e.message === 'CANCELLED') return; throw e; }
                const ctx = this.buildAIContext(player);
                let tileToDiscard = AIPlayer.chooseDiscard(player, this.config.aiDifficulty, ctx);
                if (!tileToDiscard) {
                    tileToDiscard = player.hand[0];
                    if (!tileToDiscard) {
                        console.error('AI has no tile to discard after gang');
                        this.state = 'playing';
                        await this.nextTurn();
                        return;
                    }
                }
                await this.playerDiscard(tileToDiscard.id);
            }
        } catch (e) {
            if (e.message === 'CANCELLED') {
                if (this.state !== 'destroyed') this.state = 'idle';
                return;
            }
            throw e;
        }
    }

    /**
     * 执行暗杠
     */
    async executeAnGang(player, option) {
        try {
            this.stopTimer();
            this.state = 'action';
            
            const wasAnGang = option.type === 'an_gang';
            
            if (wasAnGang) {
                if (!option.tiles || !Array.isArray(option.tiles) || option.tiles.length === 0) {
                    console.error('executeAnGang: invalid tiles for an_gang', option);
                    if (this.state !== 'ended' && this.state !== 'destroyed') this.state = 'playing';
                    await this.nextTurn();
                    return;
                }
                player.removeFromHand(option.tiles);
                player.addMeld({
                    type: 'gang',
                    tiles: option.tiles,
                    isAnGang: true
                });
                player.gangCount++;
                
                this.recordHistory('anGang', { playerId: player.id, tiles: option.tiles.map(t => t.id) });
            } else if (option.type === 'jia_gang') {
                if (!option.meld || !option.tile) {
                    console.error('executeAnGang: invalid meld/tile for jia_gang', option);
                    if (this.state !== 'ended' && this.state !== 'destroyed') this.state = 'playing';
                    await this.nextTurn();
                    return;
                }
                player.removeFromHand([option.tile]);
                option.meld.type = 'gang';
                option.meld.tiles.push(option.tile);
                option.meld.isJiaGang = true;
                player.gangCount++;
                
                this.recordHistory('jiaGang', { playerId: player.id, meldId: option.meld.tiles[0].id });
            } else {
                console.error('executeAnGang: unknown option type', option?.type);
                if (this.state !== 'ended' && this.state !== 'destroyed') this.state = 'playing';
                await this.nextTurn();
                return;
            }
            
            // 杠后摸牌
            let gangTile = null;
            if (this.deck.length > 0) {
                gangTile = this.deck.pop();
                this.deckCount = this.deck.length;
                player.draw(gangTile);
                this.recordHistory('draw', { playerId: player.id, tile: gangTile.id, fromGang: true });
                
                // 先处理花牌，确保手牌状态正确
                if (gangTile.isFlower && this.ruleConfig.huaPai) {
                    await this.handleFlower(player);
                }
                
                // 先emit摸牌事件，确保UI手牌状态正确
                this.emit('draw', { player: player.toJSON(), tile: gangTile ? { ...gangTile } : null, fromGang: true, index: this.currentPlayerIndex, deckCount: this.deckCount });
            } else {
                // 杠后无牌可摸：流局
                await this.handleDrawGame();
                return;
            }
            
            // emit gang事件，确保UI副露状态正确
            if (wasAnGang) {
                this.emit('anGang', { player: player.toJSON(), tiles: option.tiles });
            } else {
                this.emit('jiaGang', { player: player.toJSON(), meld: option.meld });
            }
            
            // 检查杠上开花
            const winResult = Rules.canWin(player.hand, this.ruleConfig);
            if (winResult.canWin) {
                const huSuccess = await this.executeHu(player, { type: 'hu', winInfo: winResult, isGangShangKaiHua: true });
                if (huSuccess) return { gangShangKaiHua: true };
                // minFan 不足被拒绝，继续打牌
            }
            
            // 暗杠后需要打牌
            this.state = 'playing';
            this.emit('needDiscard', { player: player.toJSON(), index: this.currentPlayerIndex });
            
            if (player.isAI) {
                try { await Utils.sleep(this.speedMap[this.config.speed] * 0.5, this._token); } catch (e) { if (e.message === 'CANCELLED') return; throw e; }
                const ctx = this.buildAIContext(player);
                let tileToDiscard = AIPlayer.chooseDiscard(player, this.config.aiDifficulty, ctx);
                if (!tileToDiscard) {
                    tileToDiscard = player.hand[0];
                    if (!tileToDiscard) {
                        console.error('AI has no tile to discard after anGang');
                        this.state = 'playing';
                        await this.nextTurn();
                        return;
                    }
                }
                await this.playerDiscard(tileToDiscard.id);
            }
            
            return { gangShangKaiHua: false };
        } catch (e) {
            if (e.message === 'CANCELLED') {
                if (this.state !== 'destroyed') this.state = 'idle';
                return;
            }
            throw e;
        }
    }

    /**
     * 构建 AI 决策上下文
     */
    buildAIContext(forPlayer) {
        return {
            deckCount: this.deck.length,
            discardPile: this.discardPile,
            doraIndicators: this.doraIndicators,
            config: this.config,
            ruleConfig: this.ruleConfig,
            currentPlayerIndex: this.currentPlayerIndex,
            currentWind: this.currentWind,
            round: this.round,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                isAI: p.isAI,
                score: p.score,
                position: p.position,
                isDealer: p.isDealer,
                handSize: p.hand.length,
                hand: p.id === forPlayer.id ? p.hand : undefined,
                discards: p.discards,
                melds: p.melds,
                flowers: p.flowers,
                isHu: p.isHu,
                gangCount: p.gangCount,
                queYiMen: p.queYiMen,
            })),
            selfIndex: forPlayer.position,
        };
    }

    /**
     * 从弃牌堆移除指定牌
     */
    removeFromDiscardPile(tile) {
        if (!tile) return;
        const index = this.discardPile.findIndex(t => t.id === tile.id);
        if (index !== -1) {
            this.discardPile.splice(index, 1);
        }
    }

    /**
     * 执行胡牌
     */
    async executeHu(player, action) {
        this.stopTimer();
        
        const isZiMo = player.position === this.currentPlayerIndex;
        
        // 四川麻将：检查缺门是否已完成
        if (this.ruleConfig.queYiMen && !this.checkQueYiMenComplete(player)) {
            this.emit('invalidHu', { player: player.toJSON(), reason: 'queYiMenNotComplete' });
            return false;
        }
        
        const winInfo = isZiMo ? 
            Rules.canWin(player.hand, this.ruleConfig) : 
            action.winInfo;
        
        // 全求人：点炮胡且所有手牌都在副露中（只剩将牌中的一张+点炮牌）
        // 简化判断：有4个副露（12张）+ 手牌1张单牌 + 1张点炮牌
        const handTileCount = player.hand.length;
        const meldTileCount = player.melds.reduce((sum, m) => sum + m.tiles.length, 0);
        const isQuanQiuRen = !isZiMo && meldTileCount >= 12 && handTileCount <= 2;
        
        const context = {
            isZiMo,
            isMenQing: player.melds.length === 0,
            isGangShangKaiHua: action.isGangShangKaiHua || false,
            isHaiDiLaoYue: this.deck.length === 0,
            isQuanQiuRen,
            gangCount: player.gangCount,
            flowers: player.flowers || []
        };
        
        if (!isZiMo && !this.lastDiscard) {
            console.error('executeHu: lastDiscard is null for non-ziMo');
            return false;
        }
        const fanResult = Rules.calculateFan(
            isZiMo ? player.hand : [...player.hand, this.lastDiscard],
            player.melds,
            winInfo,
            this.ruleConfig,
            context
        );
        
        // ===== 起胡门槛检查 =====
        const minFan = this.ruleConfig.minFan || 0;
        if (minFan > 0 && fanResult.total < minFan) {
            this.emit('invalidHu', {
                player: player.toJSON(),
                reason: 'minFanNotMet',
                detail: `${fanResult.total}番 < ${minFan}番起胡`
            });
            return false;
        }
        
        // 防止双胡
        if (player.isHu) {
            console.warn('executeHu: player already isHu', player.position);
            return true;
        }
        
        // 标记玩家已胡
        player.isHu = true;
        
        // 记录赢家（用于下一局庄家确定）
        this.lastHuPlayer = player.position;
        
        try {
            // 结算分数：底分 × 2^(番数 - 起胡番)
            const baseScore = 1;
            const effectiveFan = Math.max(0, fanResult.total - minFan);
            let totalScore = baseScore * Math.pow(2, effectiveFan);
            // 防御：防止分数溢出
            if (!isFinite(totalScore) || totalScore > 1e9) totalScore = 1e9;
            
            if (isZiMo) {
                for (const p of this.players) {
                    if (p.id !== player.id && !p.isHu) {
                        p.addScore(-totalScore);
                        player.addScore(totalScore);
                    }
                }
            } else {
                const discardPlayer = this.players[this.currentPlayerIndex];
                if (discardPlayer) {
                    discardPlayer.addScore(-totalScore);
                }
                player.addScore(totalScore);
            }
            
            this.recordHistory('hu', {
                playerId: player.id,
                isZiMo,
                fan: fanResult,
                score: totalScore,
                winType: winInfo.type
            });
            
            // 防御：emit 监听器可能抛出异常，确保 endRound/nextTurn 始终执行
            try {
                const huPayload = {
                    player: player.toJSON(),
                    isZiMo,
                    fan: Utils.deepClone(fanResult),
                    score: totalScore,
                    hand: player.hand.map(t => t.id),
                    winType: winInfo.type,
                    isGangShangKaiHua: action.isGangShangKaiHua || false
                };
                if (!isZiMo) {
                    huPayload.from = this.currentPlayerIndex;
                }
                this.emit('hu', huPayload);
            } catch (emitErr) {
                console.error('hu event listener error:', emitErr);
            }
            
            // 检查是否一局结束
            if (this.isRoundOver()) {
                await this.endRound();
            } else {
                // 四川麻将血战到底，继续
                if (this.ruleConfig.xueZhanDaoDi) {
                    await this.nextTurn();
                } else {
                    await this.endRound();
                }
            }
        } catch (e) {
            if (e.message === 'CANCELLED') {
                if (this.state !== 'destroyed') this.state = 'idle';
                return false;
            }
            // 回滚胡牌标记，防止半事务状态
            // 只有在 catch 前确实是我们设置的 isHu 才回滚（防止覆盖之前合法的状态）
            player.isHu = false;
            this.lastHuPlayer = null;
            throw e;
        }
        return true;
    }

    /**
     * 一局是否结束
     */
    isRoundOver() {
        const activePlayers = this.players.filter(p => !p.isHu);
        if (activePlayers.length <= 1) return true;
        if (this.deck.length === 0) return true;
        return false;
    }

    /**
     * 流局处理
     */
    async handleDrawGame() {
        this.stopTimer();
        this.recordHistory('drawGame', { reason: 'deckEmpty' });
        this.emit('drawGame', {
            reason: 'deckEmpty',
            players: this.players.map(p => p.toJSON())
        });
        await this.endRound();
    }

    /**
     * 结束一局
     */
    async endRound() {
        this.stopTimer();
        this.pendingAction = null;
        this._pendingActions = [];
        this.state = 'ended';

        // 记录局结束（用于回放）
        this.recordHistory('roundEnd', {
            round: this.round,
            wind: this.currentWind,
            players: this.players.map(p => p.toJSON(true))
        });

        // 保存本局历史到 matchHistory
        if (this.gameHistory && this.gameHistory.length > 0) {
            this.matchHistory.push({
                round: this.round,
                wind: this.currentWind,
                history: [...this.gameHistory],
                players: this.players.map(p => p.toJSON(true))
            });
            // 清空当前局历史，下一局重新累积
            this.gameHistory = [];
            // 防御：防止跨局长 session 内存无限增长
            if (this.matchHistory.length > 1000) {
                this.matchHistory = this.matchHistory.slice(-500);
            }
        }

        this.emit('roundEnd', {
            round: this.round,
            wind: this.currentWind,
            players: this.players.map(p => p.toJSON())
        });

        if (this.round >= this.config.maxRounds) {
            this.emit('gameEnd', {
                players: this.players.map(p => p.toJSON()),
                winner: this.getWinner()?.toJSON()
            });
        } else {
            this.round++;
            // 圈风每局轮换（东→南→西→北）
            this.currentWind = (this.round - 1) % 4;

            // 确定下一局庄家：胡牌者做庄，无人胡牌（流局）则庄家连庄
            const currentDealer = this.players.findIndex(p => p.isDealer);
            if (currentDealer >= 0) {
                this.players[currentDealer].isDealer = false;
            }
            let nextDealer;
            if (this.lastHuPlayer !== undefined && this.lastHuPlayer !== null && this.players[this.lastHuPlayer]) {
                nextDealer = this.lastHuPlayer;
            } else {
                nextDealer = (currentDealer >= 0 ? currentDealer : 0);
            }
            this.players[nextDealer].isDealer = true;
            this.lastHuPlayer = null;

            try { await Utils.sleep(1500, this._token); } catch (e) { if (e.message === 'CANCELLED') return; throw e; }
            if (this.state === 'destroyed') return;
            try {
                await this.start();
            } catch (e) {
                if (e.message === 'CANCELLED') return;
                throw e;
            }
        }
    }

    /**
     * 下一回合
     */
    async nextTurn() {
        try {
            // 防御：playerCount 为 0 时避免除零
            if (!this.config.playerCount || this.config.playerCount <= 0) {
                console.error('nextTurn: invalid playerCount', this.config.playerCount);
                await this.endRound();
                return;
            }
            do {
                this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.config.playerCount;
                // 防御：players数组异常时的保护
                if (!this.players[this.currentPlayerIndex]) {
                    console.error('nextTurn: invalid player index', this.currentPlayerIndex);
                    break;
                }
            } while (this.players[this.currentPlayerIndex]?.isHu && !this.isRoundOver());
            
            if (this.isRoundOver()) {
                await this.endRound();
            } else {
                await this.startTurn();
            }
        } catch (e) {
            if (e.message === 'CANCELLED') {
                if (this.state !== 'destroyed') this.state = 'idle';
                return;
            }
            throw e;
        }
    }

    /**
     * 获取赢家
     */
    getWinner() {
        const sorted = [...this.players].sort((a, b) => b.score - a.score);
        return sorted[0];
    }

    /**
     * AI回合
     */
    async aiTurn(player) {
        try {
            try { await Utils.sleep(this.speedMap[this.config.speed] * 0.8, this._token); } catch (e) { if (e.message === 'CANCELLED') return; throw e; }
            
            // 防御：引擎可能在sleep期间被销毁
            if (this.state === 'idle' || !this.players || !this.players[this.currentPlayerIndex]) {
                return;
            }
            
            // AI先摸牌
            const drawResult = await this.playerDraw();
            
            // 如果牌堆已空（流局），不再继续
            if (!drawResult) {
                return;
            }
            
            // 如果自摸了
            if (drawResult.ziMo) {
                const huSuccess = await this.executeHu(player, { type: 'hu', winInfo: drawResult.winInfo });
                if (huSuccess) return;
                // minFan 不足被拒绝，继续打牌
            }
            
            // 检查暗杠
            if (drawResult.anGangOptions && drawResult.anGangOptions.length > 0) {
                const ctx = this.buildAIContext(player);
                const shouldGang = AIPlayer.shouldAnGang(player, drawResult.anGangOptions, this.config.aiDifficulty, ctx);
                if (shouldGang) {
                    await this.executeAnGang(player, drawResult.anGangOptions[0]);
                    // executeAnGang 内部已处理后续打牌
                    return;
                }
            }
            
            // 打牌
            const ctx = this.buildAIContext(player);
            const tileToDiscard = AIPlayer.chooseDiscard(player, this.config.aiDifficulty, ctx);
            if (!tileToDiscard) {
                console.error('AI has no tile to discard');
                return;
            }
            await this.playerDiscard(tileToDiscard.id);
        } catch (e) {
            if (e.message === 'CANCELLED') return;
            console.error('aiTurn error:', e);
            // 尝试恢复：如果还在本局，强制进入安全状态
            if (this.state !== 'ended' && this.state !== 'destroyed') {
                this.state = 'playing';
                await this.nextTurn();
            }
        }
    }

    /**
     * 跳过操作
     */
    async skipAction() {
        try {
            if (this.pendingAction) {
                const skippedPlayerPos = this.pendingAction.player.position;
                const skippedActionType = this.pendingAction.action.type;
                this.pendingAction = null;
                
                // 从 pendingActions 中移除已跳过的动作
                if (this._pendingActions) {
                    this._pendingActions = this._pendingActions.filter(
                        a => !(a.player.position === skippedPlayerPos && a.action.type === skippedActionType)
                    );
                }
                
                await this._offerNextAction();
            }
        } catch (e) {
            if (e.message === 'CANCELLED') {
                if (this.state !== 'destroyed') this.state = 'idle';
                return;
            }
            throw e;
        }
    }
    
    /**
     * 从待处理动作列表中选择下一个动作并发出
     */
    async _offerNextAction() {
        try {
            if (!this._pendingActions || this._pendingActions.length === 0) {
                this.pendingAction = null;
                await this.nextTurn();
                return;
            }
            
            // 按优先级排序
            this._pendingActions.sort((a, b) => b.priority - a.priority);
            const highestPriority = this._pendingActions[0].priority;
            const topActions = this._pendingActions.filter(a => a.priority === highestPriority);
            
            // 最高优先级中，按逆时针顺序
            const winner = topActions.sort((a, b) => {
                const distA = (a.player.position - this.currentPlayerIndex + this.config.playerCount) % this.config.playerCount;
                const distB = (b.player.position - this.currentPlayerIndex + this.config.playerCount) % this.config.playerCount;
                return distA - distB;
            })[0];
            
            this.pendingAction = winner;
            this.emit('actionAvailable', {
                player: winner.player.toJSON(),
                action: winner.action ? { ...winner.action, winInfo: winner.action.winInfo ? { ...winner.action.winInfo } : undefined } : null,
                tile: this.lastDiscard ? { ...this.lastDiscard } : null
            });
            
            if (winner.player.isAI) {
                try { await Utils.sleep(this.speedMap[this.config.speed] * 0.5, this._token); } catch (e) { if (e.message === 'CANCELLED') return; throw e; }
                try {
                    await this.executeAction(winner.player, winner.action);
                } catch (e) {
                    if (e.message === 'CANCELLED') return;
                    console.error('waitForActions executeAction error:', e);
                    if (this.state !== 'ended' && this.state !== 'destroyed') {
                        this.state = 'playing';
                    }
                    this.pendingAction = null;
                    this._pendingActions = [];
                    if (this.state !== 'ended' && this.state !== 'destroyed') {
                        await this.nextTurn();
                    }
                }
            } else {
                this.emit('playerAction', {
                    player: winner.player.toJSON(),
                    action: winner.action ? { ...winner.action, winInfo: winner.action.winInfo ? { ...winner.action.winInfo } : undefined } : null
                });
            }
        } catch (e) {
            if (e.message === 'CANCELLED') {
                if (this.state !== 'destroyed') this.state = 'idle';
                return;
            }
            throw e;
        }
    }

    /**
     * 设置超时计时器
     */
    startTimer() {
        this.stopTimer();
        if (this.config.speed === 'instant') return;
        if (this.state === 'destroyed') return;
        
        const playerIndex = this.currentPlayerIndex;
        const player = this.players[playerIndex];
        if (!player) return;
        const token = this._token;
        
        this.timer = setTimeout(async () => {
            try {
                if (token.isCancelled || this.state === 'destroyed') return;
                if (this.state !== 'playing' || this.currentPlayerIndex !== playerIndex) return;
                if (!this.players || !this.players[this.currentPlayerIndex]) return;
                const currentPlayer = this.players[this.currentPlayerIndex];
                if (!currentPlayer) return;
                
                this.emit('turnTimeout', { player: currentPlayer.toJSON() });
                const tile = currentPlayer.hand[0];
                if (tile) {
                    await this.playerDiscard(tile.id);
                } else {
                    // 手牌为空，强制流局
                    console.warn('Timer callback: player hand is empty, forcing draw game');
                    await this.handleDrawGame();
                }
            } catch (e) {
                if (e.message !== 'CANCELLED') {
                    console.error('Timer callback error:', e);
                }
            }
        }, this.turnTimeout);
    }

    stopTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    /**
     * 记录历史
     */
    recordHistory(action, data) {
        this.gameHistory.push({ action, data, timestamp: Date.now(), round: this.round });
        // 防止内存无限增长
        if (this.gameHistory.length > 5000) {
            this.gameHistory = this.gameHistory.slice(-3000);
        }
    }

    /**
     * 获取当前状态
     */
    getState() {
        return {
            state: this.state,
            config: Utils.deepClone(this.config),
            currentPlayer: this.currentPlayerIndex,
            currentWind: this.currentWind,
            round: this.round,
            deckCount: this.deckCount,
            discardPile: this.discardPile.map(t => ({ ...t })),
            lastDiscard: this.lastDiscard ? { ...this.lastDiscard } : null,
            players: this.players.map(p => p.toJSON())
        };
    }

    /**
     * 销毁
     */
    destroy() {
        this.emit('beforeDestroy');
        this._token.cancel();
        // 注意：不立即替换 token，让正在执行的异步操作看到取消状态
        // 新 token 在 start() 中创建
        this.stopTimer();
        this.removeAllListeners();
        // 清理玩家监听器，防止内存泄漏
        if (this.players) {
            for (const p of this.players) {
                if (p && typeof p.removeAllListeners === 'function') p.removeAllListeners();
            }
        }
        this.pendingAction = null;
        this.currentPlayerIndex = 0;
        this.gameHistory = [];
        this.matchHistory = [];
        this.replayData = [];
        this.round = 1;
        this.currentWind = 0;
        this.lastDiscard = null;
        this.discardPile = [];
        this.players = [];
        this.deck = [];
        this._pendingActions = [];
        this.state = 'destroyed';
    }
}
