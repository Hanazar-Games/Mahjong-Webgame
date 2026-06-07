/**
 * 万能麻将 - 游戏输入处理模块（牌点击、动作、键盘、触摸）
 * 从 main.js 拆分（架构拆分轮次 2）
 */
    // selectTile SFX 节流（防止快速点击导致音频spam）
    let _lastSelectTileSfxTime = 0;
    function _playSelectTileSfx() {
        const now = Date.now();
        if (now - _lastSelectTileSfxTime > 80) {
            _lastSelectTileSfxTime = now;
            AudioManager.SFX.selectTile();
        }
    }

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
                _playSelectTileSfx();
                selected.classList.remove('selected');
                const targetEl = handEl.querySelector(`[data-id="${escapeCssSelector(tile.id)}"]`);
                if (targetEl) targetEl.classList.add('selected');
            }
        } else {
            // 选择牌
            _playSelectTileSfx();
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
    /**
     * 通用牌型选项选择器
     */
    function showTileOptionsSelector(options, titleText, getTilesFn) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.id = 'tile-selector-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:240;display:flex;align-items:center;justify-content:center;';
            
            const panel = document.createElement('div');
            panel.style.cssText = 'background:var(--bg-panel);padding:20px;border-radius:var(--border-radius);border:1px solid rgba(212,168,67,0.3);max-width:90%;';
            
            const title = document.createElement('h3');
            title.textContent = titleText;
            title.style.cssText = 'color:var(--accent-gold);margin-bottom:16px;text-align:center;';
            panel.appendChild(title);
            
            const optionsContainer = document.createElement('div');
            optionsContainer.style.cssText = 'display:flex;flex-direction:column;gap:12px;';
            
            options.forEach((opt, idx) => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;gap:8px;align-items:center;cursor:pointer;padding:8px 12px;border-radius:8px;border:1px solid transparent;transition:all 0.2s;';
                row.addEventListener('mouseenter', () => {
                    row.style.background = 'rgba(212,168,67,0.1)';
                    row.style.borderColor = 'rgba(212,168,67,0.3)';
                });
                row.addEventListener('mouseleave', () => {
                    row.style.background = '';
                    row.style.borderColor = 'transparent';
                });
                row.addEventListener('click', () => {
                    overlay.remove();
                    resolve(opt);
                });
                
                const tiles = getTilesFn(opt);
                for (const tile of tiles) {
                    const tileEl = UIComponents.createTileElement(tile, { small: true });
                    tileEl.style.cursor = 'pointer';
                    row.appendChild(tileEl);
                }
                
                optionsContainer.appendChild(row);
            });
            
            panel.appendChild(optionsContainer);
            overlay.appendChild(panel);
            document.body.appendChild(overlay);
        });
    }

    function showChiOptionsSelector(options) {
        return showTileOptionsSelector(options, '请选择吃的组合', opt => opt);
    }

    function showAnGangOptionsSelector(options) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.id = 'tile-selector-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:300;display:flex;align-items:center;justify-content:center;';
            
            const panel = document.createElement('div');
            panel.style.cssText = 'background:var(--bg-panel);padding:20px;border-radius:var(--border-radius);border:1px solid rgba(212,168,67,0.3);max-width:90%;';
            
            const title = document.createElement('h3');
            title.textContent = '请选择杠的组合';
            title.style.cssText = 'color:var(--accent-gold);margin-bottom:16px;text-align:center;';
            panel.appendChild(title);
            
            const optionsContainer = document.createElement('div');
            optionsContainer.style.cssText = 'display:flex;flex-direction:column;gap:12px;';
            
            options.forEach((opt) => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;gap:8px;align-items:center;cursor:pointer;padding:8px 12px;border-radius:8px;border:1px solid transparent;transition:all 0.2s;';
                row.addEventListener('mouseenter', () => {
                    row.style.background = 'rgba(212,168,67,0.1)';
                    row.style.borderColor = 'rgba(212,168,67,0.3)';
                });
                row.addEventListener('mouseleave', () => {
                    row.style.background = '';
                    row.style.borderColor = 'transparent';
                });
                row.addEventListener('click', () => {
                    overlay.remove();
                    resolve(opt);
                });
                
                const tiles = opt.type === 'an_gang' ? opt.tiles : (opt.tile ? [opt.tile] : []);
                for (const tile of tiles) {
                    const tileEl = UIComponents.createTileElement(tile, { small: true });
                    tileEl.style.cursor = 'pointer';
                    row.appendChild(tileEl);
                }
                
                if (opt.type === 'jia_gang') {
                    const label = document.createElement('span');
                    label.textContent = '加杠';
                    label.style.cssText = 'color:var(--text-secondary);font-size:0.9rem;';
                    row.appendChild(label);
                }
                
                optionsContainer.appendChild(row);
            });
            
            panel.appendChild(optionsContainer);
            overlay.appendChild(panel);
            document.body.appendChild(overlay);
        });
    }

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
                    const options = engine.pendingAction.action.options;
                    let actionToExecute = engine.pendingAction.action;
                    if (options && options.length > 1) {
                        const selected = await showChiOptionsSelector(options);
                        if (!engineStillValid()) break;
                        actionToExecute = { ...engine.pendingAction.action, selectedOption: selected };
                    }
                    await engine.executeAction(player, actionToExecute);
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
                    let option = App.anGangOptions[0];
                    if (App.anGangOptions.length > 1) {
                        option = await showAnGangOptionsSelector(App.anGangOptions);
                        if (!engineStillValid()) break;
                    }
                    await engine.executeAnGang(player, option);
                    App.anGangOptions = null;
                }
                break;
            case 'hu':
                // 优先检查自摸（仅在当前玩家回合且手牌已包含摸到的牌）
                if (typeof Rules === 'undefined' || !Rules.canWin) {
                    console.error('Rules模块未加载');
                    break;
                }
                const isMyTurn = engine.currentPlayerIndex === 0;
                const selfWin = isMyTurn ? Rules.canWin(player.hand, engine.ruleConfig) : null;
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
                    // 重新检查暗杠（跳过自摸后可能仍有暗杠选项）
                    if (typeof Rules !== 'undefined' && Rules.canAnGang) {
                        const anGangOptions = Rules.canAnGang(player.hand, player.melds, engine.ruleConfig);
                        if (anGangOptions.length > 0) {
                            App.anGangOptions = anGangOptions;
                            enableActionButtons({ type: 'gang' });
                        }
                    }
                }
                break;
        }
        } catch (e) {
            console.error('handleAction error:', e);
        } finally {
            // 如果 skip 后引擎又提供了新的 pendingAction，不要禁用按钮
            // （engine-events.js 中的 actionAvailable 监听器可能已经启用了新按钮）
            if (!engine.pendingAction) {
                disableActionButtons();
            }
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
            case 'S': {
                e.preventDefault();
                const skipBtn = document.getElementById('btn-skip');
                if (skipBtn && !skipBtn.disabled) handleAction('skip');
                break;
            }
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

    // 通过事件总线订阅牌交互事件（消除 game-renderer.js 的反向依赖）
    AppEventBus.on('tile:click', handleTileClick);
    AppEventBus.on('tile:dragend', (tile) => {
        if (!App.engine || App.engine.state !== 'playing') return;
        _doDiscard(tile.id);
        enablePlayerActions(false);
    });
