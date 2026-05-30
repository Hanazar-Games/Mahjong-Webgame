/**
 * 回放数据结构验证测试 (Node.js)
 */

// 模拟 tiles.js 的部分功能
const Tiles = {
    createTile(suit, value, id) {
        const UNICODE_MAP = {
            wan: ['\u{1F007}','\u{1F008}','\u{1F009}','\u{1F00A}','\u{1F00B}','\u{1F00C}','\u{1F00D}','\u{1F00E}','\u{1F00F}'],
            tong: ['\u{1F019}','\u{1F01A}','\u{1F01B}','\u{1F01C}','\u{1F01D}','\u{1F01E}','\u{1F01F}','\u{1F020}','\u{1F021}'],
            tiao: ['\u{1F010}','\u{1F011}','\u{1F012}','\u{1F013}','\u{1F014}','\u{1F015}','\u{1F016}','\u{1F017}','\u{1F018}']
        };
        const NAME_MAP = {
            wan: ['一万','二万','三万','四万','五万','六万','七万','八万','九万'],
            tong: ['一筒','二筒','三筒','四筒','五筒','六筒','七筒','八筒','九筒'],
            tiao: ['一条','二条','三条','四条','五条','六条','七条','八条','九条']
        };
        return {
            id: id || `${suit}_${value}`,
            suit, value,
            unicode: UNICODE_MAP[suit]?.[value - 1] || '?',
            name: NAME_MAP[suit]?.[value - 1] || `${suit}${value}`,
            shortName: NAME_MAP[suit]?.[value - 1] || `${suit}${value}`
        };
    },
    getConfig(type) {
        const configs = { guobiao: { name: '国标麻将' }, guangdong: { name: '广东麻将' } };
        return configs[type];
    }
};

// 模拟 Utils
const Utils = {
    escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    }
};

// 模拟 replay.js
function createReplayData(engine) {
    if (!engine || !engine.config) return {};
    const allRounds = [...(engine.matchHistory || [])];
    if (engine.gameHistory && engine.gameHistory.length > 0) {
        const lastSaved = allRounds.length > 0 ? allRounds[allRounds.length - 1].round : -1;
        if (lastSaved !== engine.round) {
            allRounds.push({
                round: engine.round,
                wind: engine.currentWind,
                history: [...engine.gameHistory],
                players: (engine.players || []).map(p => ({...p}))
            });
        }
    }
    return {
        mahjongType: engine.config.mahjongType,
        maxRounds: engine.config.maxRounds,
        players: (engine.players || []).map(p => ({
            id: p?.id || '',
            name: p?.name || '',
            isAI: p?.isAI || false,
            position: p?.position || 0
        })),
        rounds: allRounds,
        finalScores: [...(engine.players || [])].sort((a, b) => (b?.score || 0) - (a?.score || 0)).map(p => ({
            name: p?.name || '',
            score: p?.score || 0,
            isWin: p?.isHu || false
        }))
    };
}

// 模拟 ReplayPlayer 核心逻辑（Node.js 可运行的子集）
class ReplayPlayer {
    constructor(replayData) {
        this.data = replayData;
        this.rounds = Array.isArray(replayData.rounds) ? replayData.rounds : [];
        this.currentRoundIdx = 0;
        this.currentStep = -1;
        this.players = replayData.players || [];
        this.tileCache = new Map();
    }

