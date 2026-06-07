/**
 * AI 工具向听数测试
 * 验证 calculateStandardShanten / calculateSevenPairsShanten 支持多种手牌大小
 */
const fs = require('fs');
const path = require('path');

// 模拟 Utils
globalThis.Utils = {
    uuid: () => Math.random().toString(36).slice(2) + Date.now().toString(36),
    shuffle: (arr) => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
};

// 加载 Tiles
const Tiles = (new Function(
    fs.readFileSync(path.join(__dirname, '../js/core/tiles.js'), 'utf8') + '\n;return Tiles;'
))();

// 加载 Rules
const Rules = (new Function('Tiles',
    fs.readFileSync(path.join(__dirname, '../js/core/rules.js'), 'utf8') + '\n;return Rules;'
))(Tiles);

// 加载 AIUtils
const AIUtils = (new Function('Tiles', 'Rules',
    fs.readFileSync(path.join(__dirname, '../js/ai/ai-utils.js'), 'utf8') + '\n;return AIUtils;'
))(Tiles, Rules);

let passCount = 0;
let failCount = 0;

function assertEq(name, actual, expected, detail) {
    const ok = actual === expected;
    if (ok) { passCount++; } else { failCount++; }
    console.log((ok ? '✅' : '❌') + ' ' + name + (ok ? '' : ` | 期望 ${expected}, 实际 ${actual}` + (detail ? ' | ' + detail : '')));
}

function T(suit, value) {
    return Tiles.createTile(suit, value);
}

// ===== 标准向听数：台湾麻将 17 张（5 面子 + 1 对）=====
// 已胡牌
const taiwanWin = [
    T('wan',1), T('wan',2), T('wan',3),
    T('wan',4), T('wan',5), T('wan',6),
    T('wan',7), T('wan',8), T('wan',9),
    T('tong',1), T('tong',2), T('tong',3),
    T('tong',4), T('tong',5), T('tong',6),
    T('tiao',1), T('tiao',1)
];
assertEq('台湾17张已胡: shanten=-1', AIUtils.calculateStandardShanten(taiwanWin, []), -1);

// 听牌：4 面子 + 1 对 + 1 搭子 = 16 张
const taiwanTenpai = [
    T('wan',1), T('wan',2), T('wan',3),
    T('wan',4), T('wan',5), T('wan',6),
    T('tong',1), T('tong',2), T('tong',3),
    T('tong',4), T('tong',5), T('tong',6),
    T('tiao',1), T('tiao',1),
    T('tiao',4), T('tiao',5)
];
assertEq('台湾16张听牌: shanten=0', AIUtils.calculateStandardShanten(taiwanTenpai, []), 0);

// 1向听：4 面子 + 2 搭子（无对子）= 16 张
const taiwan1Shanten = [
    T('wan',1), T('wan',2), T('wan',3),
    T('wan',4), T('wan',5), T('wan',6),
    T('tong',1), T('tong',2), T('tong',3),
    T('tong',4), T('tong',5), T('tong',6),
    T('tiao',1), T('tiao',2),
    T('tiao',4), T('tiao',5)
];
assertEq('台湾16张1向听(无对子): shanten=1', AIUtils.calculateStandardShanten(taiwan1Shanten, []), 1);

// ===== 标准麻将 14 张（4 面子 + 1 对）=====
const stdWin = [
    T('wan',1), T('wan',2), T('wan',3),
    T('wan',4), T('wan',5), T('wan',6),
    T('tong',1), T('tong',2), T('tong',3),
    T('tong',4), T('tong',5), T('tong',6),
    T('tiao',1), T('tiao',1)
];
assertEq('标准14张已胡: shanten=-1', AIUtils.calculateStandardShanten(stdWin, []), -1);

// 标准 13 张听牌（3 面子 + 1 对 + 1 搭子）
const stdTenpai = [
    T('wan',1), T('wan',2), T('wan',3),
    T('wan',4), T('wan',5), T('wan',6),
    T('tong',1), T('tong',2), T('tong',3),
    T('tiao',1), T('tiao',1),
    T('tiao',4), T('tiao',5)
];
assertEq('标准13张听牌: shanten=0', AIUtils.calculateStandardShanten(stdTenpai, []), 0);

// 有副露：1 副露（3 张），手牌 11 张 = 3 面子 + 1 对 + 1 搭子
const stdWithMeld = [
    T('wan',1), T('wan',2), T('wan',3),
    T('wan',4), T('wan',5), T('wan',6),
    T('tiao',1), T('tiao',1),
    T('tiao',4), T('tiao',5)
];
const meld1 = [{ type: 'triplet', tiles: [T('tong',1), T('tong',1), T('tong',1)] }];
assertEq('1副露10张听牌: shanten=0', AIUtils.calculateStandardShanten(stdWithMeld, meld1), 0);

// ===== 七对向听数 =====
// 8 对（16 张）= 已胡
const sevenPairs8 = [];
for (let i = 1; i <= 8; i++) {
    sevenPairs8.push(T('wan', i), T('wan', i));
}
assertEq('七对8对(16张)已胡: shanten=-1', AIUtils.calculateSevenPairsShanten(sevenPairs8), -1);

// 7 对（14 张）= 已胡
const sevenPairs7 = [];
for (let i = 1; i <= 7; i++) {
    sevenPairs7.push(T('wan', i), T('wan', i));
}
assertEq('七对7对(14张)已胡: shanten=-1', AIUtils.calculateSevenPairsShanten(sevenPairs7), -1);

// 6 对（12 张）= 听牌
const sevenPairs6 = [];
for (let i = 1; i <= 6; i++) {
    sevenPairs6.push(T('wan', i), T('wan', i));
}
assertEq('七对6对(12张): shanten=0', AIUtils.calculateSevenPairsShanten(sevenPairs6), 0);

// 6 对 + 1 单（13 张）= 听牌
const sevenPairs6plus1 = [...sevenPairs6, T('wan', 7)];
assertEq('七对6对+1单(13张): shanten=0', AIUtils.calculateSevenPairsShanten(sevenPairs6plus1), 0);

// 5 对（10 张）= 1 向听
const sevenPairs5 = [];
for (let i = 1; i <= 5; i++) {
    sevenPairs5.push(T('wan', i), T('wan', i));
}
assertEq('七对5对(10张): shanten=1', AIUtils.calculateSevenPairsShanten(sevenPairs5), 1);

console.log('\n========== AI 向听数测试 ==========');
console.log('✅ 通过:', passCount);
console.log('❌ 失败:', failCount);
if (failCount > 0) process.exit(1);
