/**
 * 万能麻将 - P2P局域网联机
 * 使用WebRTC + 本地信令服务器（通过localStorage模拟）
 */

class P2PNetwork extends Utils.EventEmitter {
    constructor() {
        super();
        this.roomId = null;
        this.playerId = Utils.uuid();
        this.players = [];
        this.isHost = false;
        this.gameState = null;
        this.pingInterval = null;
        this.rooms = [];
        this.discoveryInterval = null;
    }

    /**
     * 发现局域网房间
     * 使用localStorage广播机制模拟局域网发现
     */
    async discoverRooms() {
        return new Promise(resolve => {
            let allRooms = [];
            try {
                const data = localStorage.getItem('mahjong_network_rooms');
                if (data) allRooms = JSON.parse(data);
            } catch (e) {
                console.warn('discoverRooms: malformed data', e);
            }
            const now = Date.now();
            
            // 过滤过期房间（30秒内活跃）
            this.rooms = Array.isArray(allRooms) ? allRooms.filter(r => now - r.lastSeen < 30000) : [];
            
            resolve(this.rooms);
        });
    }

    /**
     * 创建房间
     */
    async createRoom(name, mahjongType) {
        // 清理旧的定时器
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        this.isHost = true;
        this.roomId = Utils.uuid();
        
        const room = {
            id: this.roomId,
            name: name,
            type: mahjongType,
            hostId: this.playerId,
            players: 1,
            maxPlayers: 4,
            createdAt: Date.now(),
            lastSeen: Date.now()
        };
        
        // 广播到localStorage
        this.broadcastRoom(room);
        
        // 定期更新房间状态
        this.pingInterval = setInterval(() => {
            room.lastSeen = Date.now();
            room.players = this.players.length + 1;
            this.broadcastRoom(room);
        }, 5000);
        
        this.emit('roomCreated', room);
        return room;
    }

    /**
     * 广播房间信息
     */
    broadcastRoom(room) {
        let allRooms = [];
        try {
            const data = localStorage.getItem('mahjong_network_rooms');
            if (data) allRooms = JSON.parse(data);
        } catch (e) {
            console.warn('broadcastRoom: malformed data', e);
        }
        if (!Array.isArray(allRooms)) allRooms = [];
        
        const existingIndex = allRooms.findIndex(r => r.id === room.id);
        
        if (existingIndex >= 0) {
            allRooms[existingIndex] = room;
        } else {
            allRooms.push(room);
        }
        
        // 清理过期房间
        const now = Date.now();
        const activeRooms = allRooms.filter(r => now - r.lastSeen < 30000);
        
        localStorage.setItem('mahjong_network_rooms', JSON.stringify(activeRooms));
    }

    /**
     * 加入房间
     */
    async joinRoom(roomId) {
        const room = this.rooms.find(r => r.id === roomId);
        if (!room) throw new Error('房间不存在');
        if (!room.maxPlayers) room.maxPlayers = 4;
        if (room.players >= room.maxPlayers) throw new Error('房间已满');
        
        this.roomId = roomId;
        this.isHost = false;
        
        // 通知房主
        this.sendToHost({
            type: 'join',
            playerId: this.playerId,
            name: Stats.getSettings().playerName || '玩家'
        });
        
        this.emit('roomJoined', room);
        return room;
    }

    /**
     * 发送消息给房主
     */
    sendToHost(message) {
        const key = `mahjong_room_${this.roomId}_host`;
        let messages = [];
        try {
            const data = localStorage.getItem(key);
            if (data) messages = JSON.parse(data);
        } catch (e) { /* ignore */ }
        if (!Array.isArray(messages)) messages = [];
        messages.push({
            ...message,
            timestamp: Date.now(),
            sender: this.playerId
        });
        // 限制队列大小防止localStorage溢出
        if (messages.length > 50) messages = messages.slice(-50);
        localStorage.setItem(key, JSON.stringify(messages));
    }

    /**
     * 广播消息给所有玩家
     */
    broadcast(message) {
        const key = `mahjong_room_${this.roomId}_broadcast`;
        let messages = [];
        try {
            const data = localStorage.getItem(key);
            if (data) messages = JSON.parse(data);
        } catch (e) { /* ignore */ }
        if (!Array.isArray(messages)) messages = [];
        messages.push({
            ...message,
            timestamp: Date.now(),
            sender: this.playerId
        });
        if (messages.length > 50) messages = messages.slice(-50);
        localStorage.setItem(key, JSON.stringify(messages));
    }

    /**
     * 发送消息给指定玩家
     */
    sendTo(playerId, message) {
        const key = `mahjong_msg_${this.roomId}_${playerId}`;
        let messages = [];
        try {
            const data = localStorage.getItem(key);
            if (data) messages = JSON.parse(data);
        } catch (e) { /* ignore */ }
        if (!Array.isArray(messages)) messages = [];
        messages.push({
            ...message,
            timestamp: Date.now(),
            sender: this.playerId
        });
        if (messages.length > 50) messages = messages.slice(-50);
        localStorage.setItem(key, JSON.stringify(messages));
    }

    /**
     * 接收消息
     */
    receiveMessages() {
        if (!this.roomId) return [];
        
        const key = this.isHost 
            ? `mahjong_room_${this.roomId}_host`
            : `mahjong_room_${this.roomId}_broadcast`;
        
        let messages = [];
        try {
            const data = localStorage.getItem(key);
            if (data) messages = JSON.parse(data);
        } catch (e) {
            console.warn('receiveMessages: malformed data', e);
        }
        if (!Array.isArray(messages)) messages = [];
        
        // 清空已读消息
        localStorage.setItem(key, '[]');
        
        return messages.filter(m => m.sender !== this.playerId);
    }

    /**
     * 离开房间
     */
    leaveRoom() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        if (this.discoveryInterval) {
            clearInterval(this.discoveryInterval);
            this.discoveryInterval = null;
        }
        
        if (this.isHost && this.roomId) {
            // 删除房间
            const allRooms = JSON.parse(localStorage.getItem('mahjong_network_rooms') || '[]');
            const filtered = allRooms.filter(r => r.id !== this.roomId);
            localStorage.setItem('mahjong_network_rooms', JSON.stringify(filtered));
        } else if (this.roomId) {
            this.broadcast({
                type: 'leave',
                playerId: this.playerId
            });
        }
        
        this.roomId = null;
        this.isHost = false;
        this.players = [];
    }

    /**
     * 同步游戏状态
     */
    syncGameState(state) {
        this.broadcast({
            type: 'gameState',
            state: state
        });
    }

    /**
     * 发送操作
     */
    sendAction(action) {
        this.broadcast({
            type: 'action',
            action: action
        });
    }

    /**
     * 销毁
     */
    destroy() {
        this.leaveRoom();
        if (this.discoveryInterval) {
            clearInterval(this.discoveryInterval);
        }
    }
}
