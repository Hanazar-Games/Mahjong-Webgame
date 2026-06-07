/**
 * 万能麻将 - 回放系统
 */

const Replay = (function() {
    'use strict';

    const MAX_REPLAYS = 30;

    function getReplays() {
        return Storage.get('replays', []);
    }

    function saveReplay(replay) {
        const replays = getReplays();
        replays.unshift({
            ...replay,
            id: Utils.uuid(),
            date: new Date().toISOString()
        });
        
        if (replays.length > MAX_REPLAYS) {
            replays.pop();
        }
        
        Storage.set('replays', replays);
        return replays[0].id;
    }

    function getReplay(id) {
        const replays = getReplays();
        return replays.find(r => r.id === id);
    }

    function deleteReplay(id) {
        const replays = getReplays().filter(r => r.id !== id);
        Storage.set('replays', replays);
    }

    function clearReplays() {
        Storage.set('replays', []);
    }

    function createReplayData(engine) {
        if (!engine || !engine.config) return {};

        // 合并 matchHistory 和当前局（如果游戏还没完全结束）
        const allRounds = [...(engine.matchHistory || [])];
        // 如果当前局已有历史且未保存到 matchHistory，追加
        if (engine.gameHistory && engine.gameHistory.length > 0) {
            const lastSaved = allRounds.length > 0 ? allRounds[allRounds.length - 1].round : -1;
            if (lastSaved !== engine.round) {
                allRounds.push({
                    round: engine.round,
                    wind: engine.currentWind,
                    history: [...engine.gameHistory],
                    players: (engine.players || []).map(p => p.toJSON(true))
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
            finalScores: [...(engine.players || [])].sort((a, b) => (b?.score || 0) - (a?.score || 0)).map((p, idx) => ({
                name: p?.name || '',
                score: p?.score || 0,
                isWin: idx === 0
            }))
        };
    }

    return {
        getReplays,
        saveReplay,
        getReplay,
        deleteReplay,
        clearReplays,
        createReplayData
    };
})();
