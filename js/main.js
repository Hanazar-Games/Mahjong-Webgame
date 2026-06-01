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
    function renderGameState() {
        if (!App.engine) return;
        
        const state = App.engine.getState();
        
        // 渲染所有玩家
        for (let i = 0; i < App.engine.config.playerCount; i++) {
            if (!state.players[i]) continue;
            renderPlayerHand(i, state.players[i].handSize);
            renderPlayerMelds(i);
            updatePlayerScore(i, state.players[i].score);
        }
        
        // 渲染弃牌堆
        renderDiscardPile(false);
        
        // 更新牌堆数量
        const deckCountEl = document.getElementById('deck-count');
        if (deckCountEl) deckCountEl.textContent = `剩余: ${state.deckCount}`;
        
        // 更新圈风
        const winds = ['东', '南', '西', '北'];
        const windEl = document.getElementById('wind-indicator');
        if (windEl) windEl.textContent = winds[state.currentWind];
        const roundEl = document.getElementById('round-info');
        if (roundEl) roundEl.textContent = `${state.round ?? 1}/${App.engine.config?.maxRounds ?? 1}局`;
    }

    /**
     * 渲染玩家手牌
     */
    function renderPlayerHand(playerIndex, handSize, animateLast = false, drawnTileId = null) {
        const handEl = document.getElementById(`hand-${getPositionName(playerIndex)}`);
        if (!handEl || !App.engine) return;
        
        // 保存自己的选中状态
        const isSelf = playerIndex === 0;
        const selectedId = isSelf ? handEl.querySelector('.mahjong-tile.selected')?.dataset.id : null;
        
        handEl.innerHTML = '';
        
        const player = App.engine.players[playerIndex];
        if (!player) return;
        const displayMode = isSelf ? 'full' : App.settings.opponentDisplay;
        
        if (isSelf) {
            // 自己的牌：全部显示，可点击，支持拖拽
            if (!player.hand) return;
            player.hand.forEach((tile, index) => {
                const tileEl = UIComponents.createTileElement(tile, {
                    onClick: handleTileClick,
                    draggable: true,
                    showName: App.settings.showTileNames,
                    onDragEnd: (t) => {
                        if (!App.engine || App.engine.state !== 'playing') return;
                        _doDiscard(t.id);
                        enablePlayerActions(false);
                    }
                });
                // 摸牌动画：优先匹配drawnTileId（因为手牌会被排序，最后一张不一定是新摸的）
                if (animateLast && (drawnTileId ? tile.id === drawnTileId : index === player.hand.length - 1)) {
                    tileEl.classList.add('tile-drawn');
                }
                handEl.appendChild(tileEl);
            });
            // 根据当前游戏状态自动设置禁用状态，防止re-render后丢失
            const engine = App.engine;
            const shouldDisable = !engine || engine.currentPlayerIndex !== 0 || engine.state !== 'playing';
            handEl.querySelectorAll('.mahjong-tile').forEach(tile => {
                tile.classList.toggle('disabled', shouldDisable);
                // 恢复之前选中的牌
                if (selectedId && tile.dataset.id === selectedId) {
                    tile.classList.add('selected');
                }
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
            if (!player.hand) return;
            player.hand.forEach((tile, index) => {
                const tileEl = UIComponents.createTileElement(tile, { small: true, showName: App.settings.showTileNames });
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
        if (!meldsEl || !App.engine) return;
        
        const player = App.engine.players[playerIndex];
        if (!player) return;
        meldsEl.innerHTML = '';
        
        if (!player.melds) return;
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
        
        (App.engine.discardPile || []).forEach((tile, index) => {
            const tileEl = UIComponents.createTileElement(tile, { small: true });
            // 只在真正的新牌丢弃时添加动画，避免re-render时重复动画
            if (animateLast && index === App.engine.discardPile.length - 1) {
                tileEl.classList.add('tile-discarded');
            }
            pileEl.appendChild(tileEl);
        });
        
        // 滚动到最新（如果之前有timeout则取消）
        if (App._discardScrollTimeout) clearTimeout(App._discardScrollTimeout);
        App._discardScrollTimeout = setTimeout(() => {
            App._discardScrollTimeout = null;
            pileEl.scrollTop = pileEl.scrollHeight;
        }, 50);
    }

    /**
     * 更新玩家分数
     */
    function updatePlayerScore(index, score) {
        const position = getPositionName(index);
        const scoreEl = document.querySelector(`#player-${position} .player-score`);
        if (scoreEl) scoreEl.textContent = score ?? '—';
    }

    /**
     * 更新牌堆数量显示
     */
    function updateDeckCount(count) {
        const el = document.getElementById('deck-count');
        if (el) el.textContent = `剩余: ${count ?? 0}`;
    }

    /**
     * 更新玩家高亮
     */
    function updatePlayerHighlight(index) {
        document.querySelectorAll('.player-area').forEach(el => {
            el.classList.remove('current-turn');
        });
        document.querySelectorAll('.turn-indicator').forEach(el => {
            el.classList.remove('active');
        });
        
        const position = getPositionName(index);
        const playerEl = document.getElementById(`player-${position}`);
        if (playerEl) playerEl.classList.add('current-turn');
        
        const turnEl = document.getElementById(`turn-${position}`);
        if (turnEl) turnEl.classList.add('active');
    }

    /**
     * 获取位置名称
     */
    function getPositionName(index) {
        const count = App.engine?.config?.playerCount ?? 4;
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
    function showSettingsModal() {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.classList.remove('hidden');
    }

    function hideSettingsModal() {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.classList.add('hidden');
        // 保存设置
        saveAllSettings();
    }

    /**
     * 保存所有设置
     */
    function saveAllSettings() {
        const fields = {
            'player-name': 'playerName',
            'ai-difficulty': 'aiDifficulty',
            'table-theme': 'tableTheme',
            'game-rounds': 'gameRounds',
            'game-speed': 'gameSpeed',

            'opponent-display': 'opponentDisplay',
            'sfx-enabled': 'sfxEnabled',
            'bgm-style': 'bgmStyle',
            'show-tile-names': 'showTileNames',
            'auto-sort': 'autoSort',
            'bgm-volume': 'bgmVolume',
            'sfx-volume': 'sfxVolume'
        };
        for (const [id, key] of Object.entries(fields)) {
            const el = document.getElementById(id);
            if (!el) continue;
            let value = el.value;
            if (el.type === 'checkbox') value = el.checked;
            else if (el.type === 'range') value = parseInt(value);
            else if (value === 'true' || value === 'false') value = value === 'true';
            App.settings[key] = value;
        }
        Stats.saveSettings(App.settings);
    }

    /**
     * 显示/隐藏游戏内菜单
     */
    let _wasTimerRunning = false;

    function showIngameMenu() {
        const menu = document.getElementById('ingame-menu');
        if (menu) menu.classList.remove('hidden');
        // 暂停回合计时器，防止玩家在菜单打开时被自动出牌
        _wasTimerRunning = !!(App.engine?.timer);
        App.engine?.stopTimer();
    }

    function hideIngameMenu() {
        const menu = document.getElementById('ingame-menu');
        if (menu) menu.classList.add('hidden');
        // 恢复回合计时器（仅当暂停前计时器在运行、且仍是玩家回合时）
        if (_wasTimerRunning && App.engine && App.engine.state === 'playing') {
            const player = App.engine.players[App.engine.currentPlayerIndex];
            if (player && !player.isAI) {
                App.engine.startTimer();
            }
        }
        _wasTimerRunning = false;
    }

    /**
     * 显示动作反馈文字
     */
    let _actionFeedbackTimer = null;

    function showActionFeedback(text, duration = 800) {
        const el = document.getElementById('action-feedback');
        if (!el) return;
        if (_actionFeedbackTimer) {
            clearTimeout(_actionFeedbackTimer);
            _actionFeedbackTimer = null;
        }
        el.textContent = text;
        el.classList.add('show');
        _actionFeedbackTimer = setTimeout(() => {
            _actionFeedbackTimer = null;
            el.classList.remove('show');
        }, duration);
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
                <div class="type-icon">${Utils.escapeHtml(type.icon)}</div>
                <div class="type-name">${Utils.escapeHtml(type.name)}</div>
                <div class="type-desc">${Utils.escapeHtml(type.desc)}</div>
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
     * 渲染战绩页
     */
    function renderStatsPage() {
        const container = document.getElementById('stats-page-content');
        if (!container) return;

        const summary = Stats.getMatchSummary();
        const level = Stats.getLevelProgress();
        const achievements = Stats.getAchievements();
        const unlockedCount = achievements.filter(a => a.unlocked).length;

        // 等级卡片
        const levelCard = `
            <div class="stats-card level-card">
                <div class="level-header">
                    <div class="level-big">Lv.${level.level}</div>
                    <div class="level-exp-detail">
                        <span>${level.currentExp} / ${level.nextLevelExp} EXP</span>
                        <span class="level-percent">${level.percent}%</span>
                    </div>
                </div>
                <div class="exp-bar-large">
                    <div class="exp-fill-large" style="width:${level.percent}%"></div>
                </div>
                <div class="level-hint">累计获得 ${level.totalExpEarned} 点经验 · 再赢 ${Math.ceil((level.nextLevelExp - level.currentExp) / 20)} 场即可升级</div>
            </div>
        `;

        // 概览卡片
        const overviewCard = `
            <div class="stats-card overview-card">
                <h3>📊 战绩概览</h3>
                <div class="overview-grid">
                    <div class="overview-item">
                        <div class="overview-value ${summary.wins > summary.losses ? 'win' : ''}">${summary.totalGames}</div>
                        <div class="overview-label">总场数</div>
                    </div>
                    <div class="overview-item">
                        <div class="overview-value win">${summary.wins}</div>
                        <div class="overview-label">胜场</div>
                    </div>
                    <div class="overview-item">
                        <div class="overview-value lose">${summary.losses}</div>
                        <div class="overview-label">负场</div>
                    </div>
                    <div class="overview-item">
                        <div class="overview-value">${summary.winRate}%</div>
                        <div class="overview-label">胜率</div>
                    </div>
                    <div class="overview-item">
                        <div class="overview-value">${summary.totalRounds}</div>
                        <div class="overview-label">总局数</div>
                    </div>
                    <div class="overview-item">
                        <div class="overview-value">${summary.maxStreak}</div>
                        <div class="overview-label">最高连胜</div>
                    </div>
                </div>
                <div class="overview-detail">
                    <div class="detail-row">
                        <span>累计净胜分</span>
                        <span class="${summary.totalScore >= 0 ? 'win' : 'lose'}">${summary.totalScore >= 0 ? '+' : ''}${summary.totalScore}</span>
                    </div>
                    <div class="detail-row">
                        <span>单场最高净胜</span>
                        <span class="win">+${summary.bestGame}</span>
                    </div>
                    <div class="detail-row">
                        <span>场均净胜</span>
                        <span class="${summary.avgNetScore >= 0 ? 'win' : 'lose'}">${summary.avgNetScore >= 0 ? '+' : ''}${summary.avgNetScore}</span>
                    </div>
                    <div class="detail-row">
                        <span>近7场胜率</span>
                        <span>${summary.recentWinRate}%</span>
                    </div>
                </div>
            </div>
        `;

        // 成就进度
        const achievementCard = `
            <div class="stats-card achievement-card">
                <h3>🏆 成就进度 (${unlockedCount}/${achievements.length})</h3>
                <div class="achievement-mini-list">
                    ${achievements.map(ach => `
                        <div class="achievement-mini ${ach.unlocked ? 'unlocked' : 'locked'}">
                            <span class="ach-mini-icon">${Utils.escapeHtml(ach.icon)}</span>
                            <div class="ach-mini-info">
                                <span class="ach-mini-name">${Utils.escapeHtml(ach.name)}</span>
                                <span class="ach-mini-desc">${Utils.escapeHtml(ach.desc)}</span>
                                ${!ach.unlocked ? `
                                    <div class="ach-mini-bar-wrap">
                                        <div class="ach-mini-bar" style="width:${ach.progress}%"></div>
                                    </div>
                                ` : '<span class="ach-mini-unlocked">✓ 已解锁</span>'}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // 历史战绩表
        let historyTable = '';
        if (summary.history.length > 0) {
            historyTable = `
                <div class="stats-card history-card">
                    <h3>📜 近期战绩</h3>
                    <div class="history-table-wrap">
                        <table class="history-table">
                            <thead>
                                <tr>
                                    <th>日期</th>
                                    <th>类型</th>
                                    <th>结果</th>
                                    <th>净胜分</th>
                                    <th>总局/胜局</th>
                                    <th>最高番</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${summary.history.map(h => {
                                    const date = new Date(h.date);
                                    const dateStr = `${date.getMonth()+1}/${date.getDate()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
                                    return `
                                        <tr class="${h.isWin ? 'win-row' : 'lose-row'}">
                                            <td>${dateStr}</td>
                                            <td>${Utils.escapeHtml(h.mahjongType || '')}</td>
                                            <td><span class="result-badge ${h.isWin ? 'win' : 'lose'}">${h.isWin ? '胜' : '负'}</span></td>
                                            <td class="${(h.netScore || 0) >= 0 ? 'win' : 'lose'}">${(h.netScore || 0) >= 0 ? '+' : ''}${h.netScore || 0}</td>
                                            <td>${h.wonRounds || 0}/${h.rounds || 1}</td>
                                            <td>${h.fan || 0}番</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } else {
            historyTable = `
                <div class="stats-card history-card empty">
                    <h3>📜 近期战绩</h3>
                    <div class="empty-state">暂无对局记录，快去开一局吧！</div>
                </div>
            `;
        }

        // 经验来源说明
        const expSourceCard = `
            <div class="stats-card exp-source-card">
                <h3>💡 经验与成就说明</h3>
                <div class="exp-source-list">
                    <div class="exp-source-item">
                        <span class="exp-source-icon">🏆</span>
                        <div>
                            <strong>胜利</strong>：基础 20 EXP + 番数×2
                            <span class="exp-source-example">例：胡出8番 → 20 + 16 = 36 EXP</span>
                        </div>
                    </div>
                    <div class="exp-source-item">
                        <span class="exp-source-icon">🥔</span>
                        <div>
                            <strong>失败</strong>：基础 5 EXP
                            <span class="exp-source-example">虽败犹荣，每局都有成长</span>
                        </div>
                    </div>
                    <div class="exp-source-item">
                        <span class="exp-source-icon">📈</span>
                        <div>
                            <strong>升级</strong>：每级所需经验递增 20%
                            <span class="exp-source-example">Lv.1→2 需 100 EXP，Lv.2→3 需 120 EXP</span>
                        </div>
                    </div>
                    <div class="exp-source-item">
                        <span class="exp-source-icon">🎯</span>
                        <div>
                            <strong>净胜分</strong>：最终总分 − 初始分（默认1000分）
                            <span class="exp-source-example">避免初始分干扰，真实反映战绩</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = levelCard + overviewCard + achievementCard + historyTable + expSourceCard;
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
            // 适配新数据格式：rounds 是数组
            const roundCount = Array.isArray(replay.rounds) ? replay.rounds.length : (replay.rounds || 1);
            container.appendChild(UIComponents.createReplayItem(
                { ...replay, rounds: roundCount },
                () => openReplayPlayer(replay),
                () => {
                    if (confirm('确定删除这条记录？')) {
                        Replay.deleteReplay(replay.id);
                        renderReplays();
                    }
                }
            ));
        }
    }

    // ===== 回放播放器 =====

    let _replayPlayer = null;

    function openReplayPlayer(replay) {
        if (_replayPlayer) {
            _replayPlayer.destroy();
            _replayPlayer = null;
        }
        _replayPlayer = new ReplayPlayer(replay);
        UIComponents.switchScreen('replay-player');
        _replayPlayer.init();
    }

    class ReplayPlayer {
        constructor(replayData) {
            this.data = replayData;
            this.rounds = Array.isArray(replayData.rounds) ? replayData.rounds : [];
            this.currentRoundIdx = 0;
            this.currentStep = -1;
            this.isPlaying = false;
            this.playTimer = null;
            this.speed = 1;
            this.speeds = [1, 2, 4];
            this.speedIdx = 0;
            this.players = replayData.players || [];
            this.playerStates = [];
            this.discardPile = [];
            this._handlers = {};
        }

        init() {
            this._bindEvents();
            this._updateHeader();
            if (this.rounds.length > 0) {
                this.loadRound(0);
            } else {
                document.getElementById('replay-action-text').textContent = '无回放数据';
            }
        }

        destroy() {
            this.pause();
            if (this.playTimer) { clearTimeout(this.playTimer); this.playTimer = null; }
            this._unbindEvents();
            _replayPlayer = null;
        }

        _bindEvents() {
            this._handlers.back = () => { this.destroy(); UIComponents.switchScreen('replay-list'); };
            this._handlers.playPause = () => { AudioManager.SFX.buttonClick(); if (this.isPlaying) this.pause(); else this.play(); };
            this._handlers.stepForward = () => { AudioManager.SFX.buttonClick(); this.stepForward(); };
            this._handlers.stepBack = () => { AudioManager.SFX.buttonClick(); this.stepBack(); };
            this._handlers.speed = () => {
                AudioManager.SFX.buttonClick();
                this.speedIdx = (this.speedIdx + 1) % this.speeds.length;
                this.speed = this.speeds[this.speedIdx];
                const btn = document.getElementById('replay-speed');
                if (btn) btn.textContent = this.speed + '×';
            };
            this._handlers.progress = (e) => {
                const max = this._getTotalSteps() - 1;
                const val = parseInt(e.target.value);
                if (max > 0) this.goToStep(Math.round(val / 100 * max));
            };
            this._handlers.roundPrev = () => { AudioManager.SFX.buttonClick(); if (this.currentRoundIdx > 0) this.loadRound(this.currentRoundIdx - 1); };
            this._handlers.roundNext = () => { AudioManager.SFX.buttonClick(); if (this.currentRoundIdx < this.rounds.length - 1) this.loadRound(this.currentRoundIdx + 1); };

            document.getElementById('replay-back-btn')?.addEventListener('click', this._handlers.back);
            document.getElementById('replay-play-pause')?.addEventListener('click', this._handlers.playPause);
            document.getElementById('replay-step-forward')?.addEventListener('click', this._handlers.stepForward);
            document.getElementById('replay-step-back')?.addEventListener('click', this._handlers.stepBack);
            document.getElementById('replay-speed')?.addEventListener('click', this._handlers.speed);
            document.getElementById('replay-progress')?.addEventListener('input', this._handlers.progress);
            document.getElementById('replay-round-prev')?.addEventListener('click', this._handlers.roundPrev);
            document.getElementById('replay-round-next')?.addEventListener('click', this._handlers.roundNext);
        }

        _unbindEvents() {
            document.getElementById('replay-back-btn')?.removeEventListener('click', this._handlers.back);
            document.getElementById('replay-play-pause')?.removeEventListener('click', this._handlers.playPause);
            document.getElementById('replay-step-forward')?.removeEventListener('click', this._handlers.stepForward);
            document.getElementById('replay-step-back')?.removeEventListener('click', this._handlers.stepBack);
            document.getElementById('replay-speed')?.removeEventListener('click', this._handlers.speed);
            document.getElementById('replay-progress')?.removeEventListener('input', this._handlers.progress);
            document.getElementById('replay-round-prev')?.removeEventListener('click', this._handlers.roundPrev);
            document.getElementById('replay-round-next')?.removeEventListener('click', this._handlers.roundNext);
            this._handlers = {};
        }

        _getTotalSteps() {
            const round = this.rounds[this.currentRoundIdx];
            return round?.history?.length || 0;
        }

        loadRound(idx) {
            this.pause();
            this.currentRoundIdx = idx;
            this.currentStep = -1;
            this.playerStates = [];
            this.discardPile = [];
            this._updateHeader();
            this._buildTimeline();
            this._resetTable();
            this._updateProgress();

            const round = this.rounds[idx];
            if (round?.history?.length > 0) {
                this.goToStep(0);
            }
        }

        _updateHeader() {
            const typeConfig = Tiles.getConfig(this.data.mahjongType);
            const typeName = typeConfig?.name || this.data.mahjongType || '未知';
            const round = this.rounds[this.currentRoundIdx];
            const winds = ['东', '南', '西', '北'];
            const windName = winds[round?.wind ?? 0] || '东';

            const titleEl = document.getElementById('replay-type-name');
            if (titleEl) titleEl.textContent = typeName;

            const metaEl = document.getElementById('replay-meta');
            if (metaEl) metaEl.textContent = `第${this.currentRoundIdx + 1}/${this.rounds.length}局 · ${windName}风圈`;

            const roundLabel = document.getElementById('replay-round-label');
            if (roundLabel) roundLabel.textContent = `局 ${this.currentRoundIdx + 1}`;

            const scoresEl = document.getElementById('replay-scores');
            if (scoresEl && this.data.finalScores) {
                scoresEl.innerHTML = this.data.finalScores.map(s =>
                    `<span class="score-tag${s.isWin ? ' win' : ''}">${Utils.escapeHtml(s.name)}: ${s.score}</span>`
                ).join('');
            }

            const roundInfoEl = document.getElementById('replay-round-info');
            if (roundInfoEl) roundInfoEl.textContent = `${this.currentRoundIdx + 1}/${this.rounds.length}局`;

            const windEl = document.getElementById('replay-wind');
            if (windEl) windEl.textContent = windName;
        }

        _buildTimeline() {
            const container = document.getElementById('replay-timeline');
            if (!container) return;
            container.innerHTML = '';

            const round = this.rounds[this.currentRoundIdx];
            if (!round?.history) return;

            round.history.forEach((item, idx) => {
                const desc = this._describeAction(item);
                const el = document.createElement('div');
                el.className = 'replay-timeline-item';
                el.dataset.index = idx;
                el.innerHTML = `
                    <span class="step-num">${idx + 1}</span>
                    <span class="step-action">${desc.icon} ${desc.text}</span>
                    <span class="step-player">${Utils.escapeHtml(desc.player || '')}</span>
                `;
                el.addEventListener('click', () => {
                    AudioManager.SFX.buttonClick();
                    this.goToStep(idx);
                });
                container.appendChild(el);
            });
        }

        _describeAction(item) {
            if (!item) return { icon: '', text: '', player: '' };
            const action = item.action;
            const data = item.data || {};

            const nameMap = {};
            for (const p of this.players) {
                if (p.id) nameMap[p.id] = p.name;
                if (p.position !== undefined) nameMap[p.position] = p.name;
            }
            const pid = data.playerId !== undefined ? data.playerId : data.player;
            const playerName = nameMap[pid] || this.players[pid]?.name || pid || '';

            switch (action) {
                case 'gameStart': return { icon: '🎮', text: `第${data.round}局开始`, player: '' };
                case 'draw': return { icon: '🃏', text: '摸牌', player: playerName };
                case 'discard': {
                    const tileName = this._getTileName(data.tile);
                    return { icon: '🎯', text: `打出 ${tileName}`, player: playerName };
                }
                case 'chi': {
                    const tiles = (data.tiles || []).map(t => this._getTileName(t)).join('');
                    return { icon: '🍽', text: `吃 ${tiles}`, player: playerName };
                }
                case 'peng': {
                    const tiles = (data.tiles || []).map(t => this._getTileName(t)).join('');
                    return { icon: '👏', text: `碰 ${tiles}`, player: playerName };
                }
                case 'gang': {
                    const tiles = (data.tiles || []).map(t => this._getTileName(t)).join('');
                    return { icon: '💥', text: `杠 ${tiles}`, player: playerName };
                }
                case 'anGang': {
                    const tiles = (data.tiles || []).map(t => this._getTileName(t)).join('');
                    return { icon: '🕶', text: `暗杠 ${tiles}`, player: playerName };
                }
                case 'jiaGang': {
                    const tileName = this._getTileName(data.meldId);
                    return { icon: '➕', text: `加杠 ${tileName}`, player: playerName };
                }
                case 'hu': {
                    const ziMo = data.isZiMo ? '自摸' : '点炮';
                    const fan = data.fan?.total || 0;
                    return { icon: '🎉', text: `${ziMo}胡牌 ${fan}番`, player: playerName };
                }
                case 'drawGame': return { icon: '🤝', text: '流局', player: '' };
                case 'roundEnd': return { icon: '🏁', text: `第${data.round}局结束`, player: '' };
                default: return { icon: '•', text: action, player: playerName };
            }
        }

        _getTileName(tileIdOrObj) {
            if (!tileIdOrObj) return '?';
            if (typeof tileIdOrObj === 'object') {
                return tileIdOrObj.name || tileIdOrObj.shortName || `${tileIdOrObj.suit}${tileIdOrObj.value}`;
            }
            const tile = this._findTile(tileIdOrObj);
            if (tile) return tile.name || tile.shortName || '?';
            return '?';
        }

        _findTile(tileId) {
            if (!tileId) return null;
            if (typeof tileId === 'object') return tileId;

            for (const p of this.playerStates) {
                for (const t of (p.hand || [])) {
                    if ((t.id || t) === tileId) return t.id ? t : null;
                }
                for (const t of (p.discards || [])) {
                    if ((t.id || t) === tileId) return t.id ? t : null;
                }
                for (const meld of (p.melds || [])) {
                    for (const t of (meld.tiles || meld)) {
                        if ((t.id || t) === tileId) return t.id ? t : null;
                    }
                }
            }

            for (const t of this.discardPile) {
                if ((t.id || t) === tileId) return t.id ? t : null;
            }

            const round = this.rounds[this.currentRoundIdx];
            if (round?.players) {
                for (const p of round.players) {
                    if (p.hand) {
                        for (const t of p.hand) {
                            if ((t.id || t) === tileId) return t.id ? t : null;
                        }
                    }
                    if (p.melds) {
                        for (const meld of p.melds) {
                            for (const t of (meld.tiles || meld)) {
                                if ((t.id || t) === tileId) return t.id ? t : null;
                            }
                        }
                    }
                }
            }

            if (typeof tileId === 'string') {
                const parts = tileId.split('_');
                if (parts.length >= 2) {
                    return Tiles.createTile(parts[0], parseInt(parts[1]), tileId);
                }
            }
            return null;
        }

        _resetTable() {
            ['top', 'left', 'right', 'bottom'].forEach(pos => {
                const handEl = document.getElementById(`replay-hand-${pos}`);
                if (handEl) handEl.innerHTML = '';
                const meldsEl = document.getElementById(`replay-melds-${pos}`);
                if (meldsEl) meldsEl.innerHTML = '';
            });
            const discardEl = document.getElementById('replay-discard-pile');
            if (discardEl) discardEl.innerHTML = '';
        }

        goToStep(stepIdx) {
            const round = this.rounds[this.currentRoundIdx];
            if (!round?.history) return;
            if (stepIdx < 0) stepIdx = 0;
            if (stepIdx >= round.history.length) stepIdx = round.history.length - 1;

            this.playerStates = [];
            this.discardPile = [];
            this._resetTable();

            const hasGameStart = round.history.some(h => h.action === 'gameStart');
            if (!hasGameStart && round.players) {
                this.playerStates = round.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    score: p.score ?? 1000,
                    position: p.position ?? 0,
                    hand: [],
                    melds: Array.isArray(p.melds) ? p.melds.map(m => ({...m, tiles: [...(m.tiles || [])]})) : [],
                    discards: [],
                    isHu: p.isHu || false,
                    isDealer: p.isDealer || false
                }));
            }

            for (let i = 0; i <= stepIdx; i++) {
                this._applyStep(round.history[i]);
            }

            this.currentStep = stepIdx;
            this._renderState();
            this._updateUI(stepIdx);
        }

        stepForward() {
            if (this.currentStep < this._getTotalSteps() - 1) {
                this.goToStep(this.currentStep + 1);
            } else if (this.currentRoundIdx < this.rounds.length - 1) {
                this.loadRound(this.currentRoundIdx + 1);
            }
        }

        stepBack() {
            if (this.currentStep > 0) {
                this.goToStep(this.currentStep - 1);
            } else if (this.currentRoundIdx > 0) {
                this.loadRound(this.currentRoundIdx - 1);
                const prevRound = this.rounds[this.currentRoundIdx];
                if (prevRound?.history?.length > 0) {
                    this.goToStep(prevRound.history.length - 1);
                }
            }
        }

        play() {
            if (this.isPlaying) return;
            this.isPlaying = true;
            const btn = document.getElementById('replay-play-pause');
            if (btn) btn.textContent = '⏸';
            this._scheduleNext();
        }

        pause() {
            this.isPlaying = false;
            const btn = document.getElementById('replay-play-pause');
            if (btn) btn.textContent = '▶';
            if (this.playTimer) { clearTimeout(this.playTimer); this.playTimer = null; }
        }

        _scheduleNext() {
            if (!this.isPlaying) return;
            const delay = Math.max(200, 1200 / this.speed);
            this.playTimer = setTimeout(() => {
                if (!this.isPlaying) return;
                if (this.currentStep < this._getTotalSteps() - 1) {
                    this.stepForward();
                    this._scheduleNext();
                } else if (this.currentRoundIdx < this.rounds.length - 1) {
                    this.loadRound(this.currentRoundIdx + 1);
                    this.isPlaying = true;
                    const btn = document.getElementById('replay-play-pause');
                    if (btn) btn.textContent = '⏸';
                    this._scheduleNext();
                } else {
                    this.pause();
                }
            }, delay);
        }

        _applyStep(item) {
            if (!item) return;
            const action = item.action;
            const data = item.data || {};

            const _removeFromHand = (p, tileId) => {
                const idx = p.hand.findIndex(t => (t.id || t) === tileId);
                if (idx >= 0) {
                    const obj = p.hand[idx];
                    p.hand.splice(idx, 1);
                    return obj;
                }
                return tileId;
            };

            switch (action) {
                case 'gameStart': {
                    this.playerStates = (data.players || []).map(p => ({
                        id: p.id,
                        name: p.name,
                        score: p.score ?? 1000,
                        position: p.position ?? 0,
                        hand: Array.isArray(p.hand) ? [...p.hand] : [],
                        melds: Array.isArray(p.melds) ? p.melds.map(m => ({...m, tiles: [...(m.tiles || [])]})) : [],
                        discards: Array.isArray(p.discards) ? [...p.discards] : [],
                        isHu: p.isHu || false,
                        isDealer: p.isDealer || false
                    }));
                    this.discardPile = [];
                    break;
                }
                case 'draw':
                    // 引擎不记录 draw，但测试数据可能有；不做任何事
                    break;
                case 'discard': {
                    const p = this._findPlayerState(data.playerId);
                    if (p) {
                        const tileObj = _removeFromHand(p, data.tile);
                        this.discardPile.push(tileObj);
                    }
                    break;
                }
                case 'chi':
                case 'peng':
                case 'gang': {
                    const p = this._findPlayerState(data.playerId);
                    if (p) {
                        const meldTiles = [];
                        for (const tileId of (data.tiles || [])) {
                            const obj = _removeFromHand(p, tileId);
                            meldTiles.push(obj);
                        }
                        if (data.from !== undefined && this.discardPile.length > 0) {
                            const lastDiscard = this.discardPile[this.discardPile.length - 1];
                            const lastId = lastDiscard.id || lastDiscard;
                            const consumedId = data.tiles[data.tiles.length - 1];
                            if (lastId === consumedId) {
                                this.discardPile.pop();
                            }
                        }
                        p.melds.push({
                            type: action === 'chi' ? 'sequence' : (action === 'peng' ? 'triplet' : 'gang'),
                            tiles: meldTiles
                        });
                    }
                    break;
                }
                case 'anGang': {
                    const p = this._findPlayerState(data.playerId);
                    if (p) {
                        const meldTiles = [];
                        for (const tileId of (data.tiles || [])) {
                            const obj = _removeFromHand(p, tileId);
                            meldTiles.push(obj);
                        }
                        p.melds.push({ type: 'gang', tiles: meldTiles, isAnGang: true });
                    }
                    break;
                }
                case 'jiaGang': {
                    const p = this._findPlayerState(data.playerId);
                    if (p) {
                        const obj = _removeFromHand(p, data.meldId);
                        for (const meld of p.melds) {
                            const tiles = meld.tiles || [];
                            if (tiles.length === 3 && tiles.some(t => (t.id || t) === data.meldId)) {
                                tiles.push(obj);
                                meld.type = 'gang';
                                meld.isJiaGang = true;
                                break;
                            }
                        }
                    }
                    break;
                }
                case 'hu': {
                    const p = this._findPlayerState(data.playerId);
                    if (p) p.isHu = true;
                    break;
                }
                case 'roundEnd': {
                    if (data.players) {
                        for (const dp of data.players) {
                            const p = this._findPlayerState(dp.id);
                            if (p) p.score = dp.score;
                        }
                    }
                    break;
                }
            }
        }

        _findPlayerState(id) {
            return this.playerStates.find(p => p.id === id);
        }

        _getPositionName(index) {
            const count = this.players.length || 4;
            if (count === 3) {
                return ['bottom', 'left', 'right'][index];
            }
            return ['bottom', 'right', 'top', 'left'][index];
        }

        _renderState() {
            for (let i = 0; i < this.players.length; i++) {
                const state = this.playerStates[i];
                const pos = this._getPositionName(i);

                const handEl = document.getElementById(`replay-hand-${pos}`);
                if (handEl && state?.hand) {
                    handEl.innerHTML = '';
                    for (const t of state.hand) {
                        const tile = this._findTile(t.id || t);
                        if (tile) {
                            handEl.appendChild(UIComponents.createTileElement(tile, { small: true }));
                        }
                    }
                }

                const meldsEl = document.getElementById(`replay-melds-${pos}`);
                if (meldsEl && state?.melds) {
                    meldsEl.innerHTML = '';
                    for (const meld of state.melds) {
                        const group = document.createElement('div');
                        group.className = 'meld-group';
                        const tiles = meld.tiles || meld;
                        for (const t of tiles) {
                            const tile = this._findTile(t.id || t);
                            if (tile) {
                                group.appendChild(UIComponents.createTileElement(tile, { small: true }));
                            }
                        }
                        meldsEl.appendChild(group);
                    }
                }

                this._updatePlayerInfo(i, state);
            }

            const pileEl = document.getElementById('replay-discard-pile');
            if (pileEl) {
                pileEl.innerHTML = '';
                for (const t of this.discardPile) {
                    const tile = this._findTile(t.id || t);
                    if (tile) {
                        pileEl.appendChild(UIComponents.createTileElement(tile, { small: true }));
                    }
                }
                pileEl.scrollTop = pileEl.scrollHeight;
            }
        }

        _updatePlayerInfo(index, playerData) {
            const pos = this._getPositionName(index);
            const nameEl = document.getElementById(`replay-name-${pos}`);
            const scoreEl = document.getElementById(`replay-score-${pos}`);
            if (nameEl) nameEl.textContent = playerData?.name || `玩家${index + 1}`;
            if (scoreEl) scoreEl.textContent = playerData?.score ?? 1000;
        }

        _updateUI(stepIdx) {
            document.querySelectorAll('.replay-timeline-item').forEach(el => {
                el.classList.toggle('active', parseInt(el.dataset.index) === stepIdx);
            });
            const activeItem = document.querySelector(`.replay-timeline-item[data-index="${stepIdx}"]`);
            if (activeItem) activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

            const round = this.rounds[this.currentRoundIdx];
            const item = round?.history?.[stepIdx];
            const desc = item ? this._describeAction(item) : { text: '', sub: '' };
            const detailEl = document.getElementById('replay-action-text');
            if (detailEl) detailEl.innerHTML = `${desc.icon} <strong>${Utils.escapeHtml(desc.text)}</strong>`;

            const subEl = document.getElementById('replay-action-sub');
            if (subEl) subEl.textContent = desc.player ? `玩家: ${Utils.escapeHtml(desc.player)}` : '';

            const counter = document.getElementById('replay-step-counter');
            if (counter) counter.textContent = `${stepIdx + 1} / ${this._getTotalSteps()}`;

            this._updateProgress();
        }

        _updateProgress() {
            const total = this._getTotalSteps();
            const val = total > 1 ? Math.round(this.currentStep / (total - 1) * 100) : 0;
            const bar = document.getElementById('replay-progress');
            if (bar) bar.value = val;
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
            const n = parseInt(value);
            value = isNaN(n) ? 0 : n;
        }
        
        // 映射到settings对象
        const keyMap = {
            'player-name': 'playerName',
            'ai-difficulty': 'aiDifficulty',
            'table-theme': 'tableTheme',
            'game-rounds': 'gameRounds',
            'game-speed': 'gameSpeed',
            'bgm-volume': 'bgmVolume',
            'sfx-volume': 'sfxVolume',
            'sfx-enabled': 'sfxEnabled',
            'bgm-style': 'bgmStyle',

            'opponent-display': 'opponentDisplay',
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
                const enabled = el.type === 'checkbox' ? el.checked : (value === 'true' || value === true);
                App.settings[settingKey] = enabled; // 存储为布尔值
                AudioManager.setSfxEnabled(enabled);
                if (enabled) AudioManager.SFX.toggleSwitch();
            }
            if (key === 'bgm-style') {
                AudioManager.SFX.toggleSwitch();
                if (AudioManager.isPlaying) {
                    AudioManager.startBgm(value);
                }
            }

            if (key === 'auto-sort') {
                const enabled = value === 'true' || value === true;
                App.settings[settingKey] = enabled;
                if (App.engine?.players) {
                    App.engine.players.forEach(p => { p.autoSort = enabled; });
                }
            }
            if (key === 'show-tile-names') {
                const enabled = value === 'true' || value === true;
                App.settings[settingKey] = enabled;
                // 如果正在游戏中，重新渲染自己的手牌
                if (App.engine && App.currentScreen === 'game-screen') {
                    renderPlayerHand(0, App.engine.players[0]?.hand?.length || 0);
                }
            }
        }
    }

    /**
     * 处理滑块输入
     */
    // 滑块保存防抖（避免每帧写入localStorage）
    let _sliderSaveTimer = null;
    
    function handleSliderInput(e) {
        const el = e.target;
        const label = document.getElementById(el.id + '-value');
        if (label) {
            label.textContent = el.value + '%';
        }
        
        // 更新内存中的设置，但延迟保存到localStorage
        const keyMap = {
            'bgm-volume': 'bgmVolume',
            'sfx-volume': 'sfxVolume'
        };
        const settingKey = keyMap[el.id];
        if (settingKey) {
            App.settings[settingKey] = parseInt(el.value);
        }
        
        // 同步音频系统（即时）
        if (el.id === 'bgm-volume') {
            AudioManager.setBgmVolume(parseInt(el.value) / 100);
        }
        if (el.id === 'sfx-volume') {
            AudioManager.setSfxVolume(parseInt(el.value) / 100);
        }
        
        // 防抖保存到localStorage
        if (_sliderSaveTimer) clearTimeout(_sliderSaveTimer);
        _sliderSaveTimer = setTimeout(() => {
            _sliderSaveTimer = null;
            try {
                Stats.saveSettings(App.settings);
            } catch (e) {
                console.error('保存设置失败:', e);
                Utils.toast('设置保存失败');
            }
        }, 300);
    }

    /**
     * 应用动画级别
     */
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
                '--bg-panel': 'rgba(30, 60, 30, 0.92)',
                '--accent-gold': '#d4a843',
                '--accent-gold-light': '#e8c870',
                '--accent-gold-dark': '#b8922e',
                '--text-primary': '#f0e6d2',
                '--text-secondary': '#c4b896',
                '--text-muted': '#8a9a7a',
                '--win-color': '#4caf50',
                '--lose-color': '#f44336',
                '--hud-bg': 'rgba(18, 18, 24, 0.92)',
                '--hud-border': 'rgba(212, 168, 67, 0.12)',
                '--hud-gold-glow': '0 0 20px rgba(212, 168, 67, 0.15)',
                '--turn-glow': '0 0 16px rgba(212, 168, 67, 0.5)',
                '--shadow-glow': '0 0 20px rgba(212, 168, 67, 0.2)'
            },
            'dark-blue': {
                '--bg-primary': '#1a1a3a',
                '--bg-secondary': '#2d2d5a',
                '--bg-card': '#3d3d6b',
                '--bg-panel': 'rgba(25, 25, 55, 0.92)',
                '--accent-gold': '#6b9ed4',
                '--accent-gold-light': '#8ab8e8',
                '--accent-gold-dark': '#4a7db0',
                '--text-primary': '#e0e8f0',
                '--text-secondary': '#a8b8d0',
                '--text-muted': '#7a8aaa',
                '--win-color': '#4caf50',
                '--lose-color': '#f44336',
                '--hud-bg': 'rgba(15, 15, 30, 0.92)',
                '--hud-border': 'rgba(107, 158, 212, 0.12)',
                '--hud-gold-glow': '0 0 20px rgba(107, 158, 212, 0.15)',
                '--turn-glow': '0 0 16px rgba(107, 158, 212, 0.5)',
                '--shadow-glow': '0 0 20px rgba(107, 158, 212, 0.2)'
            },
            'wood': {
                '--bg-primary': '#3a2a1a',
                '--bg-secondary': '#5a4a2d',
                '--bg-card': '#6b5a3d',
                '--bg-panel': 'rgba(50, 40, 25, 0.92)',
                '--accent-gold': '#c4a86b',
                '--accent-gold-light': '#d8c090',
                '--accent-gold-dark': '#a08850',
                '--text-primary': '#f0e6d2',
                '--text-secondary': '#c8b898',
                '--text-muted': '#9a8a6a',
                '--win-color': '#4caf50',
                '--lose-color': '#f44336',
                '--hud-bg': 'rgba(25, 20, 15, 0.92)',
                '--hud-border': 'rgba(196, 168, 107, 0.12)',
                '--hud-gold-glow': '0 0 20px rgba(196, 168, 107, 0.15)',
                '--turn-glow': '0 0 16px rgba(196, 168, 107, 0.5)',
                '--shadow-glow': '0 0 20px rgba(196, 168, 107, 0.2)'
            },
            'red': {
                '--bg-primary': '#3a1a1a',
                '--bg-secondary': '#5a2d2d',
                '--bg-card': '#6b3d3d',
                '--bg-panel': 'rgba(55, 25, 25, 0.92)',
                '--accent-gold': '#d46b6b',
                '--accent-gold-light': '#e89090',
                '--accent-gold-dark': '#b05050',
                '--text-primary': '#f0e0e0',
                '--text-secondary': '#d0a8a8',
                '--text-muted': '#a07878',
                '--win-color': '#4caf50',
                '--lose-color': '#f44336',
                '--hud-bg': 'rgba(25, 15, 15, 0.92)',
                '--hud-border': 'rgba(212, 107, 107, 0.12)',
                '--hud-gold-glow': '0 0 20px rgba(212, 107, 107, 0.15)',
                '--turn-glow': '0 0 16px rgba(212, 107, 107, 0.5)',
                '--shadow-glow': '0 0 20px rgba(212, 107, 107, 0.2)'
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
            try {
                Stats.resetStats();
                loadStats();
                Utils.toast('统计数据已重置');
            } catch (e) {
                console.error('重置统计失败:', e);
                Utils.toast('重置统计失败');
            }
        }
    }

    // ===== 网络相关 =====

    /**
     * 初始化网络大厅
     */
    function initNetwork() {
        if (!App.network) {
            App.network = new P2PNetwork();
            bindNetworkEvents();
        }

        // 默认连接本地服务器
        const serverInput = document.getElementById('signal-server');
        const serverUrl = serverInput?.value?.trim() || 'http://localhost:8081';
        App.network.setServerUrl(serverUrl);

        // 刷新连接状态
        updateConnectionStatus(App.network.connected ? 'online' : 'offline');

        // 如果已连接则刷新房间列表
        if (App.network.connected) {
            refreshRoomList();
        }

        // 绑定网络大厅按钮（一次性）
        bindNetworkLobbyEvents();
    }

    let _networkLobbyEventsBound = false;

    function bindNetworkLobbyEvents() {
        if (_networkLobbyEventsBound) return;
        _networkLobbyEventsBound = true;

        // 连接/断开按钮（动态生成）
        const configRow = document.querySelector('#network-config .config-row');
        if (configRow && !document.getElementById('btn-connect-server')) {
            const btn = document.createElement('button');
            btn.id = 'btn-connect-server';
            btn.className = 'room-item-join';
            btn.textContent = '连接';
            btn.style.padding = '6px 16px';
            configRow.appendChild(btn);

            btn.addEventListener('click', async () => {
                AudioManager.SFX.buttonClick();
                const serverInput = document.getElementById('signal-server');
                const url = serverInput?.value?.trim();
                if (!url) {
                    showNetworkError('请输入服务器地址');
                    return;
                }
                hideNetworkError();
                App.network.setServerUrl(url);
                updateConnectionStatus('connecting');
                try {
                    // 测试连接：discoverRooms 可以验证服务器可达
                    await App.network.discoverRooms();
                    updateConnectionStatus('online');
                    Utils.toast('已连接到服务器');
                    refreshRoomList();
                } catch (err) {
                    updateConnectionStatus('offline');
                    showNetworkError('连接失败: ' + (err.message || '无法连接到服务器'));
                }
            });
        }

        // 创建房间
        document.getElementById('create-room')?.addEventListener('click', async () => {
            AudioManager.SFX.buttonClick();
            if (!App.network.connected) {
                showNetworkError('请先连接到服务器');
                return;
            }
            hideNetworkError();
            const nameInput = document.getElementById('room-name');
            const typeSelect = document.getElementById('room-mahjong-type');
            let name = nameInput?.value?.trim() || '我的麻将房';
            const type = typeSelect?.value || 'guangdong';
            const playerName = App.settings?.playerName || '玩家';

            try {
                await App.network.createRoom(name, type, playerName);
                Utils.toast(`房间 ${Utils.escapeHtml(name)} 已创建`);
            } catch (err) {
                showNetworkError('创建房间失败: ' + (err.message || '未知错误'));
            }
        });

        // 刷新房间列表
        document.getElementById('refresh-rooms')?.addEventListener('click', () => {
            AudioManager.SFX.buttonClick();
            refreshRoomList();
        });

        // 离开房间
        document.getElementById('btn-leave-room')?.addEventListener('click', async () => {
            AudioManager.SFX.buttonClick();
            try {
                await App.network.leaveRoom();
            } catch (e) {}
            showLobbyContent();
            updateConnectionStatus(App.network.connected ? 'online' : 'offline');
        });

        // 开始游戏（房主）
        document.getElementById('btn-start-network')?.addEventListener('click', async () => {
            AudioManager.SFX.buttonClick();
            if (!App.network.isHost) return;
            if (App.network.players.length < 2) {
                showNetworkError('至少需要2名玩家');
                return;
            }
            hideNetworkError();

            const typeSelect = document.getElementById('room-mahjong-type');
            const mahjongType = typeSelect?.value || 'guangdong';
            const typeConfig = Tiles.getConfig(mahjongType);
            const config = {
                mahjongType: mahjongType,
                playerCount: App.network.players.length,
                aiDifficulty: 'normal',
                speed: App.settings?.gameSpeed || 'normal',
                maxRounds: Math.max(1, parseInt(App.settings?.gameRounds) || 4),
                networkMode: true
            };

            try {
                await App.network.startGame(config);
            } catch (err) {
                showNetworkError('开始游戏失败: ' + (err.message || '未知错误'));
            }
        });
    }

    /**
     * 绑定 P2PNetwork 事件
     */
    let _networkEventsBound = false;

    function bindNetworkEvents() {
        if (_networkEventsBound) return;
        _networkEventsBound = true;
        const net = App.network;

        net.on('connecting', () => {
            updateConnectionStatus('connecting');
        });

        net.on('connected', () => {
            updateConnectionStatus('online');
            hideNetworkError();
        });

        net.on('disconnected', () => {
            updateConnectionStatus('offline');
        });

        net.on('roomCreated', (data) => {
            showRoomPanel(data);
            renderLobbyPlayers(net.players);
        });

        net.on('roomJoined', (data) => {
            showRoomPanel({ roomId: data.roomId, name: '房间 ' + data.roomId });
            // 玩家列表由 SSE 推送
        });

        net.on('playerListUpdated', (players) => {
            renderLobbyPlayers(players);
            // 更新房间状态
            const statusEl = document.getElementById('room-status');
            if (statusEl) {
                const ready = players.length >= 2;
                statusEl.textContent = ready
                    ? `已就绪 ${players.length}/${players.length} 人`
                    : `等待玩家加入... (${players.length}人)`;
            }
            // 只有房主且>=2人时显示开始按钮
            const startBtn = document.getElementById('btn-start-network');
            if (startBtn) {
                startBtn.classList.toggle('hidden', !(net.isHost && players.length >= 2));
            }
        });

        net.on('playerDisconnected', (playerId) => {
            Utils.toast('玩家断开连接');
        });

        net.on('gameStart', (config) => {
            startNetworkGame(config);
        });

        net.on('data', ({ from, type, data }) => {
            handleNetworkData(type, data, from);
        });

        net.on('left', () => {
            showLobbyContent();
        });
    }

    /**
     * 刷新房间列表
     */
    async function refreshRoomList() {
        const list = document.getElementById('room-list');
        if (!list) return;
        if (!App.network.connected) {
            list.innerHTML = '<div class="empty-state">请先连接服务器</div>';
            return;
        }
        list.innerHTML = '<div class="empty-state">搜索中...</div>';
        try {
            const rooms = await App.network.discoverRooms();
            renderRoomList(rooms);
        } catch (err) {
            list.innerHTML = '<div class="empty-state">搜索失败，请检查服务器</div>';
            console.warn('discoverRooms error:', err);
        }
    }

    /**
     * 渲染房间列表
     */
    function renderRoomList(rooms) {
        const list = document.getElementById('room-list');
        if (!list) return;
        if (!rooms || !Array.isArray(rooms)) rooms = [];

        if (rooms.length === 0) {
            list.innerHTML = '<div class="empty-state">暂无可用房间</div>';
            return;
        }

        list.innerHTML = '';
        for (const room of rooms) {
            const item = document.createElement('div');
            item.className = 'room-item';
            const typeName = getMahjongTypeName(room.type);
            const playerText = `${room.players || 0}/${room.maxPlayers || 4}`;
            item.innerHTML = `
                <div class="room-item-info">
                    <span class="room-item-name">${Utils.escapeHtml(room.name || '未命名房间')}</span>
                    <span class="room-item-meta">${typeName} · ${playerText}人</span>
                </div>
                <button class="room-item-join" data-room-id="${Utils.escapeHtml(room.id)}">加入</button>
            `;
            const joinBtn = item.querySelector('.room-item-join');
            if (joinBtn) {
                joinBtn.addEventListener('click', async () => {
                    AudioManager.SFX.buttonClick();
                    hideNetworkError();
                    const playerName = App.settings?.playerName || '玩家';
                    try {
                        await App.network.joinRoom(room.id, playerName);
                        Utils.toast(`已加入房间`);
                    } catch (err) {
                        showNetworkError('加入房间失败: ' + (err.message || '未知错误'));
                    }
                });
            }
            list.appendChild(item);
        }
    }

    function getMahjongTypeName(type) {
        const map = { guangdong: '广东麻将', sichuan: '四川麻将', shanghai: '上海麻将', beijing: '北京麻将', taiwan: '台湾麻将' };
        return map[type] || type || '未知';
    }

    /**
     * 显示房间面板（已进入房间）
     */
    function showRoomPanel(roomData) {
        const lobbyContent = document.getElementById('lobby-content');
        const inRoomPanel = document.getElementById('in-room-panel');
        if (lobbyContent) lobbyContent.classList.add('hidden');
        if (inRoomPanel) inRoomPanel.classList.remove('hidden');

        const codeEl = document.getElementById('room-code-display');
        if (codeEl) codeEl.textContent = roomData.roomId || '----';

        const statusEl = document.getElementById('room-status');
        if (statusEl) statusEl.textContent = '等待玩家加入...';
    }

    /**
     * 显示大厅内容（未进入房间）
     */
    function showLobbyContent() {
        const lobbyContent = document.getElementById('lobby-content');
        const inRoomPanel = document.getElementById('in-room-panel');
        if (lobbyContent) lobbyContent.classList.remove('hidden');
        if (inRoomPanel) inRoomPanel.classList.add('hidden');

        const startBtn = document.getElementById('btn-start-network');
        if (startBtn) startBtn.classList.add('hidden');

        const playerList = document.getElementById('lobby-player-list');
        if (playerList) playerList.innerHTML = '';

        // 重置房间码
        const codeEl = document.getElementById('room-code-display');
        if (codeEl) codeEl.textContent = '----';
    }

    /**
     * 渲染房间内的玩家列表
     */
    function renderLobbyPlayers(players) {
        const list = document.getElementById('lobby-player-list');
        if (!list) return;
        list.innerHTML = '';

        const net = App.network;
        if (!players || players.length === 0) return;

        for (const p of players) {
            const isSelf = p.id === net.playerId;
            const isHost = p.isHost;
            const el = document.createElement('div');
            el.className = 'lobby-player' + (isHost ? ' host' : '') + (isSelf ? ' self' : '');
            const tags = [];
            if (isHost) tags.push('<span class="lobby-player-tag">房主</span>');
            if (isSelf) tags.push('<span class="lobby-player-tag">我</span>');
            el.innerHTML = `
                <span class="lobby-player-avatar">🀄</span>
                <div class="lobby-player-info">
                    <span class="lobby-player-name">${Utils.escapeHtml(p.name || '未知')}${tags.join('')}</span>
                    <span class="lobby-player-status">${isHost ? '房主' : '玩家'}</span>
                </div>
                <span class="lobby-player-state connected">在线</span>
            `;
            list.appendChild(el);
        }
    }

    /**
     * 更新连接状态UI
     */
    function updateConnectionStatus(status) {
        const el = document.getElementById('conn-status');
        if (!el) return;
        el.className = 'conn-status ' + status;
        const textMap = { offline: '未连接', connecting: '连接中...', online: '已连接' };
        el.textContent = textMap[status] || status;
    }

    /**
     * 显示/隐藏网络错误
     */
    function showNetworkError(msg) {
        const el = document.getElementById('network-error');
        if (el) { el.textContent = msg; el.classList.remove('hidden'); }
    }

    function hideNetworkError() {
        const el = document.getElementById('network-error');
        if (el) el.classList.add('hidden');
    }

    // ===== 联机游戏逻辑 =====

    /**
     * 开始联机游戏
     */
    async function startNetworkGame(config) {
        hideNetworkError();
        const net = App.network;

        if (net.isHost) {
            // 房主：正常启动引擎，广播状态
            await startGameAsHost(config);
        } else {
            // 访客：创建引擎实例用于渲染，等待状态同步
            App.isNetworkGame = true;
            App.currentScreen = 'game-screen';
            UIComponents.switchScreen('game-screen');
            Utils.toast('等待房主开始游戏...');
        }
    }

    async function startGameAsHost(config) {
        App.isNetworkGame = true;

        // 创建玩家配置：房主是人类，其他人是AI（但允许远程覆盖）
        const net = App.network;
        const playerConfigs = [];
        const names = ['下家', '对家', '上家'];
        let nameIdx = 0;

        for (let i = 0; i < net.players.length; i++) {
            const p = net.players[i];
            const isHost = i === 0;
            playerConfigs.push({
                name: p.name || (isHost ? '房主' : names[nameIdx++] || '玩家'),
                isAI: !isHost,  // 非房主用AI，远程玩家可通过消息覆盖
                networkId: isHost ? null : p.id
            });
        }

        // 清理旧游戏
        if (App._endGameTimeout) { clearTimeout(App._endGameTimeout); App._endGameTimeout = null; }
        if (App.engine) { App.engine.destroy(); }

        App.engine = new MahjongEngine(config);
        App.engine.initPlayers(playerConfigs);
        bindEngineEvents();

        // 切换到游戏界面
        UIComponents.switchScreen('game-screen');
        App.currentScreen = 'game-screen';

        // 开始游戏
        await App.engine.start();

        // 广播初始状态给所有访客
        broadcastGameState();
    }

    /**
     * 广播游戏状态（房主）
     */
    function broadcastGameState() {
        if (!App.engine || !App.network || !App.network.isHost) return;
        const state = App.engine.getState();
        // 同时发送config以便访客正确初始化引擎
        App.network.broadcast({ type: 'stateSync', state, config: App.engine.config });
    }

    /**
     * 处理网络数据（P2P DataChannel）
     */
    function handleNetworkData(type, data, fromPlayerId) {
        const net = App.network;
        if (!net) return;

        if (net.isHost) {
            // 房主接收访客动作
            if (type === 'playerAction') {
                handleRemotePlayerAction(fromPlayerId, data);
            }
        } else {
            // 访客接收房主状态同步
            if (type === 'stateSync') {
                applyRemoteState(data);
            }
        }
    }

    /**
     * 房主处理远程玩家动作
     */
    async function handleRemotePlayerAction(fromPlayerId, action) {
        const engine = App.engine;
        if (!engine || engine.state !== 'playing') return;

        // 找到对应玩家索引
        const net = App.network;
        const playerIdx = net.players.findIndex(p => p.id === fromPlayerId);
        if (playerIdx < 0) return;
        const player = engine.players[playerIdx];
        if (!player) return;

        // 安全检查：区分回合动作和claim动作
        const turnActions = ['draw', 'discard'];
        const claimActions = ['chi', 'peng', 'gang', 'hu'];
        if (turnActions.includes(action.type)) {
            if (engine.currentPlayerIndex !== playerIdx) {
                console.warn('Remote turn action from non-current player ignored');
                return;
            }
        } else if (claimActions.includes(action.type)) {
            if (!engine.pendingAction || engine.pendingAction.player?.position !== playerIdx) {
                console.warn('Remote claim action without pending action ignored');
                return;
            }
        }

        try {
            switch (action.type) {
                case 'discard':
                    await engine.playerDiscard(action.tileId);
                    break;
                case 'chi':
                    if (engine.pendingAction?.action?.type === 'chi') {
                        await engine.executeAction(player, engine.pendingAction.action);
                    }
                    break;
                case 'peng':
                    if (engine.pendingAction?.action?.type === 'peng') {
                        await engine.executeAction(player, engine.pendingAction.action);
                    }
                    break;
                case 'gang':
                    if (engine.pendingAction?.action?.type === 'gang') {
                        await engine.executeAction(player, engine.pendingAction.action);
                    }
                    break;
                case 'hu':
                    if (engine.pendingAction?.action?.type === 'hu' && engine.lastDiscard) {
                        await engine.executeAction(player, engine.pendingAction.action);
                    }
                    break;
                case 'skip':
                    if (engine.pendingAction) {
                        await engine.skipAction();
                    }
                    break;
            }
        } catch (err) {
            console.warn('远程动作处理失败:', err);
        }

        // 广播更新后的状态
        broadcastGameState();
    }

    /**
     * 访客应用远程状态
     */
    function applyRemoteState(data) {
        if (!data || !data.state) return;
        const state = data.state;

        // 如果还没有engine，创建一个用于渲染
        if (!App.engine) {
            try {
                const config = state.config || { mahjongType: 'guangdong', playerCount: 4 };
                App.engine = new MahjongEngine(config);
                // 初始化玩家（名字从状态中恢复）
                const playerConfigs = (state.players || []).map((p, i) => ({
                    name: p.name || `玩家${i+1}`,
                    isAI: p.isAI !== false
                }));
                App.engine.initPlayers(playerConfigs);
                bindEngineEvents();
            } catch (err) {
                console.error('创建访客引擎失败:', err);
                return;
            }
        }

        // 同步引擎状态（轻量同步，不触发事件）
        const engine = App.engine;
        engine.state = state.state || 'playing';
        engine.currentPlayerIndex = state.currentPlayer ?? 0;
        engine.currentWind = state.currentWind ?? 0;
        engine.round = state.round ?? 1;
        engine.deckCount = state.deckCount ?? 0;
        engine.discardPile = state.discardPile || [];
        engine.lastDiscard = state.lastDiscard || null;

        // 同步玩家状态
        if (state.players && Array.isArray(state.players)) {
            for (let i = 0; i < Math.min(state.players.length, engine.players.length); i++) {
                const sp = state.players[i];
                const ep = engine.players[i];
                if (!sp || !ep) continue;
                ep.score = sp.score ?? ep.score;
                ep.handSize = sp.handSize ?? ep.handSize;
                ep.melds = sp.melds || ep.melds;
                ep.isDealer = sp.isDealer ?? ep.isDealer;
                ep.isHu = sp.isHu ?? ep.isHu;
                ep.gangCount = sp.gangCount ?? ep.gangCount;
            }
        }

        // 渲染
        renderGameState();
    }

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

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
