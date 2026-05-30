/**
 * Stats / Achievements 体系验证测试
 */

// 模拟 Storage
const _storage = {};
const Storage = {
    get(key, defaultValue = null) {
        return _storage[key] !== undefined ? JSON.parse(JSON.stringify(_storage[key])) : defaultValue;
    },
    set(key, value) {
        _storage[key] = JSON.parse(JSON.stringify(value));
    },
    remove(key) {
        delete _storage[key];
    }
};

// 模拟 Utils
const Utils = {
    deepClone(obj) { return JSON.parse(JSON.stringify(obj)); },
    uuid() { return 'test-' + Math.random().toString(36).slice(2); },
    escapeHtml(str) { return String(str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); },
    toast() {},
};

// 模拟 Tiles
const Tiles = {
    getMahjongTypes() {
        return [
            {key:'guobiao'}, {key:'guangdong'}, {key:'sichuan'}, {key:'shanghai'},
            {key:'beijing'}, {key:'taiwan'}, {key:'hangzhou'}, {key:'changsha'},
            {key:'dongbei'}, {key:'hubei'}, {key:'fujian'}, {key:'jiangxi'}
        ];
    }
};

// 加载 stats.js（替换 const Stats 为 global.Stats 使其可访问）
const fs = require('fs');
global.Storage = Storage;
global.Utils = Utils;
global.Tiles = Tiles;
let statsCode = fs.readFileSync(__dirname + '/../js/data/stats.js', 'utf8');
// 将 IIFE 赋值给 global.Stats
statsCode = statsCode.replace('const Stats = (function()', 'global.Stats = (function()');
eval(statsCode);
const Stats = global.Stats;

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) { passed++; console.log('  ✅ ' + msg); }
    else { failed++; console.log('  ❌ ' + msg); }
}

console.log('========== Stats / Achievements 体系测试 ==========\n');

// === 测试 1: addExp 正确保存 ===
console.log('【测试 1】addExp 正确保存并返回升级信息');
Storage.remove('stats');
const expResult = Stats.addExp(150);
const statsAfterAdd = Stats.getStats();
assert(expResult.levelsGained === 1, '升级1次');
assert(expResult.prevLevel === 1 && expResult.newLevel === 2, '从Lv.1升到Lv.2');
assert(expResult.prevExp === 0 && expResult.gained === 150, '获得150经验');
assert(statsAfterAdd.level === 2, '存储中 level 为 2');
assert(statsAfterAdd.exp < statsAfterAdd.maxExp, 'exp 小于 maxExp');

// === 测试 2: recordGame 分离 finalScore 和 netScore ===
console.log('\n【测试 2】recordGame 分离 finalScore 和 netScore');
Storage.remove('stats');
const r1 = Stats.recordGame({
    isWin: true,
    finalScore: 1200,
    netScore: 200,    // 1200 - 1000 = 200 净胜
    fan: 8,
    mahjongType: 'guobiao',
    rounds: 4,
    wonRounds: 3,
    gangCount: 2,
    huCount: 2,
    ziMoCount: 1
});
const s1 = Stats.getStats();
assert(s1.totalGames === 1, '总场数 = 1');
assert(s1.totalRounds === 4, '总局数 = 4');
assert(s1.totalScore === 200, 'totalScore 是净胜分 200（不是 1200）');
assert(s1.bestGame === 200, 'bestGame 是最高净胜分 200');
assert(s1.wins === 1, '胜场 = 1');
assert(r1.expGain === 20 + 8*2, '经验 = 20 + 16 = 36');
assert(s1.history[0].netScore === 200, '历史记录保存 netScore');
assert(s1.history[0].finalScore === 1200, '历史记录保存 finalScore');
assert(s1.history[0].wonRounds === 3, '历史记录保存 wonRounds');

// === 测试 3: 多局累计 netScore 正确 ===
console.log('\n【测试 3】多局累计 netScore 正确');
Stats.recordGame({ isWin: false, finalScore: 800, netScore: -200, fan: 2, mahjongType: 'guangdong', rounds: 2 });
const s2 = Stats.getStats();
assert(s2.totalGames === 2, '总场数 = 2');
assert(s2.totalRounds === 6, '总局数 = 4+2 = 6');
assert(s2.totalScore === 0, '净胜分总和 = 200 + (-200) = 0');
assert(s2.bestGame === 200, 'bestGame 仍为 200（不是 800）');
assert(s2.wins === 1 && s2.losses === 1, '胜1负1');
assert(s2.currentStreak === 0, '连胜中断为0');

// === 测试 4: 连胜统计 ===
console.log('\n【测试 4】连胜统计');
Storage.remove('stats');
Stats.recordGame({ isWin: true, finalScore: 1100, netScore: 100, fan: 0, mahjongType: 'guangdong', rounds: 1 });
Stats.recordGame({ isWin: true, finalScore: 1100, netScore: 100, fan: 0, mahjongType: 'guangdong', rounds: 1 });
Stats.recordGame({ isWin: true, finalScore: 1100, netScore: 100, fan: 0, mahjongType: 'guangdong', rounds: 1 });
const s3 = Stats.getStats();
assert(s3.currentStreak === 3, '当前连胜 = 3');
assert(s3.maxStreak === 3, '最高连胜 = 3');

