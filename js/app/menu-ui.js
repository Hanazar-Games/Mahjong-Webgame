/**
 * 万能麻将 - 菜单导航与游戏启动快捷方式模块
 * 从 main.js 拆分（架构拆分轮次 2）
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
