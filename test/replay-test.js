/**
 * Node.js 环境下运行回放与统计一致性测试
 * cd 项目根目录 && node test/replay-test.js
 */
const fs = require('fs');
const path = require('path');

// 模拟浏览器 DOM API
const mockDocument = {
    createElement(tag) {
        return {
            tagName: tag, className: '', textContent: '', innerHTML: '',
            style: {}, dataset: {},
            classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
            appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
            setAttribute() {}, getAttribute() { return null; }
        };
    },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    documentElement: { style: {} }
};
const mockWindow = {
    confirm() { return true; },
    addEventListener() {}, removeEventListener() {}
};

global.document = mockDocument;
global.window = mockWindow;

// 加载 Utils
const Utils = (new Function(
    fs.readFileSync(path.join(__dirname, '../js/utils/helpers.js'), 'utf8') + '\n;return Utils;'
))();

// 加载 Tiles
const Tiles = (new Function('Utils',
    fs.readFileSync(path.join(__dirname, '../js/core/tiles.js'), 'utf8') + '\n;return Tiles;'
))(Utils);

// 加载 Player
const Player = (new Function('Tiles', 'Utils',
    fs.readFileSync(path.join(__dirname, '../js/core/player.js'), 'utf8') + '\n;return Player;'
))(Tiles, Utils);

// 加载 Rules
const Rules = (new Function('Tiles', 'Utils',
    fs.readFileSync(path.join(__dirname, '../js/core/rules.js'), 'utf8') + '\n;return Rules;'
))(Tiles, Utils);

// 加载 AIUtils
const AIUtils = (new Function('Tiles', 'Rules', 'Utils',
    fs.readFileSync(path.join(__dirname, '../js/ai/ai-utils.js'), 'utf8') + '\n;return AIUtils;'
))(Tiles, Rules, Utils);

// 加载 AIPlayer
const AIPlayer = (new Function('AIUtils', 'Tiles', 'Rules', 'Utils',
    fs.readFileSync(path.join(__dirname, '../js/ai/ai-player.js'), 'utf8') + '\n;return AIPlayer;'
))(AIUtils, Tiles, Rules, Utils);

// 加载 Engine
const MahjongEngine = (new Function('Utils', 'Tiles', 'Player', 'Rules', 'AIPlayer', 'AIUtils',
    fs.readFileSync(path.join(__dirname, '../js/core/engine.js'), 'utf8') + '\n;return MahjongEngine;'
))(Utils, Tiles, Player, Rules, AIPlayer, AIUtils);

// 加载 Storage（使用内存 shim）
global.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = v; },
    removeItem(k) { delete this._data[k]; },
    get length() { return Object.keys(this._data).length; },
    key(i) { return Object.keys(this._data)[i] || null; },
    clear() { this._data = {}; }
};

// 加载 Storage
const Storage = (new Function(
    fs.readFileSync(path.join(__dirname, '../js/data/storage.js'), 'utf8') + '\n;return Storage;'
))();

// 加载 Stats
const Stats = (new Function('Utils', 'Tiles', 'Storage',
    fs.readFileSync(path.join(__dirname, '../js/data/stats.js'), 'utf8') + '\n;return Stats;'
))(Utils, Tiles, Storage);

// 加载 Replay
const Replay = (new Function('Utils',
    fs.readFileSync(path.join(__dirname, '../js/data/replay.js'), 'utf8') + '\n;return Replay;'
))(Utils);

// ===== 测试框架 =====
let passCount = 0;
let failCount = 0;
const results = [];

function assert(name, condition, detail = '') {
    if (condition) {
        passCount++;
        results.push({ ok: true, name, detail });
    } else {
        failCount++;
        results.push({ ok: false, name, detail });
        console.error('❌', name, detail);
    }
}

function assertEqual(name, actual, expected) {
    const ok = actual === expected;
    assert(name, ok, ok ? '' : `expected ${expected}, got ${actual}`);
}

// ===== 回放数据结构测试 =====

// Test 1: playerDraw 记录 draw 历史
const engine = new MahjongEngine({ mahjongType: 'guangdong', playerCount: 4, speed: 'instant' });
engine.initPlayers([
    { name: 'P0', isAI: false },
    { name: 'P1', isAI: true },
    { name: 'P2', isAI: true },
    { name: 'P3', isAI: true }
]);
engine.deck = Tiles.generateDeck('guangdong');
engine.deckCount = engine.deck.length;
engine.state = 'playing';
engine.currentPlayerIndex = 0;
engine.playerDraw();
const hasDrawRecord = engine.gameHistory.some(h => h.action === 'draw');
assert('playerDraw records draw history', hasDrawRecord, `gameHistory=${JSON.stringify(engine.gameHistory.map(h=>h.action))}`);

// Test 2: draw 记录包含 playerId 和 tile
const drawEntry = engine.gameHistory.find(h => h.action === 'draw');
assert('draw record has playerId', drawEntry && typeof drawEntry.data.playerId === 'number');
assert('draw record has tile id', drawEntry && typeof drawEntry.data.tile === 'string');