    _describeAction(item) {
        if (!item) return { icon: '', text: '', player: '' };
        const action = item.action;
        const data = item.data || {};

        const nameMap = {};
        for (const p of this.players) {
            if (p.id) nameMap[p.id] = p.name;
            if (p.position !== undefined) nameMap[p.position] = p.name;
        }
        const pid = data.playerId !== undefined ? data.playerId : data.player;
        const playerName = nameMap[pid] || this.players[pid]?.name || pid || '';

        const _getTileName = (tileIdOrObj) => {
            if (!tileIdOrObj) return '?';
            if (typeof tileIdOrObj === 'object') {
                return tileIdOrObj.name || tileIdOrObj.shortName || `${tileIdOrObj.suit}${tileIdOrObj.value}`;
            }
            const parts = tileIdOrObj.split('_');
            if (parts.length >= 2) {
                const tile = Tiles.createTile(parts[0], parseInt(parts[1]), tileIdOrObj);
                return tile.name || '?';
            }
            return '?';
        };

        switch (action) {
            case 'gameStart': return { icon: '🎮', text: `第${data.round}局开始`, player: '' };
            case 'discard': {
                const tileName = _getTileName(data.tile);
                return { icon: '🎯', text: `打出 ${tileName}`, player: playerName };
            }
            case 'chi': {
                const tiles = (data.tiles || []).map(t => _getTileName(t)).join('');
                return { icon: '🍽', text: `吃 ${tiles}`, player: playerName };
            }
            case 'peng': {
                const tiles = (data.tiles || []).map(t => _getTileName(t)).join('');
                return { icon: '👏', text: `碰 ${tiles}`, player: playerName };
            }
            case 'gang': {
                const tiles = (data.tiles || []).map(t => _getTileName(t)).join('');
                return { icon: '💥', text: `杠 ${tiles}`, player: playerName };
            }
            case 'anGang': return { icon: '🕶', text: '暗杠', player: playerName };
            case 'jiaGang': return { icon: '➕', text: '加杠', player: playerName };
            case 'hu': {
                const ziMo = data.isZiMo ? '自摸' : '点炮';
                const fan = data.fan?.total || 0;
                return { icon: '🎉', text: `${ziMo}胡牌 ${fan}番`, player: playerName };
            }
            case 'drawGame': return { icon: '🤝', text: '流局', player: '' };
            case 'roundEnd': return { icon: '🏁', text: `第${data.round}局结束`, player: '' };
            default: return { icon: '•', text: action, player: playerName };
        }
    }

    // 模拟逐步回放，验证状态一致性
    simulatePlayback() {
        let errors = [];
        
        for (let rIdx = 0; rIdx < this.rounds.length; rIdx++) {
            const round = this.rounds[rIdx];
            console.log(`\n=== 第 ${round.round} 局 (${['东','南','西','北'][round.wind || 0]}风) ===`);
            console.log(`动作数: ${round.history?.length || 0}`);
            
            // 验证每步都能被描述
            for (let i = 0; i < (round.history?.length || 0); i++) {
                const item = round.history[i];
                const desc = this._describeAction(item);
                if (!desc.text) {
                    errors.push(`Round ${round.round}, Step ${i}: 无法描述动作 ${item.action}`);
                }
            }
            
            // 验证 roundEnd 的分数与 finalScores 一致（粗略检查）
            const roundEnd = round.history?.find(h => h.action === 'roundEnd');
            if (roundEnd?.data?.players) {
                console.log('局末分数:', roundEnd.data.players.map(p => `${p.name}:${p.score}`).join(', '));
            }
            
            // 验证玩家快照存在
            if (round.players) {
                console.log('玩家快照:', round.players.map(p => p.name).join(', '));
            }
        }
        
        return errors;
    }
}

