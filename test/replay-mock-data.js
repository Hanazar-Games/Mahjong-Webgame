/**
 * 回放测试数据生成器
 * 在浏览器控制台运行此代码生成模拟回放数据
 */
(function() {
    const PREFIX = 'mahjong_';

    // 生成测试用的 tile
    function makeTile(suit, value) {
        return {
            id: `${suit}_${value}_${Math.random().toString(36).slice(2,6)}`,
            suit, value,
            name: `${value}${suit === 'wan' ? '万' : suit === 'tong' ? '筒' : suit === 'tiao' ? '条' : suit === 'feng' ? '风' : '箭'}`,
            shortName: `${value}${suit === 'wan' ? '万' : suit === 'tong' ? '筒' : suit === 'tiao' ? '条' : suit === 'feng' ? '' : ''}`,
            isHonor: suit === 'feng' || suit === 'jian',
            isFlower: false,
            isTerminal: (suit === 'wan' || suit === 'tong' || suit === 'tiao') && (value === 1 || value === 9),
            isSimple: false
        };
    }

    function makeTiles(suit, value, count) {
        const arr = [];
        for (let i = 0; i < count; i++) arr.push(makeTile(suit, value));
        return arr;
    }

    // 生成一局的历史
    function makeRoundHistory(roundNum) {
        const p1 = { id: 0, name: '玩家A', score: 1000 };
        const p2 = { id: 1, name: 'AI-下家', score: 1000 };
        const p3 = { id: 2, name: 'AI-对家', score: 1000 };
        const p4 = { id: 3, name: 'AI-上家', score: 1000 };
        const players = [p1, p2, p3, p4];

        const history = [];
        history.push({ action: 'gameStart', data: { round: roundNum, wind: (roundNum - 1) % 4 }, timestamp: Date.now() });
        history.push({ action: 'tilesDealt', data: {}, timestamp: Date.now() + 100 });

        // 模拟一些打牌动作
        const actions = [
            { action: 'discard', data: { playerId: 0, tile: makeTile('wan', 1).id } },
            { action: 'discard', data: { playerId: 1, tile: makeTile('tong', 3).id } },
            { action: 'peng', data: { playerId: 2, tiles: [makeTile('tong', 3).id, makeTile('tong', 3).id, makeTile('tong', 3).id] } },
            { action: 'discard', data: { playerId: 2, tile: makeTile('tiao', 5).id } },
            { action: 'discard', data: { playerId: 3, tile: makeTile('feng', 1).id } },
            { action: 'discard', data: { playerId: 0, tile: makeTile('wan', 9).id } },
            { action: 'gang', data: { playerId: 1, tiles: [makeTile('wan', 9).id, makeTile('wan', 9).id, makeTile('wan', 9).id, makeTile('wan', 9).id] } },
            { action: 'discard', data: { playerId: 1, tile: makeTile('jian', 2).id } },
            { action: 'discard', data: { playerId: 2, tile: makeTile('tiao', 2).id } },
            { action: 'chi', data: { playerId: 3, tiles: [makeTile('tiao', 2).id, makeTile('tiao', 3).id, makeTile('tiao', 4).id] } },
            { action: 'discard', data: { playerId: 3, tile: makeTile('tong', 7).id } },
            { action: 'discard', data: { playerId: 0, tile: makeTile('wan', 5).id } },
            { action: 'hu', data: { playerId: 1, isZiMo: false, fan: { total: 6, fans: [{name:'碰碰胡',fan:6}] }, score: 64 } },
        ];

        let ts = Date.now() + 200;
        for (const a of actions) {
            a.timestamp = ts;
            ts += Math.random() * 2000 + 500;
            history.push(a);
        }

        // 更新分数
        players[1].score += 64;
        players[0].score -= 64;

        history.push({ action: 'roundEnd', data: { round: roundNum, players }, timestamp: ts });

        return {
            round: roundNum,
            wind: (roundNum - 1) % 4,
            history,
            players: players.map(p => ({ ...p, hand: [], melds: [], discards: [] }))
        };
    }

    // 生成完整回放
    function createMockReplay() {
        const rounds = [];
        for (let i = 1; i <= 4; i++) {
            rounds.push(makeRoundHistory(i));
        }

        const finalScores = [
            { name: 'AI-下家', score: 1200, isWin: true },
            { name: '玩家A', score: 800, isWin: false },
            { name: 'AI-对家', score: 1000, isWin: false },
            { name: 'AI-上家', score: 1000, isWin: false }
        ];

        return {
            id: 'mock_' + Date.now(),
            date: new Date().toISOString(),
            mahjongType: 'guobiao',
            maxRounds: 4,
            players: [
                { name: '玩家A', isAI: false, position: 0 },
                { name: 'AI-下家', isAI: true, position: 1 },
                { name: 'AI-对家', isAI: true, position: 2 },
                { name: 'AI-上家', isAI: true, position: 3 }
            ],
            rounds,
            finalScores
        };
    }

    // 注入到 localStorage
    const replay = createMockReplay();
    const existing = JSON.parse(localStorage.getItem(PREFIX + 'replays') || '[]');
    existing.unshift(replay);
    localStorage.setItem(PREFIX + 'replays', JSON.stringify(existing));

    console.log('✅ 已生成测试回放数据:', replay.id);
    console.log('局数:', replay.rounds.length);
    console.log('刷新页面后在"牌局回放"中查看');
})();
