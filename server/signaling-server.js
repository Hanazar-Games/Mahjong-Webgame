/**
 * 万能麻将 - 局域网信令服务器
 * Node.js 原生 HTTP + SSE，零外部依赖
 * 只负责 WebRTC SDP/ICE 交换，游戏数据通过 DataChannel P2P 传输
 *
 * 启动: node server/signaling-server.js [端口]
 * 默认端口: 8081
 */

const http = require('http');
const url = require('url');
const os = require('os');

const PORT = parseInt(process.argv[2]) || 8081;

// ===== 内存状态 =====
const rooms = new Map();   // roomId -> Room
const players = new Map(); // playerId -> { roomId, name, isHost, res, lastEventId }
let nextMsgId = 1;

// ===== 工具函数 =====
function jsonResponse(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(data));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); }
            catch (e) { reject(new Error('Invalid JSON: ' + e.message)); }
        });
        req.on('error', reject);
    });
}

function broadcast(roomId, msg, excludePlayerId) {
    const room = rooms.get(roomId);
    if (!room) return;
    msg.id = nextMsgId++;
    room.messages.push(msg);
    if (room.messages.length > 200) room.messages = room.messages.slice(-100);

    for (const pid of room.playerIds) {
        if (pid === excludePlayerId) continue;
        const p = players.get(pid);
        if (p && p.res && !p.res.writableEnded) {
            try { p.res.write(`data: ${JSON.stringify(msg)}\n\n`); }
            catch (e) { /* SSE 写入失败 */ }
        }
    }
}

function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.socket.remoteAddress
        || 'unknown';
}

function generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return rooms.has(id) ? generateRoomId() : id;
}

function generatePlayerId() {
    return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ===== 清理过期房间（每60秒） =====
setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [roomId, room] of rooms) {
        if (room.lastActivity < cutoff) {
            for (const pid of room.playerIds) {
                const p = players.get(pid);
                if (p && p.res && !p.res.writableEnded) {
                    try { p.res.end(); } catch (e) {}
                }
                players.delete(pid);
            }
            rooms.delete(roomId);
            console.log(`[清理] 房间 ${roomId} 已过期删除`);
        }
    }
}, 60 * 1000);

