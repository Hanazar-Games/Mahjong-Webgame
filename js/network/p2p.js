/**
 * 万能麻将 - WebRTC P2P 局域网联机
 *
 * 架构:
 *   1. HTTP 信令服务器 (SSE+POST) 用于发现房间和交换 SDP
 *   2. WebRTC DataChannel 建立后，游戏数据直接 P2P 传输
 *   3. 房主作为权威主机，同步游戏状态给其他玩家
 */

class P2PNetwork extends Utils.EventEmitter {
    constructor() {
        super();
        this.serverUrl = '';
        this.roomId = null;
        this.playerId = null;
        this.playerToken = null;
        this.playerName = '';
        this.isHost = false;
        this.peers = new Map();   // playerId -> RTCPeerConnection
        this.channels = new Map(); // playerId -> RTCDataChannel
        this.pendingIce = new Map();
        this.peerReconnectTimers = new Map();
        this.peerReconnectAttempts = new Map();
        this.players = [];         // 房间中所有玩家信息 [{id, name, isHost}]
        this.sse = null;
        this.sseReconnectTimer = null;
        this.heartbeatTimer = null;
        this.lastPong = Date.now();
        this.sseReconnectAttempts = 0;
        this.connected = false;
        this.connecting = false;
        this._sseStarting = false;
        this._startGamePromise = null;
        this._roomRequest = null;
    }

    // ===== 连接管理 =====

