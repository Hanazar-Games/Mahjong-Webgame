/**
 * 万能麻将 - 主入口
 */

(function() {
    'use strict';

    // 全局状态
    const App = {
        engine: null,
        settings: null,
        stats: null,
        selectedTile: null,
        currentScreen: 'main-menu',
        network: null,
        anGangOptions: null
    };

    // 初始化
    function init() {
        loadSettings();
        loadStats();
        bindEvents();
        renderMahjongTypes();
        renderAchievements();
        renderReplays();
        
        // 初始化主题和动画级别
        applyTheme(App.settings.tableTheme);
        applyAnimationLevel(App.settings.animationLevel);
        
        // 初始化音频系统
        AudioManager.setupUserInteraction();
        AudioManager.setBgmVolume(App.settings.bgmVolume / 100);
        AudioManager.setSfxVolume(App.settings.sfxVolume / 100);
        
        // 隐藏加载画面
        setTimeout(() => {
            const loading = document.getElementById('loading-screen');
            if (loading) {
                loading.classList.add('hidden');
                setTimeout(() => loading.remove(), 600);
            }
        }, 1800);
        
        // 显示主菜单
        UIComponents.switchScreen('main-menu');
        
        console.log('🀄 万能麻将已加载');
    }

    /**
     * 加载设置
     */
    function loadSettings() {
        App.settings = Stats.getSettings();
        
        // 应用设置到UI
        const settingMap = {
            'player-name': App.settings.playerName,
            'ai-difficulty': App.settings.aiDifficulty,
            'table-theme': App.settings.tableTheme,
            'game-rounds': String(App.settings.gameRounds),
            'game-speed': App.settings.gameSpeed,
            'ui-density': App.settings.uiDensity,
            'bgm-volume': App.settings.bgmVolume,
            'sfx-volume': App.settings.sfxVolume,
            'sfx-enabled': App.settings.sfxEnabled,
            'bgm-style': App.settings.bgmStyle,
            'animation-level': App.settings.animationLevel,
            'opponent-display': App.settings.opponentDisplay,
            'table-zoom': App.settings.tableZoom,
            'hand-size': App.settings.handSize,
            'show-tile-names': App.settings.showTileNames,
            'auto-sort': App.settings.autoSort
        };
        
        for (const [id, value] of Object.entries(settingMap)) {
            const el = document.getElementById(id);
            if (el) {
                if (el.type === 'range') {
                    el.value = value;
                    const label = document.getElementById(id + '-value');
                    if (label) label.textContent = value + '%';
                } else {
                    el.value = value;
                }
            }
        }
    }

    /**
     * 加载统计数据
     */
    function loadStats() {
        App.stats = Stats.getStats();
        UIComponents.updateStatsPanel(App.stats);
    }

    /**
     * 绑定事件
     */
    function bindEvents() {
        // 菜单按钮
        document.querySelectorAll('.menu-btn').forEach(btn => {
            btn.addEventListener('click', handleMenuClick);
        });
        
        // 返回按钮
        document.querySelectorAll('.back-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                AudioManager.SFX.buttonClick();
                const screen = btn.dataset.screen;
                if (screen) UIComponents.switchScreen(screen);
            });
        });
        
        // 设置变更（仅主菜单中的设置元素）
        document.querySelectorAll('#main-menu input, #main-menu select').forEach(el => {
            el.addEventListener('change', handleSettingChange);
        });
        
        // 滑块实时更新
        document.querySelectorAll('#main-menu input[type="range"]').forEach(el => {
            el.addEventListener('input', handleSliderInput);
        });
        
        // 高级设置展开/收起
        const advancedToggle = document.getElementById('advanced-toggle');
        if (advancedToggle) {
            advancedToggle.addEventListener('click', () => {
                AudioManager.SFX.buttonClick();
                const content = document.getElementById('advanced-content');
                advancedToggle.classList.toggle('collapsed');
                content.classList.toggle('collapsed');
            });
        }
        
        // 重置统计
        document.getElementById('reset-stats')?.addEventListener('click', () => {
            AudioManager.SFX.buttonClick();
            handleResetStats();
        });
        
        // 游戏控制按钮
        document.getElementById('btn-menu')?.addEventListener('click', showIngameMenu);
        document.getElementById('btn-settings')?.addEventListener('click', () => {
            AudioManager.SFX.buttonClick();
            endGame();
        });
        document.getElementById('btn-exit')?.addEventListener('click', () => {
            AudioManager.SFX.buttonClick();
            if (confirm('确定要退出当前游戏吗？')) {
                endGame();
            }
        });
        
        // 游戏内菜单
        document.getElementById('btn-resume')?.addEventListener('click', () => {
            AudioManager.SFX.buttonClick();
            hideIngameMenu();
        });
        document.getElementById('btn-restart')?.addEventListener('click', () => {
            AudioManager.SFX.buttonClick();
            hideIngameMenu();
            restartGame();
        });
        document.getElementById('btn-exit-game')?.addEventListener('click', () => {
            AudioManager.SFX.buttonClick();
            hideIngameMenu();
            endGame();
        });
        
        // 操作按钮
        document.getElementById('btn-chi')?.addEventListener('click', () => { AudioManager.SFX.buttonClick(); handleAction('chi'); });
        document.getElementById('btn-peng')?.addEventListener('click', () => { AudioManager.SFX.buttonClick(); handleAction('peng'); });
        document.getElementById('btn-gang')?.addEventListener('click', () => { AudioManager.SFX.buttonClick(); handleAction('gang'); });
        document.getElementById('btn-hu')?.addEventListener('click', () => { AudioManager.SFX.buttonClick(); handleAction('hu'); });
        document.getElementById('btn-skip')?.addEventListener('click', () => { AudioManager.SFX.buttonClick(); handleAction('skip'); });
        
        // 自定义模式
        document.getElementById('start-custom')?.addEventListener('click', () => {
            AudioManager.SFX.buttonClick();
            startCustomGame();
        });
        
        // 键盘事件
        document.addEventListener('keydown', handleKeydown);
        
        // 触摸手势（移动端）
        initTouchGestures();
    }

    /**
     * 处理菜单点击
     */
    function handleMenuClick(e) {
        AudioManager.SFX.buttonClick();
        const btn = e.currentTarget;
        const mode = btn.dataset.mode;
        
        switch (mode) {
            case 'ai':
                startAIGame();
                break;
            case 'lan':
                UIComponents.switchScreen('network-lobby');
                initNetwork();
                break;
            case 'custom':
                UIComponents.switchScreen('custom-mode');
                break;
            case 'replay':
                UIComponents.switchScreen('replay-list');
                break;
            case 'achievements':
                UIComponents.switchScreen('achievements');
                break;
        }
    }

    /**
     * 开始AI对战
     */
    async function startAIGame() {
        const config = {
            mahjongType: App.settings.mahjongType || 'guangdong',
            playerCount: 4,
            aiDifficulty: App.settings.aiDifficulty,
            speed: App.settings.gameSpeed,
            maxRounds: parseInt(App.settings.gameRounds)
        };
        
        await startGame(config);
    }

    /**
     * 开始自定义游戏
     */
    async function startCustomGame() {
        const selectedType = document.querySelector('.mahjong-type-card.selected');
        if (!selectedType) {
            Utils.toast('请先选择一种麻将');
            return;
        }
        
        const type = selectedType.dataset.type;
        const config = {
            mahjongType: type,
            playerCount: Tiles.getConfig(type).playerCount,
            aiDifficulty: App.settings.aiDifficulty,
            speed: App.settings.gameSpeed,
            maxRounds: parseInt(App.settings.gameRounds)
        };
        
        await startGame(config);
    }

    /**
     * 开始游戏
     */
    async function startGame(config) {
        // 清理旧游戏
        if (App.engine) {
            App.engine.destroy();
        }
        
        // 创建引擎
        App.engine = new MahjongEngine(config);
        
        // 初始化玩家
        const playerConfigs = [
            { name: App.settings.playerName || '玩家', isAI: false }
        ];
        
        for (let i = 1; i < config.playerCount; i++) {
            const difficulties = ['简单AI', '普通AI', '困难AI', '专家AI'];
            const diffIndex = ['easy', 'normal', 'hard', 'expert'].indexOf(config.aiDifficulty);
            const name = config.playerCount === 3 
                ? ['下家', '上家'][i - 1]
                : ['下家', '对家', '上家'][i - 1];
            playerConfigs.push({ 
                name: `${difficulties[diffIndex]}-${name}`, 
                isAI: true 
            });
        }
        
        App.engine.initPlayers(playerConfigs);
        
        // 绑定引擎事件
        bindEngineEvents();
        
        // 切换到游戏界面（带过渡）
        UIComponents.switchScreen('game-screen');
        App.currentScreen = 'game-screen';
        
        // 更新玩家名称显示
        document.getElementById('self-name').textContent = App.settings.playerName || '玩家';
        
        // 牌桌入场动画
        const table = document.getElementById('game-table');
        if (table) {
            table.style.opacity = '0';
            table.style.transform = 'scale(0.9) rotateX(10deg)';
            setTimeout(() => {
                table.style.transition = 'opacity 0.6s ease, transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
                table.style.opacity = '1';
                table.style.transform = '';
            }, 100);
        }
        
        // 开始游戏
        await App.engine.start();
    }

    /**
     * 绑定引擎事件
     */
    function bindEngineEvents() {
        const engine = App.engine;
        
        engine.on('gameStart', (data) => {
            console.log('游戏开始', data);
            renderGameState();
            const typeName = Tiles.getConfig(engine.config.mahjongType)?.name || engine.config.mahjongType;
            Utils.toast(`${typeName} · 第${data.round}局`);
            AudioManager.SFX.gameStart();
            if (!AudioManager.isPlaying) {
                AudioManager.startBgm('calm');
            }
        });
        
        engine.on('tileDealt', (data) => {
            // 逐张发牌动画
            const position = getPositionName(data.playerIndex);
            const handEl = document.getElementById(`hand-${position}`);
            if (handEl && data.playerIndex === 0) {
                // 只有自己显示飞入动画
                const tileEl = UIComponents.createTileElement(data.tile, {
                    onClick: handleTileClick,
                    draggable: true,
                    onDragEnd: (t) => {
                        App.engine.playerDiscard(t.id);
                        enablePlayerActions(false);
                    }
                });
                tileEl.classList.add('tile-drawn');
                tileEl.style.animationDelay = '0s';
                handEl.appendChild(tileEl);
            }
            updateDeckCount(data.deckCount);
        });
        
        engine.on('tilesDealt', () => {
            renderGameState();
        });
        
        engine.on('turnStart', (data) => {
            updatePlayerHighlight(data.index);
            
            if (data.index === 0) {
                // 玩家回合：摸牌
                engine.playerDraw().then((result) => {
                    // 如果游戏已结束（流局等），不再启用操作
                    if (engine.state === 'ended') {
                        return;
                    }
                    if (!result || !result.ziMo) {
                        enablePlayerActions(true);
                        engine.startTimer();
                    }
                });
            }
        });
        
        engine.on('draw', (data) => {
            renderPlayerHand(data.index, data.player.handSize, true, data.tile?.id);
            updateDeckCount(data.deckCount);
            AudioManager.SFX.draw();
        });
        
        engine.on('discard', (data) => {
            renderDiscardPile(true);
            renderPlayerHand(data.player.position, data.player.handSize);
            AudioManager.SFX.discard();
        });
        
        engine.on('actionAvailable', (data) => {
            if (data.player.position === 0) {
                enableActionButtons(data.action);
                AudioManager.SFX.tick();
            }
        });
        
        engine.on('chi', (data) => {
            UIComponents.showActionEffect('吃');
            renderPlayerMelds(data.player.position);
            renderPlayerHand(data.player.position, data.player.handSize);
            AudioManager.SFX.chi();
            UIComponents.createParticles(window.innerWidth / 2, window.innerHeight / 2, { count: 8, color: '#4caf50' });
        });
        
        engine.on('peng', (data) => {
            UIComponents.showActionEffect('碰');
            renderPlayerMelds(data.player.position);
            renderPlayerHand(data.player.position, data.player.handSize);
            AudioManager.SFX.peng();
            UIComponents.createParticles(window.innerWidth / 2, window.innerHeight / 2, { count: 12, color: '#2196f3' });
        });
        
        engine.on('gang', (data) => {
            UIComponents.showActionEffect('杠');
            renderPlayerMelds(data.player.position);
            renderPlayerHand(data.player.position, data.player.handSize);
            AudioManager.SFX.gang();
            UIComponents.createParticles(window.innerWidth / 2, window.innerHeight / 2, { count: 30, color: '#ff9800', spread: 180, duration: 1200, type: 'star' });
            UIComponents.screenShake(5, 300);
        });
        
        engine.on('anGang', (data) => {
            UIComponents.showActionEffect('暗杠');
            renderPlayerMelds(data.player.position);
            renderPlayerHand(data.player.position, data.player.handSize);
            AudioManager.SFX.anGang();
            UIComponents.createParticles(window.innerWidth / 2, window.innerHeight / 2, { count: 16, color: '#9c27b0', spread: 120 });
        });
        
        engine.on('hu', (data) => {
            let effectText = data.isZiMo ? '自摸' : '胡';
            if (data.isGangShangKaiHua) {
                effectText = '杠上开花';
            }
            UIComponents.showActionEffect(effectText);
            showHuResult(data);
            UIComponents.showWinEffect(data.isZiMo);
            
            if (data.isZiMo) {
                AudioManager.SFX.ziMo();
                UIComponents.createConfetti({ count: 80 });
                UIComponents.createParticles(window.innerWidth / 2, window.innerHeight / 2, { count: 40, color: '#d4a843', spread: 250, duration: 1500, type: 'star' });
                UIComponents.screenShake(8, 600);
            } else {
                AudioManager.SFX.hu();
                UIComponents.createParticles(window.innerWidth / 2, window.innerHeight / 2, { count: 40, color: '#d4a843', spread: 220, duration: 1400, type: 'star' });
                UIComponents.screenShake(6, 400);
            }
        });
        
        engine.on('gameEnd', (data) => {
            showGameResult(data);
            saveGameResult(data);
            AudioManager.SFX.gameEnd(data.winner?.position === 0);
            AudioManager.stopBgm();
        });
        
        engine.on('drawGame', (data) => {
            Utils.toast('流局');
            AudioManager.SFX.drawGame();
        });
        
        engine.on('ziMo', (data) => {
            if (data.player.position === 0) {
                enableActionButtons({ type: 'hu' });
            }
        });
        
        engine.on('anGangOptions', (data) => {
            if (data.player.position === 0) {
                App.anGangOptions = data.options;
                enableActionButtons({ type: 'gang' });
            }
        });
        
        engine.on('needDiscard', (data) => {
            if (data.index === 0) {
                enablePlayerActions(true);
                Utils.toast('请打出一张牌');
                engine.startTimer();
            }
        });
        
        engine.on('turnTimeout', () => {
            Utils.toast('回合超时，自动打牌');
            AudioManager.SFX.warning();
        });
        
        engine.on('queYiMenSelected', (data) => {
            const suitNames = { wan: '万', tong: '筒', tiao: '条' };
            Utils.toast(`${data.player.name} 缺${suitNames[data.suit]}`);
        });
        
        engine.on('invalidHu', (data) => {
            if (data.reason === 'queYiMenNotComplete') {
                Utils.toast('胡牌失败：缺门花色未打完！');
                AudioManager.SFX.warning();
            }
        });
        
        engine.on('roundEnd', (data) => {
            console.log('一局结束', data);
            // 更新所有玩家分数显示
            for (let i = 0; i < engine.config.playerCount; i++) {
                updatePlayerScore(i, data.players[i].score);
            }
        });
    }

    /**
     * 渲染游戏状态
     */
    function renderGameState() {
        if (!App.engine) return;
        
        const state = App.engine.getState();
        
        // 渲染所有玩家
        for (let i = 0; i < App.engine.config.playerCount; i++) {
            renderPlayerHand(i, state.players[i].handSize);
            renderPlayerMelds(i);
            updatePlayerScore(i, state.players[i].score);
        }
        
        // 渲染弃牌堆
        renderDiscardPile();
        
        // 更新牌堆数量
        document.getElementById('deck-count').textContent = `剩余: ${state.deckCount}`;
        
        // 更新圈风
        const winds = ['东', '南', '西', '北'];
        document.getElementById('wind-indicator').textContent = winds[state.currentWind];
        document.getElementById('round-info').textContent = `${state.round}/${App.engine.config.maxRounds}局`;
    }

    /**
     * 渲染玩家手牌
     */
    function renderPlayerHand(playerIndex, handSize, animateLast = false, drawnTileId = null) {
        const handEl = document.getElementById(`hand-${getPositionName(playerIndex)}`);
        if (!handEl) return;
        
        handEl.innerHTML = '';
        
        const player = App.engine.players[playerIndex];
        const isSelf = playerIndex === 0;
        const displayMode = isSelf ? 'full' : App.settings.opponentDisplay;
        
        if (isSelf) {
            // 自己的牌：全部显示，可点击，支持拖拽
            player.hand.forEach((tile, index) => {
                const tileEl = UIComponents.createTileElement(tile, {
                    onClick: handleTileClick,
                    draggable: true,
                    onDragEnd: (t) => {
                        App.engine.playerDiscard(t.id);
                        enablePlayerActions(false);
                    }
                });
                // 摸牌动画：优先匹配drawnTileId（因为手牌会被排序，最后一张不一定是新摸的）
                if (animateLast && (drawnTileId ? tile.id === drawnTileId : index === player.hand.length - 1)) {
                    tileEl.classList.add('tile-drawn');
                }
                handEl.appendChild(tileEl);
            });
        } else if (displayMode === 'small') {
            // 小牌堆显示
            for (let i = 0; i < handSize; i++) {
                const tileEl = document.createElement('div');
                tileEl.className = 'mahjong-tile back';
                if (animateLast && i === handSize - 1) {
                    tileEl.classList.add('tile-drawn');
                }
                handEl.appendChild(tileEl);
            }
        } else if (displayMode === 'full') {
            // 完整显示对手手牌（旁观/调试模式）
            player.hand.forEach((tile, index) => {
                const tileEl = UIComponents.createTileElement(tile, { small: true });
                if (animateLast && index === player.hand.length - 1) {
                    tileEl.classList.add('tile-drawn');
                }
                handEl.appendChild(tileEl);
            });
        } else if (displayMode === 'hidden') {
            handEl.innerHTML = `<span style="color:var(--text-muted);font-size:0.8rem">${handSize}张</span>`;
        }
    }

    /**
     * 渲染玩家副露
     */
    function renderPlayerMelds(playerIndex) {
        const meldsEl = document.getElementById(`melds-${getPositionName(playerIndex)}`);
        if (!meldsEl) return;
        
        const player = App.engine.players[playerIndex];
        meldsEl.innerHTML = '';
        
        for (const meld of player.melds) {
            const group = document.createElement('div');
            group.className = 'meld-group';
            
            for (const tile of meld.tiles) {
                const tileEl = UIComponents.createTileElement(tile, { small: true });
                group.appendChild(tileEl);
            }
            
            meldsEl.appendChild(group);
        }
    }

    /**
     * 渲染弃牌堆
     */
    function renderDiscardPile(animateLast = true) {
        const pileEl = document.getElementById('discard-pile');
        if (!pileEl || !App.engine) return;
        
        pileEl.innerHTML = '';
        
        App.engine.discardPile.forEach((tile, index) => {
            const tileEl = UIComponents.createTileElement(tile, { small: true });
            if (animateLast && index === App.engine.discardPile.length - 1) {
                tileEl.classList.add('tile-discarded');
            }
            pileEl.appendChild(tileEl);
        });
        
        // 滚动到最新
        setTimeout(() => {
            pileEl.scrollTop = pileEl.scrollHeight;
        }, 50);
    }

    /**
     * 更新玩家分数
     */
    function updatePlayerScore(index, score) {
        const position = getPositionName(index);
        const scoreEl = document.querySelector(`#player-${position} .player-score`);
        if (scoreEl) scoreEl.textContent = score;
    }

    /**
     * 更新牌堆数量显示
     */
    function updateDeckCount(count) {
        const el = document.getElementById('deck-count');
        if (el) el.textContent = `剩余: ${count}`;
    }

    /**
     * 更新玩家高亮
     */
    function updatePlayerHighlight(index) {
        document.querySelectorAll('.player-area').forEach(el => {
            el.classList.remove('current-turn');
        });
        
        const position = getPositionName(index);
        const playerEl = document.getElementById(`player-${position}`);
        if (playerEl) playerEl.classList.add('current-turn');
    }

    /**
     * 获取位置名称
     */
    function getPositionName(index) {
        const count = App.engine?.config.playerCount || 4;
        if (count === 3) {
            return ['bottom', 'left', 'right'][index];
        }
        return ['bottom', 'right', 'top', 'left'][index];
    }

    /**
     * 处理牌点击
     */
    function handleTileClick(tile) {
        if (!App.engine || App.engine.state !== 'playing') return;
        if (App.engine.currentPlayerIndex !== 0) return;
        
        const selected = document.querySelector('.mahjong-tile.selected');
        
        if (selected) {
            const selectedId = selected.dataset.id;
            if (selectedId === tile.id) {
                // 双击或再次点击同一牌：打出
                App.engine.playerDiscard(tile.id);
                selected.classList.remove('selected');
                enablePlayerActions(false);
            } else {
                // 选择另一张牌
                AudioManager.SFX.selectTile();
                selected.classList.remove('selected');
                const targetEl = document.querySelector(`[data-id="${CSS.escape(tile.id)}"]`);
                if (targetEl) targetEl.classList.add('selected');
            }
        } else {
            // 选择牌
            AudioManager.SFX.selectTile();
            const targetEl = document.querySelector(`[data-id="${CSS.escape(tile.id)}"]`);
            if (targetEl) targetEl.classList.add('selected');
        }
    }

    /**
     * 处理操作
     */
    async function handleAction(type) {
        if (!App.engine) return;
        
        const engine = App.engine;
        const player = engine.players[0];
        
        switch (type) {
            case 'chi':
                if (engine.pendingAction?.action.type === 'chi') {
                    await engine.executeAction(player, engine.pendingAction.action);
                }
                break;
            case 'peng':
                if (engine.pendingAction?.action.type === 'peng') {
                    await engine.executeAction(player, engine.pendingAction.action);
                }
                break;
            case 'gang':
                if (engine.pendingAction?.action.type === 'gang') {
                    // 明杠（碰后加杠或别人打出杠）
                    await engine.executeAction(player, engine.pendingAction.action);
                } else if (App.anGangOptions && App.anGangOptions.length > 0) {
                    // 暗杠/加杠
                    await engine.executeAnGang(player, App.anGangOptions[0]);
                    App.anGangOptions = null;
                }
                break;
            case 'hu':
                // 优先检查自摸（手牌已包含摸到的牌）
                const selfWin = Rules.canWin(player.hand, engine.ruleConfig);
                if (selfWin.canWin) {
                    await engine.executeAction(player, { type: 'hu', winInfo: selfWin });
                } else if (engine.pendingAction?.action.type === 'hu' && engine.lastDiscard) {
                    // 点炮胡：必须通过pendingAction验证，防止利用过期lastDiscard作弊
                    await engine.executeAction(player, engine.pendingAction.action);
                }
                break;
            case 'skip':
                if (engine.pendingAction) {
                    await engine.skipAction();
                } else if (App.anGangOptions) {
                    // 跳过暗杠，继续打牌
                    App.anGangOptions = null;
                    disableActionButtons();
                    enablePlayerActions(true);
                } else if (engine.currentPlayerIndex === 0 && player.hand.length > engine.typeConfig.handSize) {
                    // 跳过自摸，允许继续打牌
                    enablePlayerActions(true);
                    engine.startTimer();
                }
                break;
        }
        
        disableActionButtons();
    }

    /**
     * 启用操作按钮（增量模式，允许多个按钮同时启用）
     */
    function enableActionButtons(action) {
        const buttonMap = {
            'chi': 'btn-chi',
            'peng': 'btn-peng',
            'gang': 'btn-gang',
            'an_gang': 'btn-gang',
            'hu': 'btn-hu'
        };
        
        const btnId = buttonMap[action.type];
        if (btnId) {
            const btn = document.getElementById(btnId);
            if (btn) btn.disabled = false;
        }
    }

    /**
     * 禁用操作按钮
     */
    function disableActionButtons() {
        ['btn-chi', 'btn-peng', 'btn-gang', 'btn-hu'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = true;
        });
    }

    /**
     * 启用/禁用玩家操作
     */
    function enablePlayerActions(enable) {
        const handEl = document.getElementById('hand-bottom');
        if (!handEl) return;
        
        handEl.querySelectorAll('.mahjong-tile').forEach(tile => {
            tile.style.pointerEvents = enable ? 'auto' : 'none';
            tile.style.opacity = enable ? '1' : '0.7';
        });
    }

    /**
     * 显示胡牌结果
     */
    function showHuResult(data) {
        const fanText = data.fan?.fans?.map(f => `${f.name} ${f.fan}番`).join('<br>') || '';
        let title = data.isZiMo ? '🎉 自摸!' : '🎉 胡牌!';
        if (data.isGangShangKaiHua) {
            title = '🎉 杠上开花!';
        }
        UIComponents.createModal(
            title,
            `<p><strong>${data.player.name}</strong> 胡牌</p>
             <p>得分: <strong style="color:var(--accent-gold)">+${data.score}</strong></p>
             <p style="font-size:0.85rem;color:var(--text-muted)">${fanText}</p>`,
            [{ text: '确定' }]
        );
    }

    /**
     * 显示游戏结果
     */
    function showGameResult(data) {
        const sorted = [...data.players].sort((a, b) => b.score - a.score);
        let resultHtml = '<div style="text-align:left;margin:10px 0">';
        
        sorted.forEach((p, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '•';
            resultHtml += `<div style="padding:6px 0;display:flex;justify-content:space-between">
                <span>${medal} ${p.name}</span>
                <span style="color:${p.score > 0 ? 'var(--win-color)' : 'var(--lose-color)'}">${p.score}</span>
            </div>`;
        });
        
        resultHtml += '</div>';
        
        const isWin = sorted[0].position === 0;
        
        UIComponents.createModal(
            isWin ? '🏆 胜利!' : '游戏结束',
            resultHtml,
            [
                { text: '再来一局', onClick: restartGame },
                { text: '返回主菜单', onClick: endGame }
            ]
        );
    }

    /**
     * 保存游戏结果
     */
    function saveGameResult(data) {
        const player = data.players.find(p => p.position === 0);
        const isWin = data.winner?.position === 0;
        
        // 从gameHistory统计自摸次数和最大番
        let ziMoCount = 0;
        let maxFan = 0;
        let hasQingYiSe = false;
        let winType = null;
        
        for (const entry of App.engine?.gameHistory || []) {
            if (entry.action === 'hu' && entry.data.playerId === 0) {
                if (entry.data.isZiMo) ziMoCount++;
                if (entry.data.fan) {
                    maxFan = Math.max(maxFan, entry.data.fan.total || 0);
                    if (entry.data.fan.fans?.some(f => f.name === '清一色')) {
                        hasQingYiSe = true;
                    }
                }
                if (entry.data.winType) winType = entry.data.winType;
            }
        }
        
        Stats.recordGame({
            isWin,
            score: player?.score || 0,
            fan: maxFan,
            mahjongType: App.engine?.config?.mahjongType || 'guangdong',
            rounds: App.engine?.round || 1,
            gangCount: player?.gangCount || 0,
            huCount: player?.isHu ? 1 : 0,
            ziMoCount,
            winType,
            hasQingYiSe
        });
        
        // 保存回放
        if (App.engine) {
            const replayData = Replay.createReplayData(App.engine);
            Replay.saveReplay(replayData);
            renderReplays();
        }
        
        loadStats();
    }

    /**
     * 重新开始
     */
    async function restartGame() {
        if (App.engine) {
            const config = { ...App.engine.config };
            App.engine.destroy();
            App.engine = null;
            AudioManager.stopBgm();
            await startGame(config);
        }
    }

    /**
     * 结束游戏
     */
    function endGame() {
        // 牌桌退场动画
        const table = document.getElementById('game-table');
        if (table) {
            table.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            table.style.opacity = '0';
            table.style.transform = 'scale(0.95) rotateX(5deg)';
        }
        
        setTimeout(() => {
            if (App.engine) {
                App.engine.destroy();
                App.engine = null;
            }
            AudioManager.stopBgm();
            UIComponents.switchScreen('main-menu');
            App.currentScreen = 'main-menu';
            
            if (table) {
                table.style.opacity = '';
                table.style.transform = '';
            }
        }, 400);
    }

    /**
     * 显示/隐藏游戏内菜单
     */
    function showIngameMenu() {
        document.getElementById('ingame-menu').classList.remove('hidden');
    }

    function hideIngameMenu() {
        document.getElementById('ingame-menu').classList.add('hidden');
    }

    /**
     * 渲染麻将种类选择
     */
    function renderMahjongTypes() {
        const container = document.getElementById('mahjong-types');
        if (!container) return;
        
        container.innerHTML = '';
        const types = Tiles.getMahjongTypes();
        
        for (const type of types) {
            const card = document.createElement('div');
            card.className = 'mahjong-type-card';
            card.dataset.type = type.key;
            card.innerHTML = `
                <div class="type-icon">${type.icon}</div>
                <div class="type-name">${type.name}</div>
                <div class="type-desc">${type.desc}</div>
            `;
            
            card.addEventListener('click', () => {
                AudioManager.SFX.buttonClick();
                container.querySelectorAll('.mahjong-type-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                renderRuleOptions(type.key);
            });
            
            container.appendChild(card);
        }
    }

    /**
     * 渲染规则选项
     */
    function renderRuleOptions(mahjongType) {
        const container = document.getElementById('rule-options');
        if (!container) return;
        
        const config = Tiles.getConfig(mahjongType);
        if (!config || !config.rules) {
            container.innerHTML = '';
            return;
        }
        
        const rules = config.rules;
        const ruleLabels = {
            allowChi: '允许吃牌',
            allowPeng: '允许碰牌',
            allowGang: '允许杠牌',
            allowAnGang: '允许暗杠',
            huaPai: '花牌计番',
            gangShangKaiHua: '杠上开花',
            qiangGang: '抢杠',
            haiDiLaoYue: '海底捞月',
            queYiMen: '缺一门',
            xueZhanDaoDi: '血战到底',
            ziMoJiaFan: '自摸加番',
            hunPai: '混儿牌',
            menQing: '门清',
            baoPai: '宝牌',
            maPai: '马牌',
            taiJi: '连庄',
            caiShen: '财神牌',
            zhaNiao: '扎鸟',
            jiangJiangHu: '将将胡',
            qiDui: '七对',
            huiEr: '带会儿',
            piaoHu: '飘胡',
            daPiao: '大飘',
            kaiKouFan: '开口翻',
            piHu: '屁胡',
            jinPai: '金牌',
            qiangJin: '抢金',
            jingPai: '精牌',
            chongGuan: '冲关',
            hongZhongLaiZi: '红中赖子'
        };
        
        container.innerHTML = '';
        
        for (const [key, value] of Object.entries(rules)) {
            if (typeof value !== 'boolean') continue;
            
            const label = ruleLabels[key] || key;
            const div = document.createElement('div');
            div.className = 'rule-option';
            div.innerHTML = `
                <label>${label}</label>
                <span style="color:${value ? 'var(--win-color)' : 'var(--text-muted)'}">${value ? '✓ 开启' : '✗ 关闭'}</span>
            `;
            container.appendChild(div);
        }
    }

    /**
     * 渲染成就
     */
    function renderAchievements() {
        const container = document.getElementById('achievements-grid');
        if (!container) return;
        
        container.innerHTML = '';
        const achievements = Stats.getAchievements();
        
        for (const ach of achievements) {
            container.appendChild(UIComponents.createAchievementCard(ach));
        }
    }

    /**
     * 渲染回放列表
     */
    function renderReplays() {
        const container = document.getElementById('replay-container');
        if (!container) return;
        
        const replays = Replay.getReplays();
        
        if (replays.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无历史对局</div>';
            return;
        }
        
        container.innerHTML = '';
        for (const replay of replays) {
            container.appendChild(UIComponents.createReplayItem(replay,
                (r) => Utils.toast('回放功能开发中...'),
                (r) => {
                    if (confirm('确定删除这条记录？')) {
                        Replay.deleteReplay(r.id);
                        renderReplays();
                    }
                }
            ));
        }
    }

    /**
     * 处理设置变更
     */
    function handleSettingChange(e) {
        const el = e.target;
        const key = el.id;
        let value = el.value;
        
        if (el.type === 'range') {
            value = parseInt(value);
        }
        
        if (el.type === 'number') {
            value = parseInt(value);
        }
        
        // 映射到settings对象
        const keyMap = {
            'player-name': 'playerName',
            'ai-difficulty': 'aiDifficulty',
            'table-theme': 'tableTheme',
            'game-rounds': 'gameRounds',
            'game-speed': 'gameSpeed',
            'ui-density': 'uiDensity',
            'bgm-volume': 'bgmVolume',
            'sfx-volume': 'sfxVolume',
            'sfx-enabled': 'sfxEnabled',
            'bgm-style': 'bgmStyle',
            'animation-level': 'animationLevel',
            'opponent-display': 'opponentDisplay',
            'table-zoom': 'tableZoom',
            'hand-size': 'handSize',
            'show-tile-names': 'showTileNames',
            'auto-sort': 'autoSort'
        };
        
        const settingKey = keyMap[key];
        if (settingKey) {
            App.settings[settingKey] = value;
            Stats.saveSettings(App.settings);
            
            // 实时应用某些设置
            if (key === 'table-theme') {
                applyTheme(value);
            }
            if (key === 'sfx-enabled') {
                const enabled = value === 'true' || value === true;
                AudioManager.setSfxEnabled(enabled);
                if (enabled) AudioManager.SFX.toggleSwitch();
            }
            if (key === 'bgm-style') {
                AudioManager.SFX.toggleSwitch();
                if (AudioManager.isPlaying) {
                    AudioManager.startBgm(value);
                }
            }
            if (key === 'animation-level') {
                applyAnimationLevel(value);
            }
        }
    }

    /**
     * 处理滑块输入
     */
    function handleSliderInput(e) {
        const el = e.target;
        const label = document.getElementById(el.id + '-value');
        if (label) {
            label.textContent = el.value + '%';
        }
        handleSettingChange(e);
        
        // 同步音频系统
        if (el.id === 'bgm-volume') {
            AudioManager.setBgmVolume(parseInt(el.value) / 100);
        }
        if (el.id === 'sfx-volume') {
            AudioManager.setSfxVolume(parseInt(el.value) / 100);
        }
    }

    /**
     * 应用动画级别
     */
    function applyAnimationLevel(level) {
        document.body.classList.remove('anim-minimal', 'anim-normal', 'anim-rich');
        if (level === 'minimal') {
            document.body.classList.add('anim-minimal');
        } else if (level === 'rich') {
            document.body.classList.add('anim-rich');
        } else {
            document.body.classList.add('anim-normal');
        }
    }

    /**
     * 应用主题
     */
    function applyTheme(theme) {
        const root = document.documentElement;
        
        const themes = {
            'classic-green': {
                '--bg-primary': '#1a3a1a',
                '--bg-secondary': '#2d5a2d',
                '--bg-card': '#3d6b3d',
                '--accent-gold': '#d4a843'
            },
            'dark-blue': {
                '--bg-primary': '#1a1a3a',
                '--bg-secondary': '#2d2d5a',
                '--bg-card': '#3d3d6b',
                '--accent-gold': '#6b9ed4'
            },
            'wood': {
                '--bg-primary': '#3a2a1a',
                '--bg-secondary': '#5a4a2d',
                '--bg-card': '#6b5a3d',
                '--accent-gold': '#c4a86b'
            },
            'red': {
                '--bg-primary': '#3a1a1a',
                '--bg-secondary': '#5a2d2d',
                '--bg-card': '#6b3d3d',
                '--accent-gold': '#d46b6b'
            }
        };
        
        const t = themes[theme] || themes['classic-green'];
        for (const [key, value] of Object.entries(t)) {
            root.style.setProperty(key, value);
        }
    }

    /**
     * 重置统计
     */
    function handleResetStats() {
        if (confirm('确定要重置所有统计数据吗？此操作不可恢复。')) {
            Stats.resetStats();
            loadStats();
            Utils.toast('统计数据已重置');
        }
    }

    /**
     * 初始化网络
     */
    function initNetwork() {
        if (!App.network) {
            App.network = new P2PNetwork();
        }
        
        // 搜索房间
        App.network.discoverRooms().then(rooms => {
            renderRoomList(rooms);
        });
        
        // 创建房间按钮
        document.getElementById('create-room')?.addEventListener('click', () => {
            AudioManager.SFX.buttonClick();
            const name = document.getElementById('room-name').value;
            const type = document.getElementById('room-mahjong-type').value;
            
            App.network.createRoom(name, type).then(room => {
                Utils.toast(`房间 ${name} 已创建`);
                // 等待玩家加入
            });
        });
    }

    /**
     * 渲染房间列表
     */
    function renderRoomList(rooms) {
        const list = document.getElementById('room-list');
        if (!list) return;
        
        if (rooms.length === 0) {
            list.innerHTML = '<div class="empty-state">暂无可用房间</div>';
            return;
        }
        
        list.innerHTML = '';
        for (const room of rooms) {
            list.appendChild(UIComponents.createRoomItem(room, (r) => {
                App.network.joinRoom(r.id).then(() => {
                    Utils.toast(`已加入房间 ${r.name}`);
                });
            }));
        }
    }

    /**
     * 键盘事件
     */
    function handleKeydown(e) {
        if (App.currentScreen !== 'game-screen') return;
        
        // 如果菜单已打开，ESC关闭菜单
        const menu = document.getElementById('ingame-menu');
        if (menu && !menu.classList.contains('hidden')) {
            if (e.key === 'Escape') {
                hideIngameMenu();
                e.preventDefault();
            }
            return;
        }
        
        switch (e.key) {
            case 'Escape':
                showIngameMenu();
                e.preventDefault();
                break;
            case '1': {
                const btn = document.getElementById('btn-chi');
                if (btn && !btn.disabled) handleAction('chi');
                break;
            }
            case '2': {
                const btn = document.getElementById('btn-peng');
                if (btn && !btn.disabled) handleAction('peng');
                break;
            }
            case '3': {
                const btn = document.getElementById('btn-gang');
                if (btn && !btn.disabled) handleAction('gang');
                break;
            }
            case '4':
            case ' ': {
                e.preventDefault();
                const btn = document.getElementById('btn-hu');
                if (btn && !btn.disabled) handleAction('hu');
                break;
            }
            case 's':
            case 'S':
                handleAction('skip');
                break;
        }
    }

    /**
     * 触摸手势
     */
    function initTouchGestures() {
        let touchStartY = 0;
        
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length === 0) return;
            touchStartY = e.touches[0].clientY;
        });
        
        document.addEventListener('touchend', (e) => {
            if (e.changedTouches.length === 0) return;
            const touchEndY = e.changedTouches[0].clientY;
            const diff = touchStartY - touchEndY;
            
            // 上滑显示菜单
            if (diff > 100 && App.currentScreen === 'game-screen') {
                showIngameMenu();
            }
        });
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
