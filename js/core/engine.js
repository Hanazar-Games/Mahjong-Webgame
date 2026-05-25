/**
 * 万能麻将 - 核心游戏引擎
 */

class MahjongEngine extends Utils.EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            mahjongType: config.mahjongType || 'guangdong',
            playerCount: config.playerCount || 4,
            targetScore: config.targetScore || 1000,
            aiDifficulty: config.aiDifficulty || 'normal',
            speed: config.speed || 'normal',
            maxRounds: config.maxRounds || 4,
            ...config
        };
        
        this.typeConfig = Tiles.getConfig(this.config.mahjongType);
        this.ruleConfig = this.typeConfig?.rules || {};
        
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
        this.replayData = [];
        this.timer = null;
        this.turnTimeout = 30000;
        
        this.speedMap = {
            slow: 2000,
            normal: 1000,
            fast: 400,
            instant: 0
        };
    }

    /**
     * 初始化玩家
     */
    initPlayers(playerConfigs) {
        this.players = [];
        for (let i = 0; i < this.config.playerCount; i++) {
            const cfg = playerConfigs[i] || { name: `玩家${i + 1}`, isAI: true };
            const player = new Player(i, cfg.name, cfg.isAI);
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
        // 确保轮次和风位已初始化（防止异常调用导致状态混乱）
        if (!this.round || this.round < 1) this.round = 1;
        if (this.currentWind === undefined || this.currentWind === null) this.currentWind = 0;
        
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
        this.gameHistory = [];
        this.replayData = [];
        
        // 发牌
        await this.dealTiles();
        
        // 设置庄家
        this.currentPlayerIndex = this.players.findIndex(p => p.isDealer);
        
        // 四川麻将：选择缺一门
        if (this.ruleConfig.queYiMen) {
            await this.selectQueYiMen();
        }
        
        this.state = 'playing';
        this.emit('dealComplete');
        
        // 开始第一回合
        await this.startTurn();
    }

    /**
     * 发牌
     */
    async dealTiles() {
        const handSize = this.typeConfig.handSize;
        const drawOrder = [];
        
        for (let i = 0; i < handSize; i++) {
            for (let p = 0; p < this.config.playerCount; p++) {
                drawOrder.push(p);
            }
        }
        
        for (let i = 0; i < drawOrder.length; i++) {
            const playerIndex = drawOrder[i];
            if (this.deck.length === 0) {
                console.error('Deck exhausted during deal');
                break;
            }
            const tile = this.deck.pop();
            this.deckCount = this.deck.length;
            this.players[playerIndex].draw(tile);
            
            // 逐张发牌动画事件
            this.emit('tileDealt', {
                playerIndex,
                tile,
                progress: (i + 1) / drawOrder.length,
                deckCount: this.deckCount
            });
            
            if (tile.isFlower && this.ruleConfig.huaPai) {
                await this.handleFlower(this.players[playerIndex]);
            }
            
            if (this.config.speed !== 'instant') {
                await Utils.sleep(30);
            }
        }
        
        this.emit('tilesDealt');
    }

    /**
     * 四川麻将：选择缺一门
     */
    async selectQueYiMen() {
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
                // AI选择数量最少的花色作为缺门
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
        return !player.hand.some(t => t.suit === player.queYiMen);
    }

    /**
     * 处理花牌
     * 使用while循环确保补花后摸到的花牌也能被处理
     */
    async handleFlower(player) {
        while (true) {
            const flower = player.hand.find(t => t.isFlower);
            if (!flower) break;
            
            player.hand = player.hand.filter(t => t.id !== flower.id);
            player.flowers.push(flower);
            this.emit('flower', { player: player.toJSON(), flower });
            
            if (this.deck.length > 0) {
                const replacement = this.deck.pop();
                this.deckCount = this.deck.length;
                player.draw(replacement);
                
                // 如果补的牌也是花牌，循环会继续处理
            }
            
            if (this.config.speed !== 'instant') {
                await Utils.sleep(250);
            }
        }
    }

    /**
     * 开始回合
     */
    async startTurn() {
        const player = this.players[this.currentPlayerIndex];
        
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
    }

    /**
     * 玩家摸牌
     */
    async playerDraw() {
        if (this.state !== 'playing') return null;
        
        const player = this.players[this.currentPlayerIndex];
        
        if (this.deck.length === 0) {
            await this.handleDrawGame();
            return null;
        }
        
        const tile = this.deck.pop();
        this.deckCount = this.deck.length;
        player.draw(tile);
        
        this.emit('draw', { player: player.toJSON(), tile, index: this.currentPlayerIndex, deckCount: this.deckCount });
        
        // 花牌补牌
        if (tile.isFlower && this.ruleConfig.huaPai) {
            await this.handleFlower(player);
        }
        
        // 检查自摸
        const winResult = Rules.canWin(player.hand, this.ruleConfig);
        if (winResult.canWin) {
            this.emit('ziMo', { player: player.toJSON(), winInfo: winResult });
            return { ziMo: true, winInfo: winResult };
        }
        
        // 检查暗杠
        const anGangOptions = Rules.canAnGang(player.hand, player.melds, this.ruleConfig);
        if (anGangOptions.length > 0) {
            this.emit('anGangOptions', { player: player.toJSON(), options: anGangOptions });
        }
        
        return { ziMo: false, anGangOptions };
    }

    /**
     * 玩家打牌
     */
    async playerDiscard(tileId) {
        if (this.state !== 'playing') return;
        this.stopTimer();
        
        const player = this.players[this.currentPlayerIndex];
        const tile = player.discard(tileId);
        
        if (!tile) {
            console.error('Invalid discard: tile not in hand', tileId);
            this.emit('error', { type: 'invalidDiscard', tileId });
            // 恢复计时器让玩家有机会重新选择
            this.startTimer();
            return;
        }
        
        this.lastDiscard = tile;
        this.discardPile.push(tile);
        
        this.recordHistory('discard', { playerId: player.id, tile: tile.id });
        this.emit('discard', { player: player.toJSON(), tile });
        
        // 等待其他玩家响应
        await this.waitForActions(tile);
    }

    /**
     * 等待其他玩家吃碰杠胡
     */
    async waitForActions(tile) {
        this.state = 'waiting';
        const actions = [];
        
        for (let i = 1; i < this.config.playerCount; i++) {
            const idx = (this.currentPlayerIndex + i) % this.config.playerCount;
            const player = this.players[idx];
            
            if (player.isHu) continue;
            
            const action = this.checkActions(player, tile, i === 1);
            if (action) {
                actions.push({ player, action, priority: this.getActionPriority(action.type) });
            }
        }
        
        if (actions.length === 0) {
            await this.nextTurn();
            return;
        }
        
        // 按优先级排序
        actions.sort((a, b) => b.priority - a.priority);
        const highestPriority = actions[0].priority;
        const topActions = actions.filter(a => a.priority === highestPriority);
        
        // 最高优先级中，按逆时针顺序
        const winner = topActions.sort((a, b) => {
            const distA = (a.player.position - this.currentPlayerIndex + this.config.playerCount) % this.config.playerCount;
            const distB = (b.player.position - this.currentPlayerIndex + this.config.playerCount) % this.config.playerCount;
            return distA - distB;
        })[0];
        
        this.pendingAction = winner;
        this.emit('actionAvailable', {
            player: winner.player.toJSON(),
            action: winner.action,
            tile
        });
        
        if (winner.player.isAI) {
            await Utils.sleep(this.speedMap[this.config.speed] * 0.5);
            await this.executeAction(winner.player, winner.action);
        } else {
            this.emit('playerAction', {
                player: winner.player.toJSON(),
                action: winner.action
            });
        }
    }

    /**
     * 检查玩家可以执行的操作
     */
    checkActions(player, tile, isNextPlayer) {
        // 胡
        const testHand = [...player.hand, tile];
        const winResult = Rules.canWin(testHand, this.ruleConfig);
        if (winResult.canWin) {
            return { type: 'hu', winInfo: winResult };
        }
        
        // 杠
        if (Rules.canGang(player.hand, tile, this.ruleConfig)) {
            return { type: 'gang' };
        }
        
        // 碰
        if (Rules.canPeng(player.hand, tile, this.ruleConfig)) {
            return { type: 'peng' };
        }
        
        // 吃（只有下家可以吃）
        if (isNextPlayer) {
            const chiOptions = Rules.canChi(player.hand, tile, this.ruleConfig);
            if (chiOptions.length > 0) {
                return { type: 'chi', options: chiOptions };
            }
        }
        
        return null;
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
        
        switch (action.type) {
            case 'chi':
                await this.executeChi(player, action);
                this.pendingAction = null;
                break;
            case 'peng':
                await this.executePeng(player, action);
                this.pendingAction = null;
                break;
            case 'gang':
                await this.executeGang(player, action);
                this.pendingAction = null;
                break;
            case 'hu':
                await this.executeHu(player, action);
                this.pendingAction = null;
                return;
        }
    }

    /**
     * 执行吃
     */
    async executeChi(player, action) {
        const chiTiles = action.options[0]; // 默认选择第一种吃法
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
        
        this.recordHistory('chi', { playerId: player.id, tiles: chiTiles.map(t => t.id), from: this.currentPlayerIndex });
        this.emit('chi', { player: player.toJSON(), tiles: chiTiles });
        
        this.currentPlayerIndex = player.position;
        this.state = 'playing';
        
        // 吃牌后需要打牌，不摸牌
        this.emit('needDiscard', { player: player.toJSON(), index: this.currentPlayerIndex });
        
        if (player.isAI) {
            await Utils.sleep(this.speedMap[this.config.speed] * 0.5);
            const tileToDiscard = AIPlayer.chooseDiscard(player, this.config.aiDifficulty);
            await this.playerDiscard(tileToDiscard.id);
        }
    }

    /**
     * 执行碰
     */
    async executePeng(player, action) {
        const discardTile = this.lastDiscard;
        
        // 从弃牌堆移除被碰的牌
        this.removeFromDiscardPile(discardTile);
        
        const sameTiles = player.hand.filter(t => Tiles.isSameTile(t, discardTile));
        const usedTiles = sameTiles.slice(0, 2);
        
        player.removeFromHand(usedTiles);
        player.addMeld({
            type: 'triplet',
            tiles: [...usedTiles, discardTile],
            from: this.currentPlayerIndex
        });
        
        this.recordHistory('peng', { playerId: player.id, tiles: [...usedTiles, discardTile].map(t => t.id), from: this.currentPlayerIndex });
        this.emit('peng', { player: player.toJSON(), tiles: [...usedTiles, discardTile] });
        
        this.currentPlayerIndex = player.position;
        this.state = 'playing';
        
        // 碰牌后需要打牌，不摸牌
        this.emit('needDiscard', { player: player.toJSON(), index: this.currentPlayerIndex });
        
        if (player.isAI) {
            await Utils.sleep(this.speedMap[this.config.speed] * 0.5);
            const tileToDiscard = AIPlayer.chooseDiscard(player, this.config.aiDifficulty);
            await this.playerDiscard(tileToDiscard.id);
        }
    }

    /**
     * 执行杠
     */
    async executeGang(player, action) {
        this.stopTimer();
        this.state = 'action';
        
        const discardTile = this.lastDiscard;
        
        // 从弃牌堆移除被杠的牌
        this.removeFromDiscardPile(discardTile);
        
        // 明杠只取3张手牌（防止手牌有4张时变成5张副露）
        const sameTiles = player.hand.filter(t => Tiles.isSameTile(t, discardTile)).slice(0, 3);
        
        player.removeFromHand(sameTiles);
        player.addMeld({
            type: 'gang',
            tiles: [...sameTiles, discardTile],
            from: this.currentPlayerIndex,
            isMingGang: true
        });
        player.gangCount++;
        
        this.recordHistory('gang', { playerId: player.id, tiles: [...sameTiles, discardTile].map(t => t.id), from: this.currentPlayerIndex });
        
        // 切换当前玩家为杠的人（必须在gangShangKaiHua检查之前，确保自摸判断正确）
        this.currentPlayerIndex = player.position;
        this.state = 'playing';
        
        // 杠后摸牌
        let gangTile = null;
        if (this.deck.length > 0) {
            gangTile = this.deck.pop();
            this.deckCount = this.deck.length;
            player.draw(gangTile);
            
            // 检查花牌（在emit draw之前处理，确保手牌正确）
            if (gangTile.isFlower && this.ruleConfig.huaPai) {
                await this.handleFlower(player);
            }
            
            // 先emit摸牌事件，确保UI手牌状态正确
            this.emit('draw', { player: player.toJSON(), tile: gangTile, fromGang: true, index: this.currentPlayerIndex, deckCount: this.deckCount });
        }
        
        // emit gang事件，确保UI副露状态正确
        this.emit('gang', { player: player.toJSON(), tiles: [...sameTiles, discardTile] });
        
        // 检查杠上开花
        const winResult = Rules.canWin(player.hand, this.ruleConfig);
        if (winResult.canWin) {
            await this.executeHu(player, { type: 'hu', winInfo: winResult, isGangShangKaiHua: true });
            return;
        }
        
        // 杠后已经摸过牌，直接要求打牌（不再走turnStart的摸牌流程）
        this.emit('needDiscard', { player: player.toJSON(), index: this.currentPlayerIndex });
        
        if (player.isAI) {
            await Utils.sleep(this.speedMap[this.config.speed] * 0.5);
            const tileToDiscard = AIPlayer.chooseDiscard(player, this.config.aiDifficulty);
            await this.playerDiscard(tileToDiscard.id);
        }
    }

    /**
     * 执行暗杠
     */
    async executeAnGang(player, option) {
        this.stopTimer();
        this.state = 'action';
        
        const wasAnGang = option.type === 'an_gang';
        
        if (wasAnGang) {
            player.removeFromHand(option.tiles);
            player.addMeld({
                type: 'gang',
                tiles: option.tiles,
                isAnGang: true
            });
            player.gangCount++;
            
            this.recordHistory('anGang', { playerId: player.id, tiles: option.tiles.map(t => t.id) });
        } else if (option.type === 'jia_gang') {
            player.removeFromHand([option.tile]);
            option.meld.type = 'gang';
            option.meld.tiles.push(option.tile);
            option.meld.isJiaGang = true;
            player.gangCount++;
            
            this.recordHistory('jiaGang', { playerId: player.id, meldId: option.meld.tiles[0].id });
        }
        
        // 杠后摸牌
        let gangTile = null;
        if (this.deck.length > 0) {
            gangTile = this.deck.pop();
            this.deckCount = this.deck.length;
            player.draw(gangTile);
            
            // 先处理花牌，确保手牌状态正确
            if (gangTile.isFlower && this.ruleConfig.huaPai) {
                await this.handleFlower(player);
            }
            
            // 先emit摸牌事件，确保UI手牌状态正确
            this.emit('draw', { player: player.toJSON(), tile: gangTile, fromGang: true, index: this.currentPlayerIndex, deckCount: this.deckCount });
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
            await this.executeHu(player, { type: 'hu', winInfo: winResult, isGangShangKaiHua: true });
            return { gangShangKaiHua: true };
        }
        
        // 暗杠后需要打牌
        this.emit('needDiscard', { player: player.toJSON(), index: this.currentPlayerIndex });
        
        if (player.isAI) {
            await Utils.sleep(this.speedMap[this.config.speed] * 0.5);
            const tileToDiscard = AIPlayer.chooseDiscard(player, this.config.aiDifficulty);
            await this.playerDiscard(tileToDiscard.id);
        }
        
        return { gangShangKaiHua: false };
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
            // 恢复游戏状态，防止卡住
            if (isZiMo) {
                this.state = 'playing';
                this.emit('needDiscard', { player: player.toJSON(), index: this.currentPlayerIndex });
            } else {
                this.state = 'playing';
                await this.nextTurn();
            }
            return;
        }
        
        // 标记玩家已胡
        player.isHu = true;
        
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
            gangCount: player.gangCount
        };
        
        const fanResult = Rules.calculateFan(
            isZiMo ? player.hand : [...player.hand, this.lastDiscard],
            player.melds,
            winInfo,
            this.ruleConfig,
            context
        );
        
        // 结算分数
        const baseScore = 1;
        const totalScore = baseScore * Math.pow(2, fanResult.total);
        
        if (isZiMo) {
            for (const p of this.players) {
                if (p.id !== player.id && !p.isHu) {
                    p.addScore(-totalScore);
                    player.addScore(totalScore);
                }
            }
        } else {
            const discardPlayer = this.players[this.currentPlayerIndex];
            discardPlayer.addScore(-totalScore);
            player.addScore(totalScore);
        }
        
        this.recordHistory('hu', {
            playerId: player.id,
            isZiMo,
            fan: fanResult,
            score: totalScore,
            winType: winInfo.type
        });
        
        this.emit('hu', {
            player: player.toJSON(),
            isZiMo,
            fan: fanResult,
            score: totalScore,
            hand: player.hand.map(t => t.id),
            winType: winInfo.type,
            isGangShangKaiHua: action.isGangShangKaiHua || false
        });
        
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
        this.state = 'ended';
        this.emit('roundEnd', {
            round: this.round,
            wind: this.currentWind,
            players: this.players.map(p => p.toJSON())
        });
        
        if (this.round >= this.config.maxRounds) {
            this.emit('gameEnd', {
                players: this.players.map(p => p.toJSON()),
                winner: this.getWinner()
            });
        } else {
            this.round++;
            this.currentWind = (this.currentWind + 1) % 4;
            
            // 轮换庄家
            const currentDealer = this.players.findIndex(p => p.isDealer);
            this.players[currentDealer].isDealer = false;
            this.players[(currentDealer + 1) % this.config.playerCount].isDealer = true;
            
            await Utils.sleep(1500);
            await this.start();
        }
    }

    /**
     * 下一回合
     */
    async nextTurn() {
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.config.playerCount;
        } while (this.players[this.currentPlayerIndex].isHu && !this.isRoundOver());
        
        if (this.isRoundOver()) {
            await this.endRound();
        } else {
            await this.startTurn();
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
        await Utils.sleep(this.speedMap[this.config.speed] * 0.8);
        
        // AI先摸牌
        const drawResult = await this.playerDraw();
        
        // 如果牌堆已空（流局），不再继续
        if (!drawResult) {
            return;
        }
        
        // 如果自摸了
        if (drawResult.ziMo) {
            await this.executeHu(player, { type: 'hu', winInfo: drawResult.winInfo });
            return;
        }
        
        // 检查暗杠
        if (drawResult.anGangOptions && drawResult.anGangOptions.length > 0) {
            const shouldGang = AIPlayer.shouldAnGang(player, drawResult.anGangOptions, this.config.aiDifficulty);
            if (shouldGang) {
                await this.executeAnGang(player, drawResult.anGangOptions[0]);
                // executeAnGang 内部已处理后续打牌
                return;
            }
        }
        
        // 打牌
        const tileToDiscard = AIPlayer.chooseDiscard(player, this.config.aiDifficulty);
        if (!tileToDiscard) {
            console.error('AI has no tile to discard');
            return;
        }
        await this.playerDiscard(tileToDiscard.id);
    }

    /**
     * 跳过操作
     */
    async skipAction() {
        if (this.pendingAction) {
            this.pendingAction = null;
            await this.nextTurn();
        }
    }

    /**
     * 设置超时计时器
     */
    startTimer() {
        this.stopTimer();
        if (this.config.speed === 'instant') return;
        
        this.timer = setTimeout(async () => {
            this.emit('turnTimeout', { player: this.players[this.currentPlayerIndex].toJSON() });
            // 自动打出一张牌
            const player = this.players[this.currentPlayerIndex];
            const tile = player.hand[0];
            if (tile) {
                await this.playerDiscard(tile.id);
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
        this.gameHistory.push({ action, data, timestamp: Date.now() });
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
            currentPlayer: this.currentPlayerIndex,
            currentWind: this.currentWind,
            round: this.round,
            deckCount: this.deckCount,
            discardPile: this.discardPile,
            lastDiscard: this.lastDiscard,
            players: this.players.map(p => p.toJSON())
        };
    }

    /**
     * 销毁
     */
    destroy() {
        this.stopTimer();
        this.removeAllListeners();
        this.players = [];
        this.deck = [];
        this.state = 'idle';
    }
}
