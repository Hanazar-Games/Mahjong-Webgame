const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function runtime() {
    const stored = new Map();
    const context = vm.createContext({ console, setTimeout, clearTimeout, setInterval, clearInterval,
        document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
        localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value),
            removeItem: key => stored.delete(key) } });
    for (const file of ['utils/helpers', 'core/tiles', 'core/rules', 'core/player', 'ai/ai-utils',
        'ai/ai-player', 'core/engine', 'data/storage', 'data/replay', 'app/replay-ui']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file + '.js'), 'utf8'), context);
    }
    return vm.runInContext('({ Tiles, MahjongEngine, Replay, ReplayPlayer, Storage })', context);
}

test('real engine history survives storage and forward/backward playback', async t => {
    const { Tiles, MahjongEngine, Replay, ReplayPlayer } = runtime();
    const engine = new MahjongEngine({ speed: 'instant', maxRounds: 1 });
    t.after(() => engine.destroy());
    engine.initPlayers(Array.from({ length: 4 }, (_, i) => ({ name: 'Player ' + i, isAI: false })));
    await engine.start();
    await engine.playerDraw();
    const startIds = engine.players[0].hand.map(tile => tile.id).sort();
    const tile = engine.players[0].hand[0];
    await engine.playerDiscard(tile.id);
    const expectedIds = engine.players[0].hand.map(tile => tile.id).sort();
    const replayId = Replay.saveReplay(Replay.createReplayData(engine));
    assert.ok(replayId);
    const data = Replay.getReplay(replayId);
    assert.equal(data.players[0].id, 0);
    assert.equal(data.rounds.length, 1);
    const player = new ReplayPlayer(data);
    const history = data.rounds[0].history;
    const drawIndex = history.findIndex(entry => entry.action === 'draw');
    const discardIndex = history.findIndex(entry => entry.action === 'discard');
    assert.equal(history[drawIndex].data.tile.suit !== undefined, true);
    player.goToStep(discardIndex);
    assert.deepEqual(Array.from(player.playerStates[0].hand.map(t => t.id).sort()), Array.from(expectedIds));
    assert.equal(player._findTile(player.discardPile[0]).id, tile.id);
    assert.equal(player.deckCount, engine.deckCount);
    player.goToStep(drawIndex);
    assert.deepEqual(Array.from(player.playerStates[0].hand.map(t => t.id).sort()), Array.from(startIds));
    player.goToStep(discardIndex);
    assert.equal(player.discardPile.length, 1);
    assert.ok(!player._describeAction(history[discardIndex]).text.includes('?'));
    await engine.endRound();
    assert.equal(Replay.createReplayData(engine).rounds.length, 1);
});

test('playback consumes an actual UUID discard even when chi places it first', () => {
    const { Tiles, ReplayPlayer } = runtime();
    const tiles = [1, 2, 3].map(v => Tiles.createTile('wan', v));
    const players = [{ id: 0, hand: [tiles[0]] }, { id: 1, hand: tiles.slice(1) }];
    const history = [
        { action: 'gameStart', data: { players, deckCount: 60 } },
        { action: 'discard', data: { playerId: 0, tile: tiles[0].id } },
        { action: 'chi', data: { playerId: 1, from: 0, tiles: tiles.map(t => t.id) } }
    ];
    const replay = new ReplayPlayer({ players, rounds: [{ history }] });
    for (const step of history) replay._applyStep(step);
    assert.equal(replay.discardPile.length, 0);
    assert.equal(replay.playerStates[1].melds[0].tiles.length, 3);
    assert.ok(replay.playerStates[1].melds[0].tiles.every(t => typeof t === 'object' && t.suit === 'wan'));
});

test('failed replay deletion reports failure and preserves the saved replay', () => {
    const { Replay, Storage } = runtime();
    const id = Replay.saveReplay({ rounds: [], players: [] });
    Storage.set = () => false;
    assert.throws(() => Replay.deleteReplay(id));
    assert.throws(() => Replay.clearReplays());
    assert.equal(Replay.getReplay(id).id, id);
});