// Test 3: createReplayData 返回完整结构
engine.recordHistory('discard', { playerId: 0, tile: 'wan_1' });
const replayData = Replay.createReplayData(engine);
assert('createReplayData returns mahjongType', typeof replayData.mahjongType === 'string');
assert('createReplayData returns players array', Array.isArray(replayData.players) && replayData.players.length === 4);
assert('createReplayData returns rounds array', Array.isArray(replayData.rounds));
assert('createReplayData returns finalScores', Array.isArray(replayData.finalScores) && replayData.finalScores.length === 4);

// Test 4: finalScores.isWin 表示分数最高者（不是 isHu）
// 设置不同分数
engine.players[0].score = 800;
engine.players[1].score = 1200;
engine.players[2].score = 900;
engine.players[3].score = 700;
engine.players[0].isHu = true;
engine.players[1].isHu = false;
const replayData2 = Replay.createReplayData(engine);
const topPlayer = replayData2.finalScores[0];
assertEqual('finalScores winner is highest score', topPlayer.score, 1200);
assertEqual('finalScores.isWin means highest score (not isHu)', topPlayer.isWin, true);
assertEqual('finalScores[1].isWin is false', replayData2.finalScores[1].isWin, false);

// Test 5: ReplayPlayer 能正确重建手牌（draw + discard）
// 构造一个简化的回放数据
const mockReplay = {
    mahjongType: 'guangdong',
    maxRounds: 1,
    players: [
        { id: 0, name: 'P0', isAI: false, position: 0 },
        { id: 1, name: 'P1', isAI: true, position: 1 },
        { id: 2, name: 'P2', isAI: true, position: 2 },
        { id: 3, name: 'P3', isAI: true, position: 3 }
    ],
    rounds: [{
        round: 1,
        wind: 0,
        history: [
            { action: 'gameStart', data: { round: 1, wind: 0, dealer: 0, players: [
                { id: 0, name: 'P0', score: 1000, position: 0, hand: [
                    { id: 'wan_1', suit: 'wan', value: 1 }, { id: 'wan_2', suit: 'wan', value: 2 }
                ], melds: [], discards: [], isHu: false, isDealer: true },
                { id: 1, name: 'P1', score: 1000, position: 1, hand: [
                    { id: 'tong_3', suit: 'tong', value: 3 }
                ], melds: [], discards: [], isHu: false, isDealer: false },
                { id: 2, name: 'P2', score: 1000, position: 2, hand: [], melds: [], discards: [], isHu: false, isDealer: false },
                { id: 3, name: 'P3', score: 1000, position: 3, hand: [], melds: [], discards: [], isHu: false, isDealer: false }
            ]}},
            { action: 'draw', data: { playerId: 0, tile: 'wan_5' } },
            { action: 'discard', data: { playerId: 0, tile: 'wan_1' } }
        ],
        players: []
    }],
    finalScores: []
};

// 使用 ReplayPlayer 逻辑验证（由于需要 DOM，手动模拟核心逻辑）
function simulateReplayPlayer(replayData) {
    const round = replayData.rounds[0];
    let playerStates = [];
    let discardPile = [];

    for (const item of round.history) {
        const action = item.action;
        const data = item.data || {};
        if (action === 'gameStart') {
            playerStates = (data.players || []).map(p => ({
                id: p.id, name: p.name, score: p.score ?? 1000, position: p.position ?? 0,
                hand: Array.isArray(p.hand) ? [...p.hand] : [],
                melds: Array.isArray(p.melds) ? p.melds.map(m => ({...m, tiles: [...(m.tiles || [])]})) : [],
                discards: Array.isArray(p.discards) ? [...p.discards] : [],
                isHu: p.isHu || false, isDealer: p.isDealer || false
            }));
            discardPile = [];
        } else if (action === 'draw') {
            const p = playerStates.find(ps => ps.id === data.playerId);
            if (p && data.tile) p.hand.push(data.tile);
        } else if (action === 'discard') {
            const p = playerStates.find(ps => ps.id === data.playerId);
            if (p) {
                const idx = p.hand.findIndex(t => (t.id || t) === data.tile);
                if (idx >= 0) {
                    const obj = p.hand[idx];
                    p.hand.splice(idx, 1);
                    discardPile.push(obj);
                } else {
                    discardPile.push(data.tile);
                }
            }
        }
    }
    return { playerStates, discardPile };
}

const sim = simulateReplayPlayer(mockReplay);
const p0 = sim.playerStates.find(p => p.id === 0);
assertEqual('replay: P0 hand after draw+discard', p0.hand.length, 2);
assert('replay: P0 hand contains drawn tile', p0.hand.some(t => (t.id || t) === 'wan_5'));
assert('replay: P0 hand no longer has discarded tile', !p0.hand.some(t => (t.id || t) === 'wan_1'));
assertEqual('replay: discardPile has 1 tile', sim.discardPile.length, 1);

