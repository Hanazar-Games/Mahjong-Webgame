/**
 * 万能麻将 - 游戏渲染器模块
 * 从 main.js 拆分（Bug修复轮次13）
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
