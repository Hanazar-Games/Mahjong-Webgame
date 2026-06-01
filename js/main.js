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
        currentScreen: 'main-menu',
        network: null,
        anGangOptions: null
    };

    // CSS.escape 兼容性回退（旧版 Safari/IE/部分安卓 WebView 不支持）
    function escapeCssSelector(str) {
        if (typeof str !== 'string') return '';
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
            return CSS.escape(str);
        }
        // 手动转义：仅处理 ID/类名选择器中最危险的字符
        return str.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\]^`{|}~])/g, '\\$1');
    }

    // 初始化
    function init() {
        loadSettings();
        loadStats();
        bindEvents();
        renderMahjongTypes();
        renderAchievements();
        renderReplays();
        
        // 初始化主题
        applyTheme(App.settings.tableTheme);
        
        // 初始化音频系统
        AudioManager.setupUserInteraction();
        AudioManager.setBgmVolume(App.settings.bgmVolume / 100);
        AudioManager.setSfxVolume(App.settings.sfxVolume / 100);
        AudioManager.setSfxEnabled(App.settings.sfxEnabled !== false);
        
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
            'bgm-volume': App.settings.bgmVolume,
            'sfx-volume': App.settings.sfxVolume,
            'sfx-enabled': App.settings.sfxEnabled,
            'bgm-style': App.settings.bgmStyle,

            'opponent-display': App.settings.opponentDisplay,
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
                } else if (el.type === 'checkbox') {
                    el.checked = !!value;
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
                // 网络大厅返回：如果在房间内先离开
                if (btn.id === 'network-lobby-back' && App.network?.roomId) {
                    App.network.leaveRoom().catch(() => {});
                    showLobbyContent();
                }
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
                if (!content) return;
                advancedToggle.classList.toggle('collapsed');
                content.classList.toggle('collapsed');
            });
        }
        
        // 重置统计
        document.getElementById('reset-stats')?.addEventListener('click', () => {
            AudioManager.SFX.buttonClick();
            handleResetStats();
        });
        
        // 设置弹窗
        document.getElementById('btn-open-settings')?.addEventListener('click', () => {
            AudioManager.SFX.buttonClick();
            showSettingsModal();
        });
        document.getElementById('settings-close')?.addEventListener('click', () => {
            AudioManager.SFX.buttonClick();
            hideSettingsModal();
        });
        document.getElementById('settings-modal')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                hideSettingsModal();
            }
        });
        
        // 游戏内暂停菜单
        document.getElementById('btn-menu')?.addEventListener('click', showIngameMenu);
        document.getElementById('btn-resume')?.addEventListener('click', () => {
            AudioManager.SFX.buttonClick();
            hideIngameMenu();
        });
        document.getElementById('btn-resume-main')?.addEventListener('click', () => {
            AudioManager.SFX.buttonClick();
            hideIngameMenu();
        });
        document.getElementById('btn-ingame-settings')?.addEventListener('click', () => {
            AudioManager.SFX.buttonClick();
            hideIngameMenu();
            showSettingsModal();
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
                App.currentScreen = 'game-screen';
                startAIGame();
                break;
            case 'lan':
                App.currentScreen = 'network-lobby';
                UIComponents.switchScreen('network-lobby');
                initNetwork();
                break;
            case 'custom':
                App.currentScreen = 'custom-mode';
                UIComponents.switchScreen('custom-mode');
                break;
            case 'replay':
                App.currentScreen = 'replay-list';
                UIComponents.switchScreen('replay-list');
                break;
            case 'achievements':
                App.currentScreen = 'achievements';
                UIComponents.switchScreen('achievements');
                break;
            case 'stats':
                App.currentScreen = 'stats-page';
                UIComponents.switchScreen('stats-page');
                renderStatsPage();
                break;
        }
    }

    /**
     * 开始AI对战
     */
    async function startAIGame() {
        const mahjongType = App.settings.mahjongType || 'guangdong';
        const typeConfig = Tiles.getConfig(mahjongType);
        const config = {
            mahjongType: mahjongType,
            playerCount: typeConfig?.playerCount || 4,
            aiDifficulty: App.settings.aiDifficulty,
            speed: App.settings.gameSpeed,
            maxRounds: Math.max(1, parseInt(App.settings.gameRounds) || 4),
            autoSort: App.settings.autoSort !== false
        };
        
        try {
            await startGame(config);
        } catch (e) {
            console.error('startQuickGame error:', e);
            Utils.toast('游戏启动失败');
        }
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
        const typeConfig = Tiles.getConfig(type);
        if (!typeConfig) {
            Utils.toast('无效的麻将种类');
            return;
        }
        const config = {
            mahjongType: type,
            playerCount: typeConfig.playerCount,
            aiDifficulty: App.settings.aiDifficulty,
            speed: App.settings.gameSpeed,
            maxRounds: Math.max(1, parseInt(App.settings.gameRounds) || 4),
            autoSort: App.settings.autoSort !== false
        };
        
        try {
            await startGame(config);
        } catch (e) {
            console.error('startCustomGame error:', e);
            Utils.toast('游戏启动失败');
        }
    }

    /**
     * 开始游戏
     */
    async function startGame(config) {
        // 清理旧游戏（先取消可能存在的退场动画，防止竞态销毁新引擎）
        if (App._endGameTimeout) {
            clearTimeout(App._endGameTimeout);
            App._endGameTimeout = null;
        }
        if (App.engine) {
            App.engine.destroy();
        }
        AudioManager.stopAllSfx();
        
        // 创建引擎
        App.engine = new MahjongEngine(config);
        
        // 初始化玩家
        const playerConfigs = [
            { name: App.settings.playerName || '玩家', isAI: false }
        ];
        
        for (let i = 1; i < config.playerCount; i++) {
            const difficulties = ['简单AI', '普通AI', '困难AI', '专家AI'];
            const diffIndex = ['easy', 'normal', 'hard', 'expert'].indexOf(config.aiDifficulty);
            const diffName = difficulties[diffIndex] || 'AI';
            const name = config.playerCount === 3 
                ? ['下家', '上家'][i - 1]
                : ['下家', '对家', '上家'][i - 1];
            playerConfigs.push({ 
                name: `${diffName}-${name || '对手'}`, 
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
        const selfNameEl = document.getElementById('self-name');
        if (selfNameEl) selfNameEl.textContent = App.settings.playerName || '玩家';
        
        // 根据人数调整座位布局 + 牌桌入场动画
        const table = document.getElementById('game-table');
        if (table) {
            table.classList.toggle('three-player', config.playerCount === 3);
            table.style.opacity = '0';
            table.style.transform = 'scale(0.9) rotateX(10deg)';
            if (App._tableEnterTimeout) clearTimeout(App._tableEnterTimeout);
            App._tableEnterTimeout = setTimeout(() => {
                App._tableEnterTimeout = null;
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
                AudioManager.startBgm(App.settings.bgmStyle || 'calm');
            }
        });
        
        engine.on('tileDealt', (data) => {
            // 只更新牌堆计数，不发牌动画到DOM（避免与tilesDealed的renderGameState竞态）
            updateDeckCount(data.deckCount);
        });
        
        engine.on('tilesDealt', () => {
            renderGameState();
        });
        
        engine.on('turnStart', (data) => {
            updatePlayerHighlight(data.index);
            
            if (data.index === 0) {
                // 本地玩家回合：摸牌
                engine.playerDraw().then((result) => {
                    // 防御引擎被销毁或替换的竞态
                    if (!App.engine || App.engine !== engine || engine.state !== 'playing') {
                        return;
                    }
                    if (!result || !result.ziMo) {
                        enablePlayerActions(true);
                        engine.startTimer();
                    }
                    // 联机模式：广播状态
                    if (App.isNetworkGame) broadcastGameState();
                }).catch(err => {
                    console.warn('playerDraw error:', err);
                });
            } else if (App.isNetworkGame) {
                // 联机模式下远程AI回合：广播状态让远程玩家可以观看
                broadcastGameState();
            }
        });
        
        engine.on('draw', (data) => {
            if (!data || !data.player) return;
            renderPlayerHand(data.index, data.player.handSize, true, data.tile?.id);
            updateDeckCount(data.deckCount);
            AudioManager.SFX.draw();
            if (App.isNetworkGame) broadcastGameState();
        });
        
        engine.on('discard', (data) => {
            if (!data || !data.player) return;
            renderDiscardPile(true);
            renderPlayerHand(data.player.position, data.player.handSize);
            AudioManager.SFX.discard();
            if (App.isNetworkGame) broadcastGameState();
        });
        
        engine.on('actionAvailable', (data) => {
            if (!data || !data.player) return;
            if (data.player.position === 0) {
                enableActionButtons(data.action);
                AudioManager.SFX.tick();
            }
        });
        
        engine.on('chi', (data) => {
            if (!data || !data.player) return;
            UIComponents.showActionEffect('吃');
            renderPlayerMelds(data.player.position);
            renderPlayerHand(data.player.position, data.player.handSize);
            AudioManager.SFX.chi();
            UIComponents.createParticles(window.innerWidth / 2, window.innerHeight / 2, { count: 8, color: '#4caf50' });
            if (App.isNetworkGame) broadcastGameState();
        });
        
        engine.on('peng', (data) => {
            if (!data || !data.player) return;
            UIComponents.showActionEffect('碰');
            renderPlayerMelds(data.player.position);
            renderPlayerHand(data.player.position, data.player.handSize);
            AudioManager.SFX.peng();
            UIComponents.createParticles(window.innerWidth / 2, window.innerHeight / 2, { count: 12, color: '#2196f3' });
            if (App.isNetworkGame) broadcastGameState();
        });
        
        engine.on('gang', (data) => {
            if (!data || !data.player) return;
            UIComponents.showActionEffect('杠');
            renderPlayerMelds(data.player.position);
            renderPlayerHand(data.player.position, data.player.handSize);
            AudioManager.SFX.gang();
            UIComponents.createParticles(window.innerWidth / 2, window.innerHeight / 2, { count: 30, color: '#ff9800', spread: 180, duration: 1200, type: 'star' });
            UIComponents.screenShake(5, 300);
            if (App.isNetworkGame) broadcastGameState();
        });
        
        engine.on('anGang', (data) => {
            if (!data || !data.player) return;
            UIComponents.showActionEffect('暗杠');
            renderPlayerMelds(data.player.position);
            renderPlayerHand(data.player.position, data.player.handSize);
            AudioManager.SFX.anGang();
            UIComponents.createParticles(window.innerWidth / 2, window.innerHeight / 2, { count: 16, color: '#9c27b0', spread: 120 });
            if (App.isNetworkGame) broadcastGameState();
        });
        
        engine.on('hu', (data) => {
            if (!data || !data.player) return;
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
            if (App.isNetworkGame) broadcastGameState();
        });
        
        engine.on('gameEnd', (data) => {
            showGameResult(data);
            saveGameResult(data);
            AudioManager.SFX.gameEnd(data.winner?.position === 0);
            AudioManager.stopBgm();
            App.isNetworkGame = false;
        });
        
        engine.on('drawGame', (data) => {
            Utils.toast('流局');
            AudioManager.SFX.drawGame();
            if (App.isNetworkGame) broadcastGameState();
        });
        
        engine.on('ziMo', (data) => {
            if (!data || !data.player) return;
            if (data.player.position === 0) {
                enableActionButtons({ type: 'hu' });
            }
        });
        
        engine.on('anGangOptions', (data) => {
            if (!data || !data.player) return;
            if (data.player.position === 0) {
                App.anGangOptions = data.options;
                enableActionButtons({ type: 'gang' });
            }
        });
        
        engine.on('needDiscard', (data) => {
            if (data.index === 0) {
                // 防御引擎被销毁的竞态
                if (!App.engine || App.engine !== engine || engine.state !== 'playing') {
                    return;
                }
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
            if (!data || !data.player) return;
            const suitNames = { wan: '万', tong: '筒', tiao: '条' };
            Utils.toast(`${Utils.escapeHtml(data.player.name)} 缺${suitNames[data.suit] || ''}`);
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
            if (!data || !data.players || data.players.length === 0) return;
            const playerCount = engine.config?.playerCount || 4;
            for (let i = 0; i < playerCount; i++) {
                const p = data.players[i];
                if (p) updatePlayerScore(i, p.score);
            }
            if (App.isNetworkGame) broadcastGameState();
        });
    }

    /**
     * 渲染游戏状态
     */

    /**
     * 处理牌点击
     */
    function handleTileClick(tile) {
        if (!App.engine || App.engine.state !== 'playing') return;
        if (App.engine.currentPlayerIndex !== 0) return;
        
        // 限定查询范围到手牌区域，避免选中副露区的牌
        const handEl = document.getElementById('hand-bottom');
        if (!handEl) return;
        const selected = handEl.querySelector('.mahjong-tile.selected');
        
        if (selected) {
            const selectedId = selected.dataset.id;
            if (selectedId === tile.id) {
                // 双击或再次点击同一牌：打出
                _doDiscard(tile.id);
                selected.classList.remove('selected');
                enablePlayerActions(false);
            } else {
                // 选择另一张牌
                AudioManager.SFX.selectTile();
                selected.classList.remove('selected');
                const targetEl = handEl.querySelector(`[data-id="${escapeCssSelector(tile.id)}"]`);
                if (targetEl) targetEl.classList.add('selected');
            }
        } else {
            // 选择牌
            AudioManager.SFX.selectTile();
            const targetEl = handEl.querySelector(`[data-id="${escapeCssSelector(tile.id)}"]`);
            if (targetEl) targetEl.classList.add('selected');
        }
    }

    async function _doDiscard(tileId) {
        try {
            if (!App.engine || App.engine.state !== 'playing') return;
            await App.engine.playerDiscard(tileId);
        } catch (e) {
            console.warn('playerDiscard error:', e);
        }
    }

    /**
     * 处理操作
     */
    async function handleAction(type) {
        if (!App.engine) return;
        if (App._actionPending) return;
        App._actionPending = true;
        
        const engine = App.engine;
        const player = engine.players[0];
        if (!player) {
            App._actionPending = false;
            return;
        }
        
        // 辅助：检查引擎是否仍有效且未被替换
        const engineStillValid = () => App.engine === engine && engine.state !== 'destroyed' && engine.state !== 'idle';
        
        try {
        switch (type) {
            case 'chi':
                if (engine.pendingAction?.action.type === 'chi' && engineStillValid()) {
                    await engine.executeAction(player, engine.pendingAction.action);
                }
                break;
            case 'peng':
                if (engine.pendingAction?.action.type === 'peng' && engineStillValid()) {
                    await engine.executeAction(player, engine.pendingAction.action);
                }
                break;
            case 'gang':
                if (engine.pendingAction?.action.type === 'gang' && engineStillValid()) {
                    // 明杠（碰后加杠或别人打出杠）
                    await engine.executeAction(player, engine.pendingAction.action);
                } else if (App.anGangOptions && App.anGangOptions.length > 0 && engineStillValid()) {
                    // 暗杠/加杠
                    await engine.executeAnGang(player, App.anGangOptions[0]);
                    App.anGangOptions = null;
                }
                break;
            case 'hu':
                // 优先检查自摸（手牌已包含摸到的牌）
                if (typeof Rules === 'undefined' || !Rules.canWin) {
                    console.error('Rules模块未加载');
                    break;
                }
                const selfWin = Rules.canWin(player.hand, engine.ruleConfig);
                if (selfWin && selfWin.canWin && engineStillValid()) {
                    await engine.executeAction(player, { type: 'hu', winInfo: selfWin });
                } else if (engine.pendingAction?.action.type === 'hu' && engine.lastDiscard && engineStillValid()) {
                    // 点炮胡：必须通过pendingAction验证，防止利用过期lastDiscard作弊
                    await engine.executeAction(player, engine.pendingAction.action);
                }
                break;
            case 'skip':
                if (engine.pendingAction && engineStillValid()) {
                    await engine.skipAction();
                } else if (App.anGangOptions) {
                    // 跳过暗杠，继续打牌
                    App.anGangOptions = null;
                    disableActionButtons();
                    enablePlayerActions(true);
                } else if (engine.currentPlayerIndex === 0 && player.hand?.length > (engine.typeConfig?.handSize || 13) && engineStillValid()) {
                    // 跳过自摸，允许继续打牌
                    enablePlayerActions(true);
                    engine.startTimer();
                }
                break;
        }
        } catch (e) {
            console.error('handleAction error:', e);
        } finally {
            disableActionButtons();
            App._actionPending = false;
        }
    }

    /**
     * 启用操作按钮（增量模式，允许多个按钮同时启用）
     */
    function enableActionButtons(action) {
        if (!action || !action.type) return;
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
            tile.classList.toggle('disabled', !enable);
        });
    }

    /**
     * 显示胡牌结果
     */
    function showHuResult(data) {
        const fans = Array.isArray(data.fan?.fans) ? data.fan.fans : [];
        const fanText = fans.map(f => `${Utils.escapeHtml(f.name)} ${f.fan}番`).join('<br>');
        let title = data.isZiMo ? '🎉 自摸!' : '🎉 胡牌!';
        if (data.isGangShangKaiHua) {
            title = '🎉 杠上开花!';
        }
        UIComponents.createModal(
            title,
            `<p><strong>${Utils.escapeHtml(data.player?.name)}</strong> 胡牌</p>
             <p>得分: <strong style="color:var(--accent-gold)">+${data.score || 0}</strong></p>
             <p style="font-size:0.85rem;color:var(--text-muted)">${fanText}</p>`,
            [{ text: '确定' }]
        );
    }

    /**
     * 显示游戏结果
     */
    function showGameResult(data) {
        if (!data.players || data.players.length === 0) return;
        const sorted = [...data.players].sort((a, b) => b.score - a.score);
        const targetScore = App.engine?.config?.targetScore ?? 1000;
        const selfPlayer = sorted.find(p => p.position === 0);
        const isWin = sorted[0]?.position === 0;
        const netScore = (selfPlayer?.score || 0) - targetScore;
        
        // 渲染结算页
        const resultScreen = document.getElementById('game-result');
        if (!resultScreen) return;
        
        // 图标和标题
        const iconEl = document.getElementById('result-icon');
        const titleEl = document.getElementById('result-title');
        const subtitleEl = document.getElementById('result-subtitle');
        
        if (iconEl) iconEl.textContent = isWin ? '🏆' : '🎭';
        if (titleEl) {
            titleEl.textContent = isWin ? '胜利' : '对局结束';
            titleEl.className = 'result-title ' + (isWin ? 'win' : 'lose');
        }
        if (subtitleEl) {
            const sign = netScore >= 0 ? '+' : '';
            subtitleEl.textContent = `净胜 ${sign}${netScore} 分`;
        }
        
        // 渲染玩家列表
        const playersEl = document.getElementById('result-players');
        if (playersEl) {
            playersEl.innerHTML = sorted.map((p, i) => {
                const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
                const rankText = i + 1;
                const pNet = (p.score || 0) - targetScore;
                const scoreClass = pNet >= 0 ? 'positive' : 'negative';
                const scoreSign = pNet >= 0 ? '+' : '';
                const avatar = p.isAI ? '🤖' : '👤';
                return `
                    <div class="result-player-row ${p.position === 0 ? 'winner' : ''}">
                        <div class="result-rank ${rankClass}">${rankText}</div>
                        <div class="result-p-avatar">${avatar}</div>
                        <div class="result-p-name">${Utils.escapeHtml(p.name)}</div>
                        <div class="result-p-score ${scoreClass}">${scoreSign}${pNet}</div>
                    </div>
                `;
            }).join('');
        }
        
        // 渲染奖励（经验）
        const rewardsEl = document.getElementById('result-rewards');
        if (rewardsEl) {
            const expGain = isWin ? 20 + (data.fan || 0) * 2 : 5;
            rewardsEl.innerHTML = `
                <div class="result-reward-chip">✨ +${expGain} EXP</div>
            `;
        }
        
        // 绑定按钮（使用 cloneNode 彻底移除旧监听器，避免闭包累积）
        const restartBtn = document.getElementById('btn-result-restart');
        const exitBtn = document.getElementById('btn-result-exit');
        if (restartBtn) {
            const newRestart = restartBtn.cloneNode(true);
            restartBtn.parentNode.replaceChild(newRestart, restartBtn);
            newRestart.addEventListener('click', () => {
                AudioManager.SFX.buttonClick();
                restartGame();
            });
        }
        if (exitBtn) {
            const newExit = exitBtn.cloneNode(true);
            exitBtn.parentNode.replaceChild(newExit, exitBtn);
            newExit.addEventListener('click', () => {
                AudioManager.SFX.buttonClick();
                endGame();
            });
        }
        
        // 切换到结算页
        UIComponents.switchScreen('game-result');
    }

    /**
     * 保存游戏结果
     * 
     * 语义说明：
     * - finalScore: 玩家最终总分（含初始 targetScore，如 1200）
     * - netScore: 净胜分 = finalScore - targetScore（如 +200）
     * - wonRounds: 玩家在这场比赛中赢的局数
     */
    function saveGameResult(data) {
        if (!data.players || data.players.length === 0) return;
        const player = data.players.find(p => p.position === 0);
        const isWin = data.winner?.position === 0;
        
        const targetScore = App.engine?.config?.targetScore || 1000;
        const finalScore = player?.score || 0;
        const netScore = finalScore - targetScore;
        const totalRounds = App.engine?.round || 1;
        
        // 从所有对局历史统计（matchHistory 包含已完成的所有局，gameHistory 可能包含当前未结束的局）
        const allHistory = [];
        for (const round of (App.engine?.matchHistory || [])) {
            if (round.history) allHistory.push(...round.history);
        }
        if (App.engine?.gameHistory?.length > 0) {
            allHistory.push(...App.engine.gameHistory);
        }

        let ziMoCount = 0;
        let huCount = 0;
        let maxFan = 0;
        let hasQingYiSe = false;
        let winType = null;
        let wonRounds = 0;
        const seenRounds = new Set();

        for (const entry of allHistory) {
            if (!entry || !entry.data) continue;

            if (entry.action === 'hu' && entry.data.playerId === player?.id) {
                huCount++;
                if (entry.data.isZiMo) ziMoCount++;
                if (entry.data.fan) {
                    maxFan = Math.max(maxFan, entry.data.fan.total || 0);
                    if (entry.data.fan.fans?.some(f => f.name === '清一色')) {
                        hasQingYiSe = true;
                    }
                }
                if (entry.data.winType) winType = entry.data.winType;
                // 按 round 去重统计赢的局数
                if (entry.round && !seenRounds.has(entry.round)) {
                    seenRounds.add(entry.round);
                    wonRounds++;
                }
            }
        }

        // 如果没有 round 标记，退化为：有胡就算赢1局
        if (wonRounds === 0 && huCount > 0) wonRounds = 1;
        
        let result;
        try {
            result = Stats.recordGame({
                isWin,
                finalScore,
                netScore,
                fan: maxFan,
                mahjongType: App.engine?.config?.mahjongType || 'guangdong',
                rounds: totalRounds,
                wonRounds,
                gangCount: player?.gangCount || 0,
                huCount,
                ziMoCount,
                winType,
                hasQingYiSe
            });
        } catch (e) {
            console.error('保存游戏结果失败:', e);
            Utils.toast('保存结果失败: ' + e.message);
            result = null;
        }
        
        // 显示升级和成就解锁提示
        if (result.levelResult?.levelsGained > 0) {
            Utils.toast(`🎉 升级到 Lv.${result.levelResult.newLevel}！`, 3000);
        }
        if (result.newlyUnlocked?.length > 0) {
            for (const ach of result.newlyUnlocked) {
                Utils.toast(`🏆 解锁成就「${ach.name}」：${ach.desc}`, 4000);
                UIComponents.flashAchievement?.(ach);
            }
        }
        
        // 保存回放
        if (App.engine) {
            try {
                const replayData = Replay.createReplayData(App.engine);
                Replay.saveReplay(replayData);
                renderReplays();
            } catch (e) {
                console.error('保存回放失败:', e);
            }
        }
        
        loadStats();
    }

    /**
     * 重新开始
     */
    async function restartGame() {
        // 清理所有可能残留的timeout，防止竞态腐蚀新游戏
        if (App._endGameTimeout) { clearTimeout(App._endGameTimeout); App._endGameTimeout = null; }
        if (App._tableEnterTimeout) { clearTimeout(App._tableEnterTimeout); App._tableEnterTimeout = null; }
        if (App._discardScrollTimeout) { clearTimeout(App._discardScrollTimeout); App._discardScrollTimeout = null; }
        
        if (App.engine) {
            try {
                const config = { ...App.engine.config };
                App.engine.destroy();
                App.engine = null;
                App.anGangOptions = null;
                AudioManager.stopBgm();
                AudioManager.stopAllSfx();
                await startGame(config);
            } catch (e) {
                console.error('重新开始游戏失败:', e);
                Utils.toast('游戏启动失败，请返回主菜单');
            }
        }
    }

    /**
     * 结束游戏
     */
    function endGame() {
        // 取消可能存在的入场动画timeout
        if (App._tableEnterTimeout) {
            clearTimeout(App._tableEnterTimeout);
            App._tableEnterTimeout = null;
        }
        // 取消可能存在的退场动画timeout
        if (App._endGameTimeout) {
            clearTimeout(App._endGameTimeout);
            App._endGameTimeout = null;
        }
        // 清理过时的杠选项
        App.anGangOptions = null;
        App.isNetworkGame = false;
        
        // 立即销毁引擎（不延迟），避免竞态
        if (App.engine) {
            App.engine.destroy();
            App.engine = null;
        }
        AudioManager.stopBgm();
        AudioManager.stopAllSfx();
        
        // 牌桌退场动画
        const table = document.getElementById('game-table');
        if (table) {
            table.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            table.style.opacity = '0';
            table.style.transform = 'scale(0.95) rotateX(5deg)';
        }
        
        App._endGameTimeout = setTimeout(() => {
            App._endGameTimeout = null;
            UIComponents.switchScreen('main-menu');
            App.currentScreen = 'main-menu';
            
            if (table) {
                table.style.opacity = '';
                table.style.transform = '';
            }
        }, 400);
    }

    /**
     * 显示/隐藏设置弹窗
     */
    /**
     * 键盘事件
     */
    function handleKeydown(e) {
        if (App.currentScreen !== 'game-screen') return;
        if (!App.engine) return;
        
        // 忽略重复按键（长按不触发）
        if (e.repeat) return;
        
        // 忽略输入法/文本框/下拉框中的按键
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable)) {
            return;
        }
        
        // 忽略带修饰键的按键（防止阻止Ctrl+S等浏览器快捷键）
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        
        // 如果有模态框打开，忽略游戏快捷键（ESC除外）
        const hasModal = document.querySelector('.modal');
        if (hasModal && e.key !== 'Escape') return;
        
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
                e.preventDefault();
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
        }, { passive: true });
        
        document.addEventListener('touchend', (e) => {
            if (e.changedTouches.length === 0) return;
            const touchEndY = e.changedTouches[0].clientY;
            const diff = touchStartY - touchEndY;
            
            // 上滑显示菜单
            if (diff > 100 && App.currentScreen === 'game-screen') {
                showIngameMenu();
            }
            touchStartY = 0;
        }, { passive: true });
        
        document.addEventListener('touchcancel', () => {
            touchStartY = 0;
        }, { passive: true });
    }

    // 暴露全局引用供拆分模块使用
    window.App = App;
    window.handleTileClick = handleTileClick;
    window._doDiscard = _doDiscard;
    window.enablePlayerActions = enablePlayerActions;
    window.bindEngineEvents = bindEngineEvents;
    window.escapeCssSelector = escapeCssSelector;
    window.showIngameMenu = showIngameMenu;
    window.hideIngameMenu = hideIngameMenu;
    window.showHuResult = showHuResult;
    window.showGameResult = showGameResult;
    window.disableActionButtons = disableActionButtons;
    window.enableActionButtons = enableActionButtons;
    window.saveGameResult = saveGameResult;
    window.restartGame = restartGame;
    window.endGame = endGame;
    window.startGame = startGame;
    window.loadStats = loadStats;

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