    setServerUrl(url) {
        let parsed;
        try { parsed = new URL(url); }
        catch { throw new Error('请输入完整的 HTTP 或 HTTPS 服务器地址'); }
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
            throw new Error('服务器地址须使用 HTTP 或 HTTPS，且不含账号、查询参数或片段');
        }
        const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
        if (typeof location !== 'undefined' && location.protocol === 'https:' && parsed.protocol === 'http:' && !loopback) {
            throw new Error('当前页面使用 HTTPS，请连接 HTTPS 信令服务器');
        }
        const next = parsed.href.replace(/\/+$/, '');
        if (this.roomId && next !== this.serverUrl) throw new Error('请先退出房间，再更换服务器');
        this.serverUrl = next;
    }

    async _fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeout);
            return res;
        } catch (e) {
            clearTimeout(timeout);
            if (e.name === 'AbortError') throw new Error('请求超时');
            throw e;
        }
    }

    async _post(path, body) {
        const res = await this._fetchWithTimeout(this.serverUrl + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(this.playerToken ? { Authorization: `Bearer ${this.playerToken}` } : {}) },
            body: JSON.stringify(body)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
    }

    async _get(path) {
        const res = await this._fetchWithTimeout(this.serverUrl + path);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
    }

    // ===== 房间发现 =====

    async discoverRooms() {
        if (!this.serverUrl) throw new Error('未设置服务器地址');
        const data = await this._get('/rooms');
        if (!Array.isArray(data?.rooms)) throw new Error('服务器未返回有效房间列表，请检查信令服务器地址');
        return data.rooms;
    }

    // ===== 创建房间 =====

    async createRoom(name, mahjongType, playerName) {
        return this._enterRoom('/room/create', { name, mahjongType, playerName: playerName || '玩家', maxPlayers: 4 }, true);
    }

    // ===== 加入房间 =====

    async joinRoom(roomId, playerName) {
        return this._enterRoom('/room/' + roomId + '/join', { playerName: playerName || '玩家' }, false);
    }

    async _enterRoom(path, body, isHost) {
        if (!this.serverUrl) throw new Error('未设置服务器地址');
        if (this.roomId || this._roomRequest) throw new Error('正在进入或已在房间中，请先退出');
        const request = { serverUrl: this.serverUrl };
        this._roomRequest = request;
        const isCurrent = () => this._roomRequest === request && this.serverUrl === request.serverUrl;
        try {
            const data = await this._post(path, body);
            if (!isCurrent()) {
                await this._fetchWithTimeout(`${request.serverUrl}/room/${data.roomId}/leave`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.playerToken}` },
                    body: JSON.stringify({ playerId: data.playerId })
                }).catch(() => {});
                return null;
            }
            this.roomId = data.roomId;
            this.playerId = data.playerId;
            this.playerToken = data.playerToken;
            this.playerName = body.playerName;
            this.isHost = isHost;
            this.players = [{ id: this.playerId, name: this.playerName, isHost }];
            this._startSSE();
            const result = isHost ? { roomId: this.roomId, players: this.players } : { roomId: this.roomId, playerId: this.playerId };
            this.emit(isHost ? 'roomCreated' : 'roomJoined', { ...result, name: body.name });
            return result;
        } catch (error) {
            if (!isCurrent()) return null;
            throw error;
        } finally {
            if (this._roomRequest === request) this._roomRequest = null;
        }
    }

    // ===== SSE 长连接（信令接收） =====

    _startSSE() {
        if (this._sseStarting) return;
        if (this.sseReconnectTimer) {
            clearTimeout(this.sseReconnectTimer);
            this.sseReconnectTimer = null;
        }
        this._stopHeartbeat();
        if (this.sse) {
            this.sse.onopen = this.sse.onmessage = this.sse.onerror = null;
            this.sse.close();
        }

        this._sseStarting = true;
        this.connecting = true;
        this.emit('connecting');

        const params = new URLSearchParams({ playerId: this.playerId, token: this.playerToken || '' });
        const sse = new EventSource(`${this.serverUrl}/room/${this.roomId}/events?${params}`);
        this.sse = sse;

        this.sse.onopen = () => {
            if (this.sse !== sse || !this.roomId) return;
            this._sseStarting = false;
            this.connected = true;
            this.connecting = false;
            this.lastPong = Date.now();
            this.sseReconnectAttempts = 0;
            this.emit('connected');
            this._startHeartbeat();
        };

        this.sse.onmessage = (e) => {
            if (this.sse !== sse || !this.roomId) return;
            try {
                const msg = JSON.parse(e.data);
                this._handleSignal(msg).catch(err => {
                    console.error('Signal error:', err);
                    this.emit('error', err);
                });
            } catch (err) {
                // SSE 注释行 ping 等不处理
            }
        };

        this.sse.onerror = () => {
            if (this.sse !== sse || !this.roomId) return;
            this._sseStarting = false;
            this.connected = false;
            this.connecting = false;
            this.emit('disconnected');
            this._stopHeartbeat();
            sse.close();
            this.sse = null;
            if (this.sseReconnectTimer) { clearTimeout(this.sseReconnectTimer); this.sseReconnectTimer = null; }
            // 自动重连（3秒后），最多重试5次
            if (this.roomId && this.sseReconnectAttempts < 5) {
                this.sseReconnectAttempts++;
                this.sseReconnectTimer = setTimeout(() => this._startSSE(), 3000);
            }
        };
    }

    // ===== 心跳 =====

    _startHeartbeat() {
        this._stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (Date.now() - this.lastPong > 12000) this.sse?.onerror?.();
        }, 3000);
    }

    _stopHeartbeat() {
        if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    }

    // ===== 信令消息处理 =====

    async _handleSignal(msg) {
        this.lastPong = Date.now();
        this.sseReconnectAttempts = 0;

        switch (msg.type) {
            case 'roomState': {
                this.players = msg.players;
                for (const [id] of this.peers) {
                    if (!this.players.some(player => player.id === id && player.online)) this._closePeer(id, false);
                }
                this.emit('playerListUpdated', this.players);
                if (msg.config) this.emit('gameStart', msg.config);
                if (this.isHost) {
                    for (const player of this.players) {
                        if (player.id !== this.playerId && player.online && !this.peers.has(player.id)) {
                            this._createOffer(player.id);
                        }
                    }
                }
                break;
            }
            case 'playerJoined': {
                if (!this.players.find(p => p.id === msg.playerId)) {
                    this.players.push({ id: msg.playerId, name: msg.name, isHost: false, online: false });
                }
                this.emit('playerListUpdated', this.players);
                break;
            }
            case 'playerOnline': {
                const existing = this.players.find(p => p.id === msg.playerId);
                if (existing) {
                    existing.isHost = msg.isHost === true;
                    existing.online = msg.online !== false;
                } else {
                    this.players.push({ id: msg.playerId, name: msg.name, isHost: msg.isHost === true, online: msg.online !== false });
                }
                if (msg.online !== false && this.isHost && msg.playerId !== this.playerId &&
                    this.channels.get(msg.playerId)?.readyState !== 'open') {
                    this._closePeer(msg.playerId, false);
                    this.peerReconnectAttempts.delete(msg.playerId);
                    await this._createOffer(msg.playerId);
                }
                this.emit('playerListUpdated', this.players);
                break;
            }
            case 'playerOffline': {
                const offlinePlayer = this.players.find(p => p.id === msg.playerId);
                this.emit('playerDisconnected', { playerId: msg.playerId, name: offlinePlayer?.name });
                if (offlinePlayer) offlinePlayer.online = false;
                this._closePeer(msg.playerId, false);
                this.emit('playerListUpdated', this.players);
                break;
            }
            case 'playerLeft': {
                this._closePeer(msg.playerId, false);
                this.players = this.players.filter(p => p.id !== msg.playerId);
                this.emit('playerListUpdated', this.players);
                break;
            }
            case 'sdp-offer': {
                if (msg.data && msg.data.targetId === this.playerId) {
                    await this._handleOffer(msg.from, msg.data.sdp, msg.data.connectionId);
                }
                break;
            }
            case 'sdp-answer': {
                if (msg.data && msg.data.targetId === this.playerId) {
                    await this._handleAnswer(msg.from, msg.data.sdp, msg.data.connectionId);
                }
                break;
            }
            case 'ice-candidate': {
                if (msg.data && msg.data.targetId === this.playerId) {
                    await this._handleIce(msg.from, msg.data.candidate, msg.data.connectionId);
                }
                break;
            }
            case 'gameStart': {
                this.emit('gameStart', msg.config);
                break;
            }
            case 'roomClosed': {
                await this.leaveRoom(false);
                this.emit('error', new Error('房主已离开，房间已关闭'));
                break;
            }
            case 'ping': {
                // 心跳回复，刷新 lastPong
                break;
            }
        }
    }

    // ===== WebRTC P2P =====

    _getPeer(playerId) {
        if (!this.peers.has(playerId)) {
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            pc.onicecandidate = (e) => {
                if (e.candidate && this.peers.get(playerId) === pc) {
                    this._sendSignal('ice-candidate', { targetId: playerId, candidate: e.candidate.toJSON(), connectionId: pc.connectionId });
                }
            };
            pc.onconnectionstatechange = () => {
                if (this.peers.get(playerId) !== pc) return;
                if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                    this._closePeer(playerId);
                }
            };
            pc.ondatachannel = (e) => {
                if (this.peers.get(playerId) === pc) this._attachChannel(playerId, e.channel);
            };
            this.peers.set(playerId, pc);
        }
        return this.peers.get(playerId);
    }

    _attachChannel(playerId, channel) {
        const previous = this.channels.get(playerId);
        if (previous && previous !== channel) {
            previous.onopen = previous.onclose = previous.onerror = previous.onmessage = null;
            previous.close?.();
        }
        this.channels.set(playerId, channel);
        channel.onopen = () => {
            if (this.channels.get(playerId) !== channel) return;
            this._clearPeerReconnect(playerId);
            this.peerReconnectAttempts.delete(playerId);
            this.emit('peerConnected', playerId);
        };
        channel.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                // 基本校验：只允许纯对象且必须包含 type 字段
                if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.type !== 'string') {
                    console.warn('P2P DataChannel invalid message from', playerId, msg);
                    return;
                }
                this.emit('data', { ...msg, from: playerId });
            } catch (err) {
                console.warn('P2P DataChannel message parse error from', playerId, err);
            }
        };
        channel.onerror = () => {
            if (this.channels.get(playerId) === channel) this._closePeer(playerId);
        };
        channel.onclose = () => {
            if (this.channels.get(playerId) === channel) this._closePeer(playerId);
        };
    }

    async _createOffer(targetId) {
        if (this.peers.has(targetId)) return;
        this._clearPeerReconnect(targetId);
        let pc;
        try {
            pc = this._getPeer(targetId);
            pc.connectionId = Utils.uuid();
            const channel = pc.createDataChannel('game', { ordered: true });
            this._attachChannel(targetId, channel);
            this.peerReconnectTimers.set(targetId, setTimeout(() => {
                if (this.peers.get(targetId) === pc && channel.readyState !== 'open') this._closePeer(targetId);
            }, 10000));
            const offer = await pc.createOffer();
            if (this.peers.get(targetId) !== pc) return;
            await pc.setLocalDescription(offer);
            if (this.peers.get(targetId) !== pc) return;
            this._sendSignal('sdp-offer', { targetId, sdp: offer, connectionId: pc.connectionId });
        } catch (e) {
            if (pc && this.peers.get(targetId) !== pc) return;
            this._closePeer(targetId);
            console.error('createOffer error:', e);
            this.emit('error', e);
        }
    }

    async _handleOffer(fromId, sdp, connectionId) {
        const pending = (this.pendingIce.get(fromId) || []).filter(item => item.connectionId === connectionId);
        if (this.peers.has(fromId)) this._closePeer(fromId, false);
        this.pendingIce.set(fromId, pending);
        const pc = this._getPeer(fromId);
        pc.connectionId = connectionId;
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            if (this.peers.get(fromId) !== pc) return;
            await this._flushIce(fromId, pc);
            const answer = await pc.createAnswer();
            if (this.peers.get(fromId) !== pc) return;
            await pc.setLocalDescription(answer);
            if (this.peers.get(fromId) !== pc) return;
            this._sendSignal('sdp-answer', { targetId: fromId, sdp: answer, connectionId });
        } catch (e) {
            if (this.peers.get(fromId) !== pc) return;
            console.error('handleOffer error:', e);
            this.emit('error', e);
        }
    }

    async _handleAnswer(fromId, sdp, connectionId) {
        const pc = this.peers.get(fromId);
        try {
            if (!pc || pc.connectionId !== connectionId) return;
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            if (this.peers.get(fromId) === pc) await this._flushIce(fromId, pc);
        } catch (e) {
            if (this.peers.get(fromId) !== pc) return;
            console.error('handleAnswer error:', e);
            this.emit('error', e);
        }
    }

    async _handleIce(fromId, candidate, connectionId) {
        const pc = this.peers.get(fromId);
        try {
            if (!pc?.remoteDescription || pc.connectionId !== connectionId) {
                const pending = this.pendingIce.get(fromId) || [];
                pending.push({ candidate, connectionId });
                this.pendingIce.set(fromId, pending);
                return;
            }
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            if (this.peers.get(fromId) !== pc) return;
            console.error('handleIce error:', e);
            this.emit('error', e);
        }
    }

    async _flushIce(playerId, pc) {
        const pending = this.pendingIce.get(playerId) || [];
        this.pendingIce.delete(playerId);
        for (const { candidate, connectionId } of pending) {
            if (this.peers.get(playerId) !== pc) return;
            if (connectionId === pc.connectionId) await this._handleIce(playerId, candidate, connectionId);
        }
    }

    _clearPeerReconnect(playerId) {
        clearTimeout(this.peerReconnectTimers.get(playerId));
        this.peerReconnectTimers.delete(playerId);
    }

    _schedulePeerReconnect(playerId) {
        if (!this.isHost || !this.roomId || !this.connected ||
            !this.players.some(player => player.id === playerId && player.online !== false)) return;
        const attempts = this.peerReconnectAttempts.get(playerId) || 0;
        if (attempts >= 5) {
            this.emit('error', new Error('游戏连接恢复失败，请退出房间后重新加入'));
            return;
        }
        this.peerReconnectAttempts.set(playerId, attempts + 1);
        this.peerReconnectTimers.set(playerId, setTimeout(() => {
            this.peerReconnectTimers.delete(playerId);
            if (!this.peers.has(playerId) && this.connected && this.roomId &&
                this.players.some(player => player.id === playerId && player.online !== false)) this._createOffer(playerId);
        }, 1000 * Math.min(attempts + 1, 3)));
    }

    _sendSignal(type, data) {
        if (!this.roomId || !this.playerId) return;
        let body;
        try {
            body = JSON.stringify({ playerId: this.playerId, type, data });
        } catch (e) {
            console.error('P2P _sendSignal JSON.stringify error:', e);
            return;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        fetch(`${this.serverUrl}/room/${this.roomId}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.playerToken}` },
            body,
            signal: controller.signal
        }).catch(() => {}).finally(() => clearTimeout(timeout));
    }

    _closePeer(playerId, reconnect = true) {
        this._clearPeerReconnect(playerId);
        this.pendingIce.delete(playerId);
        const pc = this.peers.get(playerId);
        const channel = this.channels.get(playerId);
        this.peers.delete(playerId);
        this.channels.delete(playerId);
        if (!pc && !channel) return;
        if (channel) {
            channel.onopen = channel.onclose = channel.onerror = channel.onmessage = null;
            try { channel.close?.(); } catch (_) {}
        }
        if (pc) {
            pc.onconnectionstatechange = pc.ondatachannel = pc.onicecandidate = null;
            try { pc.close(); } catch (_) {}
        }
        this.emit('peerDisconnected', playerId);
        if (reconnect) this._schedulePeerReconnect(playerId);
    }

    // ===== 游戏状态同步 =====

    broadcast(data) {
        // 通过 DataChannel 广播给所有 peer
        let msg;
        try { msg = JSON.stringify(data); }
        catch (e) { console.error('broadcast JSON.stringify error:', e); return; }
        for (const [pid, ch] of this.channels) {
            if (ch.readyState === 'open') {
                try { ch.send(msg); } catch (e) {}
            }
        }
    }

    sendTo(playerId, data) {
        const ch = this.channels.get(playerId);
        if (ch && ch.readyState === 'open') {
            let msg;
            try { msg = JSON.stringify(data); }
            catch (e) { console.error('sendTo JSON.stringify error:', e); return false; }
            try { ch.send(msg); return true; }
            catch (e) { console.error('sendTo failed:', e); return false; }
        }
        return false;
    }

    // ===== 开始游戏 =====

    async startGame(config) {
        if (!this.isHost) throw new Error('只有房主可以开始');
        if (this._startGamePromise) return this._startGamePromise;
        const request = this._post('/room/' + this.roomId + '/start', {
            playerId: this.playerId, config
        });
        this._startGamePromise = request;
        try { await request; }
        finally { if (this._startGamePromise === request) this._startGamePromise = null; }
    }

    // ===== 离开/销毁 =====

    async leaveRoom(notifyServer = true) {
        this._sseStarting = false;
        this._startGamePromise = null;
        this._roomRequest = null;
        if (this.sseReconnectTimer) { clearTimeout(this.sseReconnectTimer); this.sseReconnectTimer = null; }
        this._stopHeartbeat();
        if (this.sse) {
            this.sse.onopen = this.sse.onmessage = this.sse.onerror = null;
            this.sse.close();
            this.sse = null;
        }

        for (const [pid] of this.peerReconnectTimers) this._clearPeerReconnect(pid);
        for (const [pid] of this.peers) this._closePeer(pid, false);
        this.peers.clear();
        this.channels.clear();
        this.pendingIce.clear();
        this.peerReconnectAttempts.clear();

        const leaving = notifyServer && this.roomId && this.playerId
            ? this._post(`/room/${this.roomId}/leave`, { playerId: this.playerId }).catch(() => {})
            : Promise.resolve();

        this.roomId = null;
        this.playerId = null;
        this.playerToken = null;
        this.isHost = false;
        this.players = [];
        this.connected = false;
        this.connecting = false;
        this.emit('left');
        await leaving;
    }

    async destroy() {
        await this.leaveRoom();
        this.removeAllListeners();
    }
}
