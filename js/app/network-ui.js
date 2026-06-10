/**
 * 万能麻将 - 网络大厅与联机游戏模块
 * 从 main.js 拆分（架构拆分轮次 2）
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

        // 如果服务器可达则刷新房间列表
        if (canUseSignalServer()) {
            refreshRoomList();
        }

        // 绑定网络大厅按钮（一次性）
        bindNetworkLobbyEvents();
    }

    let _networkLobbyEventsBound = false;
    let _lastBroadcastTime = 0;

    function canUseSignalServer() {
        return !!(App.network && App.network.serverUrl && (App.networkServerReachable || App.network.connected));
    }

    function isTrustedHost(playerId) {
        const players = App.network?.players || [];
        return players.some(player => player.id === playerId && player.isHost);
    }

    function isValidRemoteStatePayload(data) {
        if (!data || typeof data !== 'object' || !data.state || typeof data.state !== 'object') {
            return false;
        }

        const state = data.state;
        const players = state.players;
        if (!Array.isArray(players) || players.length < 2 || players.length > 4) {
            return false;
        }
        if (!Number.isInteger(state.currentPlayer) || state.currentPlayer < 0 || state.currentPlayer >= players.length) {
            return false;
        }
        if (!Number.isInteger(state.currentWind) || state.currentWind < 0 || state.currentWind > 3) {
            return false;
        }
        if (!Number.isInteger(state.round) || state.round < 1) {
            return false;
        }
        if (!Number.isInteger(state.deckCount) || state.deckCount < 0) {
            return false;
        }
        if (!Array.isArray(state.discardPile)) {
            return false;
        }

        const config = data.config || state.config;
        if (config) {
            if (!Number.isInteger(config.playerCount) || config.playerCount !== players.length) {
                return false;
            }
            if (typeof config.mahjongType !== 'string' || !Tiles.getConfig(config.mahjongType)) {
                return false;
            }
        }

        return true;
    }

    function bindNetworkLobbyEvents() {
        if (_networkLobbyEventsBound) return;
        _networkLobbyEventsBound = true;

        // 连接/断开按钮（动态生成）
        const configRow = document.querySelector('#network-config .config-row');
        if (configRow && !document.getElementById('btn-connect-server')) {
            const btn = document.createElement('button');
            btn.id = 'btn-connect-server';
            btn.className = 'primary-btn';
            btn.textContent = '连接服务器';
            btn.style.padding = '8px 18px';
            btn.style.width = 'auto';
            btn.style.marginTop = '0';
            configRow.appendChild(btn);

            btn.addEventListener('click', async (e) => {
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
                const button = e.currentTarget;
                if (button.disabled) return;
                const originalText = button.textContent;
                button.disabled = true;
                button.textContent = '连接中...';
                try {
                    // 测试连接：discoverRooms 可以验证服务器可达
                    await App.network.discoverRooms();
                    Utils.toast('已连接到服务器', 3000, 'success');
                    refreshRoomList();
                } catch (err) {
                    updateConnectionStatus('offline');
                    showNetworkError('连接失败: ' + (err.message || '无法连接到服务器'));
                } finally {
                    button.disabled = false;
                    button.textContent = originalText;
                }
            });
        }

        // 创建房间
        document.getElementById('create-room')?.addEventListener('click', async () => {
            AudioManager.SFX.buttonClick();
            if (!canUseSignalServer()) {
                showNetworkError('请先连接到服务器');
                return;
            }
            hideNetworkError();
            const nameInput = document.getElementById('room-name');
            const typeSelect = document.getElementById('room-mahjong-type');
            let name = nameInput?.value?.trim() || '我的麻将房';
            const type = typeSelect?.value || 'guangdong';
            const playerName = App.settings?.playerName || '玩家';

            const createBtn = document.getElementById('create-room');
            if (createBtn) createBtn.disabled = true;
            try {
                await App.network.createRoom(name, type, playerName);
                Utils.toast(`房间 ${Utils.escapeHtml(name)} 已创建`, 3000, 'success');
            } catch (err) {
                showNetworkError('创建房间失败: ' + (err.message || '未知错误'));
            } finally {
                if (createBtn) createBtn.disabled = false;
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
            const leaveBtn = document.getElementById('btn-leave-room');
            if (leaveBtn) leaveBtn.disabled = true;
            try {
                await App.network.leaveRoom();
            } catch (e) {}
            showLobbyContent();
            updateConnectionStatus(App.network.connected ? 'online' : 'offline');
            if (leaveBtn) leaveBtn.disabled = false;
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

            const startBtnNet = document.getElementById('btn-start-network');
            if (startBtnNet) startBtnNet.disabled = true;
            try {
                await App.network.startGame(config);
            } catch (err) {
                showNetworkError('开始游戏失败: ' + (err.message || '未知错误'));
                if (startBtnNet) startBtnNet.disabled = false;
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
            App.networkServerReachable = true;
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

        net.on('playerDisconnected', ({ playerId, name }) => {
            Utils.toast(name ? `${Utils.escapeHtml(name)} 断开连接` : '玩家断开连接', 3000, 'warning');
        });

        net.on('gameStart', (config) => {
            startNetworkGame(config).catch(err => {
                console.error('startNetworkGame error:', err);
                Utils.toast('启动游戏失败: ' + (err.message || '未知错误'), 3000, 'error');
            });
        });

        net.on('data', ({ from, type, data }) => {
            if (type === 'playerAction') {
                handleRemotePlayerAction(from, data).catch(err => {
                    console.warn('Remote action error:', err);
                });
            } else {
                handleNetworkData(type, data, from);
            }
        });

        net.on('left', () => {
            updateConnectionStatus(App.network?.connected ? 'online' : 'offline');
            showLobbyContent();
            App.isNetworkGame = false;
            if (App.engine) { App.engine.destroy(); App.engine = null; }
        });
    }

    /**
     * 刷新房间列表
     */
    let _refreshGeneration = 0;

    async function refreshRoomList() {
        const list = document.getElementById('room-list');
        if (!list) return;
        if (!canUseSignalServer()) {
            list.innerHTML = '<div class="empty-state">请先连接服务器</div>';
            return;
        }
        const gen = ++_refreshGeneration;
        list.innerHTML = '<div class="empty-state">搜索中...</div>';
        try {
            const rooms = await App.network.discoverRooms();
            if (gen !== _refreshGeneration) return; // 忽略过期结果
            // HTTP 探测成功不更新连接状态 UI（SSE 状态才决定 online/offline）
            renderRoomList(rooms);
        } catch (err) {
            if (gen !== _refreshGeneration) return;
            updateConnectionStatus('offline');
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
            list.innerHTML = '<div class="empty-state">暂无可用房间<br><small style="opacity:0.7">点击下方「创建房间」新建一局</small></div>';
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
                    if (joinBtn.disabled) return;
                    hideNetworkError();
                    joinBtn.disabled = true;
                    const playerName = App.settings?.playerName || '玩家';
                    try {
                        await App.network.joinRoom(room.id, playerName);
                        Utils.toast(`已加入房间`, 3000, 'success');
                    } catch (err) {
                        showNetworkError('加入房间失败: ' + (err.message || '未知错误'));
                        joinBtn.disabled = false;
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
        const now = Date.now();
        if (now - _lastBroadcastTime < 200) return;
        _lastBroadcastTime = now;
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
                handleRemotePlayerAction(fromPlayerId, data).catch(err => {
                    console.warn('Remote action error:', err);
                });
            }
        } else {
            // 访客接收房主状态同步
            if (type === 'stateSync') {
                if (!isTrustedHost(fromPlayerId)) {
                    console.warn('忽略非房主发来的状态同步');
                    return;
                }
                applyRemoteState(data);
            }
        }
    }

    /**
     * 房主处理远程玩家动作
     */
    async function handleRemotePlayerAction(fromPlayerId, action) {
        if (!action || typeof action !== 'object' || !action.type) return;
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
        const claimActions = ['chi', 'peng', 'gang', 'hu', 'skip'];
        if (turnActions.includes(action.type)) {
            if (engine.currentPlayerIndex !== playerIdx) {
                console.warn('Remote turn action from non-current player ignored');
                return;
            }
            // draw 由引擎自动处理，无需远程触发
            if (action.type === 'draw') return;
        } else if (claimActions.includes(action.type)) {
            if (!engine.pendingAction || engine.pendingAction.player?.position !== playerIdx) {
                console.warn('Remote claim action without pending action ignored');
                return;
            }
        } else {
            console.warn(`[Network] 未知的远程动作类型: ${action.type}`);
            return;
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
        if (!isValidRemoteStatePayload(data)) {
            console.warn('收到无效的远程状态，同步已忽略');
            return;
        }
        const state = data.state;
        const config = data.config || state.config || { mahjongType: 'guangdong', playerCount: state.players.length };

        // 如果还没有engine，创建一个用于渲染
        if (!App.engine) {
            try {
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
        engine.config = { ...engine.config, ...config };
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
