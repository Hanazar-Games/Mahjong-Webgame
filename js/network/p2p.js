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
        this.lastEventId = 0;
        this.playerName = '';
        this.isHost = false;
        this.peers = new Map();   // playerId -> RTCPeerConnection
        this.channels = new Map(); // playerId -> RTCDataChannel
        this.players = [];         // 房间中所有玩家信息 [{id, name, isHost}]
        this.sse = null;
        this.sseReconnectTimer = null;
        this.heartbeatTimer = null;
        this.lastPong = Date.now();
        this.sseReconnectAttempts = 0;
        this.connected = false;
        this.connecting = false;
        this._sseStarting = false;
    }

    // ===== 连接管理 =====

    setServerUrl(url) {
        this.serverUrl = url.replace(/\/$/, '');
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
        return data.rooms || [];
    }

    // ===== 创建房间 =====

    async createRoom(name, mahjongType, playerName) {
        if (!this.serverUrl) throw new Error('未设置服务器地址');
        this.playerName = playerName || '玩家';
        const data = await this._post('/room/create', {
            name, mahjongType, playerName: this.playerName, maxPlayers: 4
        });
        this.roomId = data.roomId;
        this.playerId = data.playerId;
        this.playerToken = data.playerToken;
        this.lastEventId = 0;
        this.isHost = true;
        this.players = [{ id: this.playerId, name: this.playerName, isHost: true }];
        this._startSSE();
        this.emit('roomCreated', { roomId: this.roomId, name, players: this.players });
        return { roomId: this.roomId, players: this.players };
    }

    // ===== 加入房间 =====

    async joinRoom(roomId, playerName) {
        if (!this.serverUrl) throw new Error('未设置服务器地址');
        this.playerName = playerName || '玩家';
        const data = await this._post('/room/' + roomId + '/join', {
            playerName: this.playerName
        });
        this.roomId = data.roomId;
        this.playerId = data.playerId;
        this.playerToken = data.playerToken;
        this.lastEventId = 0;
        this.isHost = false;
        // 把自己加入列表，SSE 会推送其他玩家
        this.players = [{ id: this.playerId, name: this.playerName, isHost: false }];
        this._startSSE();
        this.emit('roomJoined', { roomId: this.roomId, playerId: this.playerId });
        return { roomId: this.roomId, playerId: this.playerId };
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

        const params = new URLSearchParams({ playerId: this.playerId, token: this.playerToken || '', lastId: this.lastEventId });
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
                if (msg.id && msg.id <= this.lastEventId) return;
                if (msg.id) this.lastEventId = msg.id;
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
            case 'playerJoined': {
                if (!this.players.find(p => p.id === msg.playerId)) {
                    this.players.push({ id: msg.playerId, name: msg.name, isHost: false });
                    if (this.isHost && msg.playerId !== this.playerId) {
                        this._createOffer(msg.playerId).catch(err => {
                            console.error('createOffer error:', err);
                        });
                    }
                }
                this.emit('playerListUpdated', this.players);
                break;
            }
            case 'playerOnline': {
                const existing = this.players.find(p => p.id === msg.playerId);
                if (existing) {
                    existing.isHost = msg.isHost === true;
                    existing.online = true;
                } else {
                    this.players.push({ id: msg.playerId, name: msg.name, isHost: msg.isHost === true, online: true });
                }
                if (this.isHost && msg.playerId !== this.playerId && !this.peers.has(msg.playerId)) {
                    await this._createOffer(msg.playerId);
                }
                this.emit('playerListUpdated', this.players);
                break;
            }
            case 'playerOffline': {
                const offlinePlayer = this.players.find(p => p.id === msg.playerId);
                this.emit('playerDisconnected', { playerId: msg.playerId, name: offlinePlayer?.name });
                this._closePeer(msg.playerId);
                if (offlinePlayer) offlinePlayer.online = false;
                this.emit('playerListUpdated', this.players);
                break;
            }
            case 'playerLeft': {
                this._closePeer(msg.playerId);
                this.players = this.players.filter(p => p.id !== msg.playerId);
                this.emit('playerListUpdated', this.players);
                break;
            }
            case 'sdp-offer': {
                if (msg.data && msg.data.targetId === this.playerId) {
                    await this._handleOffer(msg.from, msg.data.sdp);
                }
                break;
            }
            case 'sdp-answer': {
                if (msg.data && msg.data.targetId === this.playerId) {
                    await this._handleAnswer(msg.from, msg.data.sdp);
                }
                break;
            }
            case 'ice-candidate': {
                if (msg.data && msg.data.targetId === this.playerId) {
                    await this._handleIce(msg.from, msg.data.candidate);
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
                if (e.candidate) {
                    this._sendSignal('ice-candidate', { targetId: playerId, candidate: e.candidate.toJSON() });
                }
            };
            pc.onconnectionstatechange = () => {
                if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                    this._closePeer(playerId);
                }
            };
            pc.ondatachannel = (e) => {
                this._attachChannel(playerId, e.channel);
            };
            this.peers.set(playerId, pc);
        }
        return this.peers.get(playerId);
    }

    _attachChannel(playerId, channel) {
        const previous = this.channels.get(playerId);
        if (previous && previous !== channel) {
            previous.onclose = previous.onerror = previous.onmessage = null;
            previous.close?.();
        }
        this.channels.set(playerId, channel);
        channel.onopen = () => {
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
        try {
            const pc = this._getPeer(targetId);
            const channel = pc.createDataChannel('game', { ordered: true });
            this._attachChannel(targetId, channel);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this._sendSignal('sdp-offer', { targetId, sdp: offer });
        } catch (e) {
            console.error('createOffer error:', e);
            this.emit('error', e);
        }
    }

    async _handleOffer(fromId, sdp) {
        try {
            const pc = this._getPeer(fromId);
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            this._sendSignal('sdp-answer', { targetId: fromId, sdp: answer });
        } catch (e) {
            console.error('handleOffer error:', e);
            this.emit('error', e);
        }
    }

    async _handleAnswer(fromId, sdp) {
        try {
            const pc = this.peers.get(fromId);
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (e) {
            console.error('handleAnswer error:', e);
            this.emit('error', e);
        }
    }

    async _handleIce(fromId, candidate) {
        try {
            const pc = this.peers.get(fromId);
            if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error('handleIce error:', e);
            this.emit('error', e);
        }
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

    _closePeer(playerId) {
        const pc = this.peers.get(playerId);
        const channel = this.channels.get(playerId);
        this.peers.delete(playerId);
        this.channels.delete(playerId);
        if (!pc && !channel) return;
        if (channel) {
            channel.onclose = channel.onerror = channel.onmessage = null;
            try { channel.close?.(); } catch (_) {}
        }
        if (pc) {
            pc.onconnectionstatechange = pc.ondatachannel = pc.onicecandidate = null;
            try { pc.close(); } catch (_) {}
        }
        this.emit('peerDisconnected', playerId);
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
        await this._post('/room/' + this.roomId + '/start', {
            playerId: this.playerId, config
        });
    }

    // ===== 离开/销毁 =====

    async leaveRoom(notifyServer = true) {
        this._sseStarting = false;
        if (this.sseReconnectTimer) { clearTimeout(this.sseReconnectTimer); this.sseReconnectTimer = null; }
        this._stopHeartbeat();
        if (this.sse) {
            this.sse.onopen = this.sse.onmessage = this.sse.onerror = null;
            this.sse.close();
            this.sse = null;
        }

        for (const [pid] of this.peers) this._closePeer(pid);
        this.peers.clear();
        this.channels.clear();

        const leaving = notifyServer && this.roomId && this.playerId
            ? this._post(`/room/${this.roomId}/leave`, { playerId: this.playerId }).catch(() => {})
            : Promise.resolve();

        this.roomId = null;
        this.playerId = null;
        this.playerToken = null;
        this.lastEventId = 0;
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
