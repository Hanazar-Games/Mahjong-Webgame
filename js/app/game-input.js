/**
 * 万能麻将 - 游戏输入处理模块（牌点击、动作、键盘、触摸）
 * 从 main.js 拆分（架构拆分轮次 2）
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
