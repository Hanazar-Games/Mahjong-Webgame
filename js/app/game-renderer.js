/**
 * 万能麻将 - 游戏渲染器模块
 * 从 main.js 拆分（Bug修复轮次13）
 */
    function renderGameState() {
        if (!App.engine) return;
        
        const state = App.engine.getState();
        const tableEl = document.getElementById('game-table');
        if (tableEl) {
            tableEl.classList.toggle('three-player', App.engine.config.playerCount === 3);
        }
        
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
     * 渲染玩家手牌（增量更新，避免全量DOM重建）
     */
    function renderPlayerHand(playerIndex, handSize, animateLast = false, drawnTileId = null) {
        const handEl = document.getElementById(`hand-${getPositionName(playerIndex)}`);
        if (!handEl || !App.engine) return;
        
        const isSelf = playerIndex === 0;
        const player = App.engine.players[playerIndex];
        if (!player) return;
        const displayMode = isSelf ? 'full' : App.settings.opponentDisplay;
        
        if (isSelf || displayMode === 'full') {
            const hand = isSelf ? player.hand : (displayMode === 'full' ? player.hand : null);
            if (!hand || !Array.isArray(hand)) return;
            
            // 防御：如果之前是其他显示模式（如背面牌或文字），先清空（并清理拖拽监听器）
            if (handEl.querySelectorAll('.mahjong-tile.back').length > 0 || handEl.querySelector(':scope > span')) {
                handEl.querySelectorAll('.mahjong-tile').forEach(el => {
                    if (typeof el._cleanupDrag === 'function') el._cleanupDrag();
                });
                handEl.innerHTML = '';
            }
            
            // 保存选中状态
            const selectedId = isSelf ? handEl.querySelector('.mahjong-tile.selected')?.dataset.id : null;
            
            // 收集现有元素
            const existingEls = new Map();
            handEl.querySelectorAll('.mahjong-tile').forEach(el => {
                existingEls.set(el.dataset.id, el);
            });
            
            const fragment = document.createDocumentFragment();
            
            hand.forEach((tile, index) => {
                let tileEl = existingEls.get(tile.id);
                if (!tileEl) {
                    // 创建新元素
                    if (isSelf) {
                        tileEl = UIComponents.createTileElement(tile, {
                            draggable: true,
                            showName: App.settings.showTileNames,
                            onClick: (t) => AppEventBus.emit('tile:click', t),
                            onDragEnd: (t) => AppEventBus.emit('tile:dragend', t)
                        });
                    } else {
                        tileEl = UIComponents.createTileElement(tile, { small: true, showName: App.settings.showTileNames });
                    }
                } else {
                    // 复用现有元素，从Map中移除
                    existingEls.delete(tile.id);
                    // 清除之前的动画类（避免重复动画）
                    tileEl.classList.remove('tile-drawn');
                }
                
                // 摸牌动画：优先匹配drawnTileId
                if (animateLast && (drawnTileId ? tile.id === drawnTileId : index === hand.length - 1)) {
                    tileEl.classList.add('tile-drawn');
                }
                
                fragment.appendChild(tileEl);
            });
            
            // 移除不再存在的元素（先清理拖拽监听器）
            existingEls.forEach(el => {
                if (typeof el._cleanupDrag === 'function') el._cleanupDrag();
                el.remove();
            });
            
            // 批量插入（减少重排）
            handEl.appendChild(fragment);
            
            // 设置禁用状态和恢复选中
            if (isSelf) {
                const engine = App.engine;
                const shouldDisable = !engine || engine.currentPlayerIndex !== 0 || engine.state !== 'playing';
                handEl.querySelectorAll('.mahjong-tile').forEach(tile => {
                    tile.classList.toggle('disabled', shouldDisable);
                    if (selectedId && tile.dataset.id === selectedId) {
                        tile.classList.add('selected');
                    }
                });
            }
        } else if (displayMode === 'small') {
            // 防御：如果之前是其他显示模式（如真实牌面或文字），先清空
            if (handEl.querySelectorAll('.mahjong-tile:not(.back)').length > 0 || handEl.querySelector(':scope > span')) {
                handEl.innerHTML = '';
            }
            
            // 对手小牌堆：调整背面牌数量
            const currentTiles = handEl.querySelectorAll('.mahjong-tile.back');
            const currentCount = currentTiles.length;
            
            if (currentCount < handSize) {
                const fragment = document.createDocumentFragment();
                for (let i = currentCount; i < handSize; i++) {
                    const tileEl = document.createElement('div');
                    tileEl.className = 'mahjong-tile back';
                    if (animateLast && i === handSize - 1) {
                        tileEl.classList.add('tile-drawn');
                    }
                    fragment.appendChild(tileEl);
                }
                handEl.appendChild(fragment);
            } else if (currentCount > handSize) {
                for (let i = currentCount - 1; i >= handSize; i--) {
                    currentTiles[i].remove();
                }
            }
        } else if (displayMode === 'hidden') {
            handEl.innerHTML = `<span style="color:var(--text-muted);font-size:0.8rem">${handSize}张</span>`;
        }
    }

    /**
     * 渲染玩家副露（增量更新）
     */
    function renderPlayerMelds(playerIndex) {
        const meldsEl = document.getElementById(`melds-${getPositionName(playerIndex)}`);
        if (!meldsEl || !App.engine) return;
        
        const player = App.engine.players[playerIndex];
        if (!player || !player.melds) return;
        
        const existingGroups = meldsEl.querySelectorAll('.meld-group');
        
        // 防御：如果副露变短了（如回放跳转或网络同步），移除多余元素
        if (existingGroups.length > player.melds.length) {
            for (let i = existingGroups.length - 1; i >= player.melds.length; i--) {
                existingGroups[i].remove();
            }
        }
        
        // 只添加新增的 meld（副露通常只增不减）
        for (let i = existingGroups.length; i < player.melds.length; i++) {
            const meld = player.melds[i];
            if (!meld || !Array.isArray(meld.tiles)) continue;
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
     * 渲染弃牌堆（增量更新）
     */
    function renderDiscardPile(animateLast = true) {
        const pileEl = document.getElementById('discard-pile');
        if (!pileEl || !App.engine) return;
        
        const discardPile = App.engine.discardPile || [];
        const existingEls = pileEl.querySelectorAll('.mahjong-tile');
        
        // 防御：如果弃牌堆变短了（如回放跳转或网络同步），移除多余元素
        if (existingEls.length > discardPile.length) {
            for (let i = existingEls.length - 1; i >= discardPile.length; i--) {
                existingEls[i].remove();
            }
        }
        
        // 重新查询，移除旧动画类（避免re-render时重复动画）
        const currentEls = pileEl.querySelectorAll('.mahjong-tile');
        if (currentEls.length > 0) {
            currentEls[currentEls.length - 1].classList.remove('tile-discarded');
        }
        
        // 只添加新元素
        for (let i = currentEls.length; i < discardPile.length; i++) {
            const tile = discardPile[i];
            const tileEl = UIComponents.createTileElement(tile, { small: true });
            if (animateLast && i === discardPile.length - 1) {
                tileEl.classList.add('tile-discarded');
            }
            pileEl.appendChild(tileEl);
        }
        
        // 滚动到最新
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
     * 更新向听数显示（仅人类玩家）
     * 向听数为0时额外显示听牌张数
     */
    function updateShantenDisplay(playerIndex) {
        const display = document.getElementById('shanten-display');
        const valueEl = document.getElementById('shanten-value');
        if (!display || !valueEl) return;
        if (playerIndex !== 0 || !App.engine) {
            display.classList.add('hidden');
            return;
        }
        if (App.settings && App.settings.showShanten === false) {
            display.classList.add('hidden');
            return;
        }
        const player = App.engine.players[0];
        if (!player || !player.hand) {
            display.classList.add('hidden');
            return;
        }
        try {
            const shanten = AIUtils.calculateShanten(player.hand, player.melds, App.engine.ruleConfig);
            if (shanten < 0) {
                valueEl.textContent = '胡';
            } else if (shanten === 0) {
                const ctx = App.engine.buildAIContext ? App.engine.buildAIContext(player) : {};
                const winningTiles = AIUtils.countWinningTiles(player.hand, player.melds, App.engine.ruleConfig, ctx);
                valueEl.textContent = `听 ${winningTiles}张`;
            } else {
                valueEl.textContent = shanten;
            }
            display.classList.remove('hidden');
        } catch (e) {
            display.classList.add('hidden');
        }
    }
