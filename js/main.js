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

    /**
     * 处理菜单点击
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

    // 暴露全局引用供拆分模块使用
    window.App = App;
    window.bindEngineEvents = bindEngineEvents;
    window.showIngameMenu = showIngameMenu;
    window.hideIngameMenu = hideIngameMenu;
    window.startGame = startGame;
    window.loadStats = loadStats;

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
