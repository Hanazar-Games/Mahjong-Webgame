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
            id: Utils.uuid(),
            date: new Date().toISOString(),
            ...replay
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
        return {
            mahjongType: engine.config.mahjongType,
            players: (engine.players || []).map(p => ({
                name: p?.name || '',
                isAI: p?.isAI || false,
                position: p?.position || 0
            })),
            rounds: engine.round || 1,
            history: engine.gameHistory || [],
            finalScores: [...(engine.players || [])].sort((a, b) => (b?.score || 0) - (a?.score || 0)).map(p => ({
                name: p?.name || '',
                score: p?.score || 0,
                isWin: p?.isHu || false
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
