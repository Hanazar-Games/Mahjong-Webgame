/**
 * Node.js 环境下运行引擎基础测试
 * cd 项目根目录 && node test/engine-test-node.js
 */
const fs = require('fs');
const path = require('path');

// 模拟浏览器 DOM API
const mockDocument = {
    createElement(tag) {
        return {
            tagName: tag,
            className: '',
            textContent: '',
            innerHTML: '',
            style: {},
            dataset: {},
            classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
            appendChild() {},
            remove() {},
            addEventListener() {},
            removeEventListener() {},
            setAttribute() {},
            getAttribute() { return null; }
        };
    },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    documentElement: { style: {} }
};
const mockWindow = {
    confirm() { return true; },
    addEventListener() {},
    removeEventListener() {}
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

// ===== 引擎测试 =====

// Test 1: 引擎创建与默认配置
const engine = new MahjongEngine({ mahjongType: 'guangdong', playerCount: 4 });
assertEqual('engine.config.mahjongType defaults to guangdong', engine.config.mahjongType, 'guangdong');
assertEqual('engine.config.playerCount is 4', engine.config.playerCount, 4);
assertEqual('engine.state is idle', engine.state, 'idle');
assertEqual('engine.round is 1', engine.round, 1);
assertEqual('engine.currentWind is 0', engine.currentWind, 0);

// Test 2: initPlayers
engine.initPlayers([
    { name: '玩家', isAI: false },
    { name: 'AI1', isAI: true },
    { name: 'AI2', isAI: true },
    { name: 'AI3', isAI: true }
]);
assertEqual('players.length is 4', engine.players.length, 4);
assertEqual('player 0 is not AI', engine.players[0].isAI, false);
assertEqual('player 0 is dealer', engine.players[0].isDealer, true);
assertEqual('player 1 is AI', engine.players[1].isAI, true);

// Test 3: invalid playerCount guard
const engine2 = new MahjongEngine({ playerCount: 0 });
engine2.initPlayers([]);
assertEqual('initPlayers with playerCount=0 does not crash', engine2.players.length, 0);

// Test 4: getState returns shallow clone for lastDiscard
engine.lastDiscard = { id: 'wan_1', suit: 'wan', value: 1 };
const state = engine.getState();
assert('getState returns object', typeof state === 'object');
assert('getState.lastDiscard is cloned', state.lastDiscard !== engine.lastDiscard);
assertEqual('getState.lastDiscard.id matches', state.lastDiscard.id, 'wan_1');

// Test 5: destroy sets state to destroyed
engine.destroy();
assertEqual('destroy sets state to destroyed', engine.state, 'destroyed');

// Test 6: checkActions with null tile returns empty array
const engine3 = new MahjongEngine({ playerCount: 4 });
engine3.initPlayers([
    { name: 'P0', isAI: false },
    { name: 'P1', isAI: true },
    { name: 'P2', isAI: true },
    { name: 'P3', isAI: true }
]);
const actions = engine3.checkActions(engine3.players[0], null, true);
assertEqual('checkActions with null tile returns []', Array.isArray(actions) && actions.length, 0);

// Test 7: EventEmitter emit isolation
const emitter = new Utils.EventEmitter();
let firstCalled = false;
let secondCalled = false;
emitter.on('test', () => { firstCalled = true; throw new Error('listener error'); });
emitter.on('test', () => { secondCalled = true; });
emitter.emit('test');
assertEqual('first listener called despite error', firstCalled, true);
assertEqual('second listener still called after first throws', secondCalled, true);

// Test 8: EventEmitter once cleanup on error
let onceCalled = 0;
emitter.once('once-test', () => { onceCalled++; throw new Error('once error'); });
try { emitter.emit('once-test'); } catch (e) {}
emitter.emit('once-test');
assertEqual('once listener only called once even on error', onceCalled, 1);

// Test 9: engine.start() with CANCELLED token
const engine4 = new MahjongEngine({ playerCount: 4, speed: 'instant' });
engine4.initPlayers([
    { name: 'P0', isAI: false },
    { name: 'P1', isAI: true },
    { name: 'P2', isAI: true },
    { name: 'P3', isAI: true }
]);
// destroy before start should set state to destroyed
engine4.destroy();
assertEqual('destroyed engine state is destroyed', engine4.state, 'destroyed');

// Test 10: player.hand sorting after draw
const p = new Player(0, 'Test', false, true);
p.draw(Tiles.createTile('wan', 1, 'wan_1'));
p.draw(Tiles.createTile('tong', 5, 'tong_5'));
p.draw(Tiles.createTile('wan', 3, 'wan_3'));
assertEqual('player hand is sorted after draw', p.hand[0].suit, 'wan');

// Test 11: player addScore / score tracking
const p2 = new Player(1, 'Test2', false, true);
p2.addScore(100);
assertEqual('player score increased by 100', p2.score, 100);
p2.addScore(-50);
assertEqual('player score decreased by 50', p2.score, 50);

// Test 12: player toJSON includes isHu
const p3 = new Player(2, 'Test3', false, true);
p3.isHu = true;
const json = p3.toJSON();
assertEqual('toJSON includes isHu', json.isHu, true);

// Test 13: Rules.canWin with simple hand
const simpleHand = [
    Tiles.createTile('wan', 1, 'wan_1'),
    Tiles.createTile('wan', 2, 'wan_2'),
    Tiles.createTile('wan', 3, 'wan_3'),
    Tiles.createTile('tong', 4, 'tong_4'),
    Tiles.createTile('tong', 5, 'tong_5'),
    Tiles.createTile('tong', 6, 'tong_6'),
    Tiles.createTile('tiao', 7, 'tiao_7'),
    Tiles.createTile('tiao', 8, 'tiao_8'),
    Tiles.createTile('tiao', 9, 'tiao_9'),
    Tiles.createTile('wan', 5, 'wan_5'),
    Tiles.createTile('wan', 5, 'wan_5b'),
    Tiles.createTile('feng', 1, 'dong'),
    Tiles.createTile('feng', 1, 'dong2'),
    Tiles.createTile('jian', 1, 'zhong')
];
const winResult = Rules.canWin(simpleHand, { minFan: 0 });
assert('Rules.canWin returns object with canWin property', winResult && typeof winResult.canWin === 'boolean');

// Test 14: Rules.canWin with seven pairs
const sevenPairs = [];
const suits = ['wan', 'tong', 'tiao'];
let id = 0;
for (const suit of suits) {
    for (let v = 1; v <= 3; v++) {
        sevenPairs.push(Tiles.createTile(suit, v, `sp_${id++}`));
        sevenPairs.push(Tiles.createTile(suit, v, `sp_${id++}`));
    }
}
sevenPairs.push(Tiles.createTile('feng', 1, 'dong1'));
sevenPairs.push(Tiles.createTile('feng', 1, 'dong2'));
sevenPairs.push(Tiles.createTile('feng', 2, 'nan1'));
sevenPairs.push(Tiles.createTile('feng', 2, 'nan2'));
const qpResult = Rules.canWin(sevenPairs, { minFan: 0 });
assertEqual('seven pairs hand can win', qpResult.canWin, true);
assertEqual('seven pairs type is seven_pairs', qpResult.type, 'seven_pairs');

// Test 15: engine.isRoundOver when all but one player isHu
const engine5 = new MahjongEngine({ playerCount: 4 });
engine5.initPlayers([
    { name: 'P0', isAI: false },
    { name: 'P1', isAI: true },
    { name: 'P2', isAI: true },
    { name: 'P3', isAI: true }
]);
engine5.players[0].isHu = true;
engine5.players[1].isHu = true;
engine5.players[2].isHu = true;
assertEqual('isRoundOver when 3/4 players Hu', engine5.isRoundOver(), true);

// Test 16: engine checkActions returns array even for invalid input
const engine6 = new MahjongEngine({ playerCount: 4 });
engine6.initPlayers([
    { name: 'P0', isAI: false },
    { name: 'P1', isAI: true },
    { name: 'P2', isAI: true },
    { name: 'P3', isAI: true }
]);
const emptyActions = engine6.checkActions(engine6.players[0], undefined, true);
assertEqual('checkActions with undefined tile returns empty array', Array.isArray(emptyActions) && emptyActions.length, 0);

// ===== 结果汇总 =====
console.log('\n========== 引擎基础测试 ==========');
console.log('✅ 通过:', passCount);
console.log('❌ 失败:', failCount);
results.forEach(r => {
    console.log((r.ok ? '✅' : '❌') + ' ' + r.name + (r.detail ? ' | ' + r.detail : ''));
});
if (failCount > 0) process.exit(1);
console.log('\n全部通过！');
