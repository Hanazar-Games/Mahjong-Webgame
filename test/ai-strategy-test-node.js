const fs = require('fs');
const path = require('path');

let uid = 0;
const Utils = {
    uuid: () => `ai-test-${++uid}`,
    shuffle: array => [...array]
};
const Tiles = (new Function('Utils',
    fs.readFileSync(path.join(__dirname, '../js/core/tiles.js'), 'utf8') + '\n;return Tiles;'
))(Utils);
const Rules = (new Function('Tiles',
    fs.readFileSync(path.join(__dirname, '../js/core/rules.js'), 'utf8') + '\n;return Rules;'
))(Tiles);
const AIUtils = (new Function('Tiles', 'Rules',
    fs.readFileSync(path.join(__dirname, '../js/ai/ai-utils.js'), 'utf8') + '\n;return AIUtils;'
))(Tiles, Rules);
const AIPlayer = (new Function('AIUtils', 'Tiles', 'Rules', 'Utils',
    fs.readFileSync(path.join(__dirname, '../js/ai/ai-player.js'), 'utf8') + '\n;return AIPlayer;'
))(AIUtils, Tiles, Rules, Utils);

let passed = 0;
let failed = 0;
function assert(name, condition, detail = '') {
    if (condition) passed++;
    else failed++;
    console.log(`${condition ? '✅' : '❌'} ${name}${condition || !detail ? '' : ` | ${detail}`}`);
}
const T = (suit, value) => Tiles.createTile(suit, value);
const meld = (suit, a, b, c) => ({ type: 'sequence', tiles: [T(suit, a), T(suit, b), T(suit, c)] });

const sichuanHand = [
    T('tong', 5),
    T('wan', 1), T('wan', 2), T('wan', 3),
    T('wan', 4), T('wan', 5), T('wan', 6), T('wan', 7), T('wan', 8),
    T('tiao', 1), T('tiao', 2), T('tiao', 3), T('tiao', 8), T('tiao', 9)
];
const sichuanPlayer = { id: 0, position: 0, hand: sichuanHand, melds: [], queYiMen: 'tong' };
const sichuanContext = {
    deckCount: 5,
    discardPile: [T('wan', 1), T('wan', 4), T('tiao', 9)],
    doraIndicators: [],
    players: [
        { id: 0, hand: sichuanHand, discards: [], melds: [] },
        { id: 1, discards: [], melds: [meld('tong', 1, 2, 3), meld('tong', 3, 4, 5), meld('tong', 6, 7, 8)] }
    ],
    selfIndex: 0,
    config: { mahjongType: 'sichuan' },
    ruleConfig: { mahjongType: 'sichuan', queYiMen: true }
};

for (const difficulty of ['hard', 'expert']) {
    let chosen = null;
    let error = null;
    try {
        chosen = AIPlayer.chooseDiscard(sichuanPlayer, difficulty, sichuanContext);
    } catch (cause) {
        error = cause;
    }
    assert(`${difficulty} AI 对手建模不会抛错`, !error, error?.message);
    assert(`${difficulty} AI 残局仍优先清缺门`, chosen?.suit === 'tong', `实际 ${chosen?.suit}-${chosen?.value}`);
}

const normalHand = [
    T('wan', 1), T('feng', 4), T('jian', 1), T('feng', 1), T('wan', 4),
    T('feng', 3), T('tiao', 9), T('tong', 1), T('jian', 3), T('feng', 3),
    T('jian', 2), T('tong', 9), T('feng', 2), T('feng', 3)
];
const normalPlayer = { id: 0, position: 0, hand: normalHand, melds: [], queYiMen: null };
const normalContext = {
    deckCount: 60,
    discardPile: [],
    players: [{ id: 0, hand: normalHand, discards: [], melds: [] }],
    selfIndex: 0,
    config: { mahjongType: 'guangdong' },
    ruleConfig: { mahjongType: 'guangdong' }
};
const originalRandom = Math.random;
Math.random = () => 0.5;
const normalDiscard = AIPlayer.chooseDiscard(normalPlayer, 'normal', normalContext);
Math.random = originalRandom;
const normalShanten = AIUtils.calculateShanten(
    normalHand.filter(tile => tile.id !== normalDiscard.id), [], normalContext.ruleConfig
);
const bestNormalShanten = Math.min(...normalHand.map(tile => AIUtils.calculateShanten(
    normalHand.filter(item => item.id !== tile.id), [], normalContext.ruleConfig
)));
assert('普通 AI 不选择增加向听数的弃牌', normalShanten === bestNormalShanten,
    `实际 ${normalShanten}，最优 ${bestNormalShanten}`);

const chiHand = [T('wan', 1), T('wan', 2), T('wan', 4), T('wan', 5), T('tong', 2)];
const chiPlayer = { id: 0, position: 0, hand: chiHand, melds: [] };
const claimed = T('wan', 3);
const chiOptions = [
    [chiHand[0], chiHand[1], claimed],
    [claimed, chiHand[2], chiHand[3]]
];
for (const difficulty of ['hard', 'expert']) {
    const seenRules = [];
    const originalCalculate = AIUtils.calculateShanten;
    AIUtils.calculateShanten = (hand, melds, config) => {
        seenRules.push(config?.mahjongType);
        return 0;
    };
    AIPlayer.chooseChiOption(chiPlayer, chiOptions, difficulty, {
        ruleConfig: { mahjongType: 'taiwan' }
    });
    AIUtils.calculateShanten = originalCalculate;
    assert(`${difficulty} AI 吃牌评估携带当前规则`,
        seenRules.length > 0 && seenRules.every(type => type === 'taiwan'), seenRules.join(','));
}

console.log(`\n========== AI 策略测试 ==========`);
console.log('✅ 通过:', passed);
console.log('❌ 失败:', failed);
if (failed > 0) process.exit(1);