Stats.recordGame({ isWin: false, finalScore: 900, netScore: -100, fan: 0, mahjongType: 'guangdong', rounds: 1 });
const s4 = Stats.getStats();
assert(s4.currentStreak === 0, '输后连胜归零');
assert(s4.maxStreak === 3, '最高连胜仍为 3');

// === 测试 5: 成就解锁语义 ===
console.log('\n【测试 5】成就解锁语义');
Storage.remove('stats');
const a1 = Stats.recordGame({
    isWin: true, finalScore: 1300, netScore: 300, fan: 12,
    mahjongType: 'guangdong', rounds: 4, wonRounds: 4,
    gangCount: 3, huCount: 1, ziMoCount: 3,
    winType: 'seven_pairs', hasQingYiSe: true
});
const achIds = a1.newlyUnlocked.map(a => a.id);
assert(achIds.includes('first_win'), '解锁 first_win');
assert(achIds.includes('big_win'), '解锁 big_win（netScore=300 >= 200）');
assert(achIds.includes('gang_master'), '解锁 gang_master（gangCount=3）');
assert(achIds.includes('zi_mo_king'), '解锁 zi_mo_king（ziMoCount=3）');
assert(achIds.includes('seven_pairs'), '解锁 seven_pairs');
assert(achIds.includes('qing_yi_se'), '解锁 qing_yi_se');
assert(achIds.includes('perfect'), '解锁 perfect（wonRounds=4, rounds=4）');
assert(!achIds.includes('big_loser'), '不解锁 big_loser（netScore=300 不是负分）');

// 失败场景
Storage.remove('stats');
const a2 = Stats.recordGame({
    isWin: false, finalScore: 700, netScore: -300, fan: 0,
    mahjongType: 'guangdong', rounds: 4, wonRounds: 0,
    gangCount: 0, huCount: 0, ziMoCount: 0
});
const achIds2 = a2.newlyUnlocked.map(a => a.id);
assert(achIds2.includes('big_loser'), '解锁 big_loser（netScore=-300 <= -200）');
assert(!achIds2.includes('big_win'), '不解锁 big_win（netScore 是负的）');
assert(!achIds2.includes('first_win'), '不解锁 first_win（输了）');

// === 测试 6: getMatchSummary ===
console.log('\n【测试 6】getMatchSummary 返回值');
Storage.remove('stats');
Stats.recordGame({ isWin: true, finalScore: 1200, netScore: 200, fan: 8, mahjongType: 'guobiao', rounds: 4, wonRounds: 3, gangCount: 1, huCount: 1, ziMoCount: 1 });
Stats.recordGame({ isWin: true, finalScore: 1100, netScore: 100, fan: 4, mahjongType: 'guangdong', rounds: 4, wonRounds: 2, gangCount: 0, huCount: 1, ziMoCount: 0 });
const summary = Stats.getMatchSummary();
assert(summary.totalGames === 2, 'summary.totalGames = 2');
assert(summary.totalRounds === 8, 'summary.totalRounds = 8');
assert(summary.totalScore === 300, 'summary.totalScore = 300');
assert(summary.bestGame === 200, 'summary.bestGame = 200');
assert(summary.avgNetScore === 150, 'summary.avgNetScore = 150');
assert(summary.winRate === 100, 'summary.winRate = 100%');
assert(summary.history.length === 2, 'summary.history = 2 条');

// === 测试 7: getLevelProgress ===
console.log('\n【测试 7】getLevelProgress');
Storage.remove('stats');
Stats.addExp(50); // Lv.1, 50/100
const lp = Stats.getLevelProgress();
assert(lp.level === 1, 'level = 1');
assert(lp.currentExp === 50, 'currentExp = 50');
assert(lp.nextLevelExp === 100, 'nextLevelExp = 100');
assert(lp.percent === 50, 'percent = 50%');

// === 测试 8: getAchievements 进度 ===
console.log('\n【测试 8】getAchievements 进度');
Storage.remove('stats');
for (let i = 0; i < 5; i++) {
    Stats.recordGame({ isWin: true, finalScore: 1100, netScore: 100, fan: 0, mahjongType: 'guangdong', rounds: 1, wonRounds: 1, gangCount: 0, huCount: 1, ziMoCount: 0 });
}
const achievements = Stats.getAchievements();
const firstWin = achievements.find(a => a.id === 'first_win');
const win10 = achievements.find(a => a.id === 'win_10');
const veteran = achievements.find(a => a.id === 'veteran');
assert(firstWin.unlocked === true, 'first_win 已解锁');
assert(firstWin.progress === 100, 'first_win 进度 100%');
assert(win10.unlocked === false, 'win_10 未解锁');
assert(win10.progress === 50, 'win_10 进度 50%（5/10）');
assert(veteran.progress === 10, 'veteran 进度 10%（5/50）');

// === 测试 9: 成就 all_types 进度动态 ===
console.log('\n【测试 9】all_types 成就进度动态');
Storage.remove('stats');
const allTypesAch = Stats.getAchievements().find(a => a.id === 'all_types');
assert(allTypesAch.progress === 0, '初始进度 0%');

// === 总结 ===
console.log('\n========== 测试结果 ==========');
console.log(`✅ 通过: ${passed}`);
console.log(`❌ 失败: ${failed}`);
if (failed > 0) process.exit(1);