// Test 6: 没有 draw 记录时手牌会越来越少（验证问题存在）
const mockReplayNoDraw = {
    ...mockReplay,
    rounds: [{
        ...mockReplay.rounds[0],
        history: [
            mockReplay.rounds[0].history[0], // gameStart
            { action: 'discard', data: { playerId: 0, tile: 'wan_1' } }
        ]
    }]
};
const simNoDraw = simulateReplayPlayer(mockReplayNoDraw);
const p0NoDraw = simNoDraw.playerStates.find(p => p.id === 0);
assertEqual('replay without draw: P0 hand shrinks', p0NoDraw.hand.length, 1);

// ===== 统计一致性测试 =====

// Test 7: Stats.bestGame 支持负值
Stats.resetStats();
Stats.recordGame({ isWin: false, finalScore: 800, netScore: -200, fan: 0, mahjongType: 'guangdong', rounds: 4, wonRounds: 0, gangCount: 0, huCount: 0, ziMoCount: 0 });
const stats1 = Stats.getStats();
assertEqual('Stats.bestGame records negative netScore', stats1.bestGame, -200);

// Test 8: Stats.bestGame 在从未赢过时不是 0
Stats.resetStats();
Stats.recordGame({ isWin: false, finalScore: 900, netScore: -100, fan: 0, mahjongType: 'guangdong', rounds: 4, wonRounds: 0, gangCount: 0, huCount: 0, ziMoCount: 0 });
Stats.recordGame({ isWin: false, finalScore: 850, netScore: -150, fan: 0, mahjongType: 'guangdong', rounds: 4, wonRounds: 0, gangCount: 0, huCount: 0, ziMoCount: 0 });
const stats2 = Stats.getStats();
assertEqual('Stats.bestGame is best (least negative)', stats2.bestGame, -100);

// Test 9: recordGame 的 expGain 计算正确（胜场基础20 + 番数*2）
Stats.resetStats();
const r = Stats.recordGame({ isWin: true, finalScore: 1200, netScore: 200, fan: 8, mahjongType: 'guangdong', rounds: 4, wonRounds: 2, gangCount: 0, huCount: 2, ziMoCount: 1 });
assertEqual('recordGame expGain = 20 + fan*2', r.expGain, 36);
assertEqual('recordGame levelResult gained exp', r.levelResult.gained, 36);

// Test 10: recordGame 的 history 包含所有字段
Stats.resetStats();
Stats.recordGame({ isWin: true, finalScore: 1200, netScore: 200, fan: 5, mahjongType: 'guangdong', rounds: 4, wonRounds: 2, gangCount: 1, huCount: 2, ziMoCount: 1 });
const stats3 = Stats.getStats();
const hist = stats3.history[0];
assert('history has date', typeof hist.date === 'string');
assertEqual('history has mahjongType', hist.mahjongType, 'guangdong');
assertEqual('history has isWin', hist.isWin, true);
assertEqual('history has finalScore', hist.finalScore, 1200);
assertEqual('history has netScore', hist.netScore, 200);
assertEqual('history has fan', hist.fan, 5);
assertEqual('history has rounds', hist.rounds, 4);
assertEqual('history has wonRounds', hist.wonRounds, 2);
assertEqual('history has gangCount', hist.gangCount, 1);
assertEqual('history has huCount', hist.huCount, 2);
assertEqual('history has ziMoCount', hist.ziMoCount, 1);

// Test 11: matchHistory 中的 history 包含 round 字段
const engine3 = new MahjongEngine({ mahjongType: 'guangdong', playerCount: 4, speed: 'instant' });
engine3.initPlayers([
    { name: 'P0', isAI: false },
    { name: 'P1', isAI: true },
    { name: 'P2', isAI: true },
    { name: 'P3', isAI: true }
]);
engine3.deck = Tiles.generateDeck('guangdong');
engine3.deckCount = engine3.deck.length;
engine3.state = 'playing';
engine3.currentPlayerIndex = 0;
engine3.playerDraw();
engine3.recordHistory('discard', { playerId: 0, tile: 'wan_1' });
engine3.matchHistory.push({
    round: 1, wind: 0,
    history: [...engine3.gameHistory],
    players: engine3.players.map(p => p.toJSON(true))
});
engine3.gameHistory = [];
const allHistory = [];
for (const round of engine3.matchHistory) {
    if (round.history) allHistory.push(...round.history);
}
assert('matchHistory entries preserve round field', allHistory.every(h => typeof h.round === 'number'));

// ===== 结果汇总 =====
console.log('\n========== 回放与统计一致性测试 ==========');
console.log('✅ 通过:', passCount);
console.log('❌ 失败:', failCount);
results.forEach(r => {
    console.log((r.ok ? '✅' : '❌') + ' ' + r.name + (r.detail ? ' | ' + r.detail : ''));
});
if (failCount > 0) process.exit(1);
console.log('\n全部通过！');