// ===== HTTP 服务器 =====
const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const parsed = url.parse(req.url, true);
    const path = parsed.pathname;

    try {
        // --- GET /rooms ---
        if (path === '/rooms' && req.method === 'GET') {
            const list = [];
            for (const [id, room] of rooms) {
                if (room.started) continue; // 已开始的不显示
                const pinfos = room.playerIds.map(pid => {
                    const p = players.get(pid);
                    return { id: pid, name: p?.name || '未知', isHost: p?.isHost || false };
                });
                list.push({ id, name: room.name, type: room.mahjongType,
                    players: room.playerIds.length, maxPlayers: room.maxPlayers, pinfos });
            }
            jsonResponse(res, 200, { rooms: list });
            return;
        }

        // --- POST /room/create ---
        if (path === '/room/create' && req.method === 'POST') {
            const body = await readBody(req);
            const roomId = generateRoomId();
            const playerId = generatePlayerId();
            const room = {
                id: roomId, name: String(body.name || '麻将房').slice(0, 20),
                mahjongType: body.mahjongType || 'guangdong',
                maxPlayers: Math.min(4, Math.max(2, parseInt(body.maxPlayers) || 4)),
                playerIds: [playerId], messages: [], createdAt: Date.now(),
                lastActivity: Date.now(), started: false
            };
            rooms.set(roomId, room);
            players.set(playerId, {
                roomId, name: String(body.playerName || '房主').slice(0, 12),
                isHost: true, res: null, lastEventId: 0
            });
            console.log(`[创建] 房间 ${roomId} 来自 ${getClientIP(req)}`);
            jsonResponse(res, 200, { roomId, playerId, isHost: true });
            return;
        }

        // --- POST /room/:id/join ---
        const joinMatch = path.match(/^\/room\/([a-zA-Z0-9_-]+)\/join$/);
        if (joinMatch && req.method === 'POST') {
            const roomId = joinMatch[1];
            const room = rooms.get(roomId);
            if (!room) { jsonResponse(res, 404, { error: '房间不存在' }); return; }
            if (room.started) { jsonResponse(res, 403, { error: '游戏已开始' }); return; }
            if (room.playerIds.length >= room.maxPlayers) {
                jsonResponse(res, 403, { error: '房间已满' }); return;
            }
            const body = await readBody(req);
            const playerId = generatePlayerId();
            room.playerIds.push(playerId);
            room.lastActivity = Date.now();
            players.set(playerId, {
                roomId, name: String(body.playerName || '玩家').slice(0, 12),
                isHost: false, res: null, lastEventId: 0
            });
            broadcast(roomId, {
                type: 'playerJoined', playerId,
                name: players.get(playerId).name,
                count: room.playerIds.length,
                maxPlayers: room.maxPlayers
            });
            console.log(`[加入] ${playerId} -> 房间 ${roomId}`);
            jsonResponse(res, 200, { roomId, playerId, isHost: false });
            return;
        }

        // --- GET /room/:id/events (SSE) ---
        const eventsMatch = path.match(/^\/room\/([a-zA-Z0-9_-]+)\/events$/);
        if (eventsMatch && req.method === 'GET') {
            const roomId = eventsMatch[1];
            const playerId = parsed.query.playerId;
            const p = players.get(playerId);
            if (!p || p.roomId !== roomId) {
                res.writeHead(403, { 'Content-Type': 'text/plain' });
                res.end('Forbidden'); return;
            }
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });
            res.write(':ok\n\n');
            p.res = res;
            p.lastEventId = parseInt(parsed.query.lastId) || 0;
            const room = rooms.get(roomId);
            room.lastActivity = Date.now();

            // 补发历史消息
            for (const msg of room.messages) {
                if (msg.id > p.lastEventId) {
                    try { res.write(`data: ${JSON.stringify(msg)}\n\n`); }
                    catch (e) {}
                }
            }

            // 向新连接玩家发送当前房间中所有其他玩家信息
            for (const pid of room.playerIds) {
                if (pid === playerId) continue;
                const other = players.get(pid);
                if (other) {
                    try {
                        res.write(`data: ${JSON.stringify({
                            type: 'playerOnline',
                            playerId: pid,
                            name: other.name,
                            isHost: other.isHost
                        })}\n\n`);
                    } catch (e) {}
                }
            }

            // 通知其他人此玩家上线
            broadcast(roomId, { type: 'playerOnline', playerId, name: p.name }, playerId);

            // SSE 心跳（25秒）
            const heartbeat = setInterval(() => {
                if (res.writableEnded) { clearInterval(heartbeat); return; }
                try { res.write(`:ping\n\n`); }
                catch (e) { clearInterval(heartbeat); }
            }, 25000);

            req.on('close', () => {
                clearInterval(heartbeat);
                p.res = null;
                setTimeout(() => {
                    const cp = players.get(playerId);
                    if (cp && !cp.res) {
                        broadcast(roomId, { type: 'playerOffline', playerId, name: cp.name });
                    }
                }, 1500);
            });
            return;
        }

        // --- POST /room/:id/send ---
        const sendMatch = path.match(/^\/room\/([a-zA-Z0-9_-]+)\/send$/);
        if (sendMatch && req.method === 'POST') {
            const roomId = sendMatch[1];
            const body = await readBody(req);
            const room = rooms.get(roomId);
            if (!room) { jsonResponse(res, 404, { error: '房间不存在' }); return; }
            const p = players.get(body.playerId);
            if (!p || p.roomId !== roomId) { jsonResponse(res, 403, { error: '无效玩家' }); return; }
            room.lastActivity = Date.now();
            broadcast(roomId, {
                type: body.type || 'message',
                from: body.playerId, fromName: p.name,
                data: body.data || {}
            }, body.excludeSelf ? body.playerId : null);
            jsonResponse(res, 200, { ok: true });
            return;
        }

        // --- POST /room/:id/start ---
        const startMatch = path.match(/^\/room\/([a-zA-Z0-9_-]+)\/start$/);
        if (startMatch && req.method === 'POST') {
            const roomId = startMatch[1];
            const body = await readBody(req);
            const room = rooms.get(roomId);
            if (!room) { jsonResponse(res, 404, { error: '房间不存在' }); return; }
            const p = players.get(body.playerId);
            if (!p || !p.isHost) { jsonResponse(res, 403, { error: '只有房主可以开始' }); return; }
            if (room.playerIds.length < 2) { jsonResponse(res, 403, { error: '至少需要2人' }); return; }
            room.started = true;
            broadcast(roomId, { type: 'gameStart', from: body.playerId, config: body.config || {} });
            console.log(`[开始] 房间 ${roomId} 游戏开始 (${room.playerIds.length}人)`);
            jsonResponse(res, 200, { ok: true });
            return;
        }

        // --- POST /room/:id/leave ---
        const leaveMatch = path.match(/^\/room\/([a-zA-Z0-9_-]+)\/leave$/);
        if (leaveMatch && req.method === 'POST') {
            const roomId = leaveMatch[1];
            const body = await readBody(req);
            const room = rooms.get(roomId);
            if (room) {
                room.playerIds = room.playerIds.filter(id => id !== body.playerId);
                broadcast(roomId, { type: 'playerLeft', playerId: body.playerId, count: room.playerIds.length });
                if (room.playerIds.length === 0) {
                    rooms.delete(roomId);
                    console.log(`[解散] 房间 ${roomId} 无人，自动删除`);
                }
            }
            const p = players.get(body.playerId);
            if (p && p.res && !p.res.writableEnded) { try { p.res.end(); } catch (e) {} }
            players.delete(body.playerId);
            jsonResponse(res, 200, { ok: true });
            return;
        }

        jsonResponse(res, 404, { error: 'Not Found' });
    } catch (e) {
        console.error('[错误]', e.message);
        jsonResponse(res, 500, { error: 'Internal Server Error', detail: e.message });
    }
});

server.listen(PORT, '0.0.0.0', () => {
    const nets = os.networkInterfaces();
    console.log(`\n🀄 万能麻将信令服务器已启动`);
    console.log(`   端口: ${PORT}`);
    console.log(`   局域网地址:`);
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`     http://${net.address}:${PORT}`);
            }
        }
    }
    console.log(`   按 Ctrl+C 停止\n`);
});