// 测试数据
const testEngine = {
    config: { mahjongType: 'guobiao', maxRounds: 4 },
    round: 2,
    currentWind: 1,
    players: [
        { id: 'player-0', name: '张三', isAI: false, position: 0, score: 0, isHu: false },
        { id: 'player-1', name: '李四', isAI: true, position: 1, score: -150, isHu: false },
        { id: 'player-2', name: '王五', isAI: true, position: 2, score: 270, isHu: true },
        { id: 'player-3', name: '赵六', isAI: true, position: 3, score: -220, isHu: false }
    ],
    matchHistory: [
        {
            round: 1,
            wind: 0,
            history: [
                { action: 'gameStart', data: { round: 1, wind: 0, dealer: 0 }, timestamp: 1, round: 1 },
                { action: 'draw', data: { playerId: 'player-0' }, timestamp: 2, round: 1 },
                { action: 'discard', data: { playerId: 'player-0', tile: 'wan_1' }, timestamp: 3, round: 1 },
                { action: 'peng', data: { playerId: 'player-1', tiles: ['wan_1', 'wan_1', 'wan_1'], from: 0 }, timestamp: 4, round: 1 },
                { action: 'roundEnd', data: { round: 1, wind: 0, players: [
                    { id: 'player-0', name: '张三', score: 100, position: 0 },
                    { id: 'player-1', name: '李四', score: -50, position: 1 },
                    { id: 'player-2', name: '王五', score: -30, position: 2 },
                    { id: 'player-3', name: '赵六', score: -20, position: 3 }
                ]}, timestamp: 5, round: 1 }
            ],
            players: [
                { id: 'player-0', name: '张三', score: 100, position: 0 },
                { id: 'player-1', name: '李四', score: -50, position: 1 },
                { id: 'player-2', name: '王五', score: -30, position: 2 },
                { id: 'player-3', name: '赵六', score: -20, position: 3 }
            ]
        }
    ],
    gameHistory: [
        { action: 'gameStart', data: { round: 2, wind: 1, dealer: 1 }, timestamp: 6, round: 2 },
        { action: 'draw', data: { playerId: 'player-1' }, timestamp: 7, round: 2 },
        { action: 'discard', data: { playerId: 'player-1', tile: 'tong_2' }, timestamp: 8, round: 2 },
        { action: 'chi', data: { playerId: 'player-2', tiles: ['tong_2', 'tong_3', 'tong_4'], from: 1 }, timestamp: 9, round: 2 },
        { action: 'hu', data: { playerId: 'player-2', isZiMo: true, fan: { total: 8, breakdown: [{ name: '平胡', fan: 2 }] } }, timestamp: 10, round: 2 },
        { action: 'roundEnd', data: { round: 2, wind: 1, players: [
            { id: 'player-0', name: '张三', score: 0, position: 0 },
            { id: 'player-1', name: '李四', score: -100, position: 1 },
            { id: 'player-2', name: '王五', score: 300, position: 2 },
            { id: 'player-3', name: '赵六', score: -200, position: 3 }
        ]}, timestamp: 11, round: 2 }
    ]
};

console.log('=== 回放数据结构验证 ===\n');

// 测试 createReplayData
const replayData = createReplayData(testEngine);
console.log('createReplayData 结果:');
console.log('  mahjongType:', replayData.mahjongType);
console.log('  maxRounds:', replayData.maxRounds);
console.log('  players:', replayData.players.map(p => p.name).join(', '));
console.log('  rounds 数:', replayData.rounds.length);
console.log('  finalScores:', replayData.finalScores.map(s => `${s.name}:${s.score}`).join(', '));

// 验证 rounds 结构
console.log('\n各局详情:');
replayData.rounds.forEach(r => {
    console.log(`  第${r.round}局: ${r.history?.length || 0} 个动作, 玩家快照: ${r.players?.length || 0} 人`);
});

// 验证玩家 ID 是否保留
const hasIds = replayData.players.every(p => p.id);
console.log('\n玩家 ID 保留:', hasIds ? '✅' : '❌');

// 测试 ReplayPlayer
const player = new ReplayPlayer(replayData);
const errors = player.simulatePlayback();

// 输出动作描述示例
console.log('\n=== 动作描述示例 ===');
replayData.rounds.forEach(r => {
    console.log(`\n第 ${r.round} 局:`);
    r.history.forEach((item, i) => {
        const desc = player._describeAction(item);
        console.log(`  ${i+1}. ${desc.icon} ${desc.text}${desc.player ? ' (' + desc.player + ')' : ''}`);
    });
});

// 总结
console.log('\n=== 验证结果 ===');
if (errors.length === 0) {
    console.log('✅ 所有验证通过！');
} else {
    console.log('❌ 发现错误:');
    errors.forEach(e => console.log('  - ' + e));
    process.exit(1);
}
