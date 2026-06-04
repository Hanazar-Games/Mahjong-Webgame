/**
 * 万能麻将 - 游戏结果与结算模块
 * 从 main.js 拆分（架构拆分轮次 2）
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
