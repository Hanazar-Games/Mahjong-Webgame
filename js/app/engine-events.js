/**
 * 万能麻将 - 引擎事件绑定模块
 * 从 main.js 拆分（架构拆分轮次 2）
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
