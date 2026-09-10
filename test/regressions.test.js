const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function runtime(overrides = {}) {
    const context = vm.createContext({ console, setTimeout, clearTimeout, setInterval, clearInterval,
        document: { getElementById: () => null }, ...overrides });
    for (const file of ['utils/helpers', 'core/tiles', 'core/rules', 'core/player', 'ai/ai-utils',
        'ai/ai-player', 'core/engine', 'network/p2p', 'app/replay-ui']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file + '.js'), 'utf8'), context);
    }
    return vm.runInContext('({ Utils, Tiles, Rules, Player, AIUtils, MahjongEngine, P2PNetwork, ReplayPlayer })', context);
}

test('ICE arriving before an offer or remote description is retained until negotiation is ready', async () => {
    const applied = [];
    let releaseRemote;
    class Peer {
        async setRemoteDescription(sdp) {
            await new Promise(resolve => { releaseRemote = resolve; });
            this.remoteDescription = sdp;
        }
        async addIceCandidate(candidate) {
            assert.ok(this.remoteDescription, 'ICE must wait for the remote description');
            applied.push(candidate.candidate);
        }
        async createAnswer() { return { type: 'answer' }; }
        async setLocalDescription() {}
    }
    const { P2PNetwork } = runtime({ RTCPeerConnection: Peer,
        RTCSessionDescription: function(value) { return value; }, RTCIceCandidate: function(value) { return value; } });
    const net = new P2PNetwork();
    net._sendSignal = () => {};
    await net._handleIce('host', { candidate: 'before-offer' });
    const offer = net._handleOffer('host', { type: 'offer' });
    await net._handleIce('host', { candidate: 'during-description' });
    releaseRemote();
    await offer;
    assert.deepEqual(applied, ['before-offer', 'during-description']);
});

test('a closed peer cannot send an offer into a later room', async () => {
    let releaseOffer;
    const sent = [];
    class Peer {
        createDataChannel() { return { close() {} }; }
        createOffer() { return new Promise(resolve => { releaseOffer = resolve; }); }
        async setLocalDescription() {}
        close() {}
    }
    const { P2PNetwork } = runtime({ RTCPeerConnection: Peer });
    const net = new P2PNetwork();
    net._sendSignal = (...args) => sent.push(args);
    const offer = net._createOffer('guest');
    await net.leaveRoom(false);
    net.roomId = 'next-room';
    releaseOffer({ type: 'offer' });
    await offer;
    assert.deepEqual(sent, []);
});

test('ICE for a replacement connection never enters the old peer', async () => {
    const applied = [];
    class Peer {
        async setRemoteDescription(sdp) { this.remoteDescription = sdp; }
        async addIceCandidate(candidate) { applied.push([this.connectionId, candidate.candidate]); }
        async createAnswer() { return { type: 'answer' }; }
        async setLocalDescription() {}
        close() {}
    }
    const { P2PNetwork } = runtime({ RTCPeerConnection: Peer,
        RTCSessionDescription: function(value) { return value; }, RTCIceCandidate: function(value) { return value; } });
    const net = new P2PNetwork();
    net._sendSignal = () => {};
    const old = net._getPeer('host');
    old.connectionId = 'old';
    old.remoteDescription = { type: 'offer' };
    await net._handleIce('host', { candidate: 'new-candidate' }, 'new');
    assert.deepEqual(applied, []);
    await net._handleOffer('host', { type: 'offer' }, 'new');
    await net._handleAnswer('host', { type: 'answer', stale: true }, 'old');
    assert.deepEqual(applied, [['new', 'new-candidate']]);
    assert.equal(net.peers.get('host').remoteDescription.stale, undefined);
});

test('rapid rematch requests start only one network game', async () => {
    const { P2PNetwork } = runtime();
    const net = new P2PNetwork();
    net.isHost = true;
    let calls = 0, complete;
    net._post = () => { calls++; return new Promise(resolve => { complete = resolve; }); };
    const first = net.startGame({});
    const second = net.startGame({});
    assert.equal(calls, 1);
    complete();
    await Promise.all([first, second]);
});

test('concealed pair completes a hand with four open melds', () => {
    const { Tiles, Rules } = runtime();
    assert.equal(Rules.canWin([Tiles.createTile('wan', 5), Tiles.createTile('wan', 5)]).canWin, true);
});

test('cached winning decomposition always belongs to the supplied physical tiles', () => {
    const { Tiles, Rules } = runtime();
    const hand = () => [1, 1, 2, 3, 4].map(v => Tiles.createTile('wan', v));
    Rules.canWin(hand());
    const actual = hand();
    const result = Rules.canWin(actual);
    const ids = new Set(actual.map(t => t.id));
    assert.ok([...result.pair, ...result.melds.flatMap(m => m.tiles)].every(t => ids.has(t.id)));
});

test('default fan table does not erase ordinary fans for a zero-valued top pattern', () => {
    const { Tiles, Rules } = runtime();
    const hand = [1, 2, 3].flatMap(v => Array.from({ length: 3 }, () => Tiles.createTile('jian', v)));
    hand.push(...[1, 2, 3, 5, 5].map(v => Tiles.createTile('wan', v)));
    const win = Rules.canWin(hand);
    assert.ok(Rules.calculateFan(hand, [], win, { mahjongType: 'guangdong' }).total > 0);
});

test('mixed one suit includes wind and dragon honors together', () => {
    const { Tiles, Rules } = runtime();
    const hand = [1, 2, 3, 4, 5, 6].map(v => Tiles.createTile('wan', v));
    hand.push(...Array.from({ length: 3 }, () => Tiles.createTile('feng', 1)),
        ...Array.from({ length: 3 }, () => Tiles.createTile('jian', 1)),
        Tiles.createTile('wan', 8), Tiles.createTile('wan', 8));
    assert.ok(Rules.calculateFan(hand, [], Rules.canWin(hand), { mahjongType: 'guangdong' })
        .fans.some(f => f.name === '混一色'));
});

test('seven pairs AI does not count a quad as two distinct pairs', () => {
    const { Tiles, Rules, AIUtils } = runtime();
    const hand = Array.from({ length: 4 }, () => Tiles.createTile('feng', 1));
    for (const [suit, value] of [['feng', 2], ['feng', 3], ['jian', 1], ['jian', 2], ['jian', 3]]) {
        hand.push(Tiles.createTile(suit, value), Tiles.createTile(suit, value));
    }
    assert.equal(Rules.canWin(hand).canWin, false);
    assert.ok(AIUtils.calculateSevenPairsShanten(hand) >= 1);
});

test('standard shanten recognizes an embedded wait and orphans do not double-count discards', () => {
    const { Tiles, AIUtils } = runtime();
    const hand = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(v => Tiles.createTile('wan', v));
    hand.push(Tiles.createTile('tong', 2), Tiles.createTile('tong', 4),
        Tiles.createTile('jian', 1), Tiles.createTile('jian', 1));
    assert.equal(AIUtils.calculateStandardShanten(hand), 0);
    const orphans = ['wan', 'tong', 'tiao'].flatMap(s => [1, 9].map(v => Tiles.createTile(s, v)));
    orphans.push(...[1, 2, 3, 4].map(v => Tiles.createTile('feng', v)), Tiles.createTile('jian', 1),
        Tiles.createTile('jian', 2), Tiles.createTile('wan', 5));
    assert.equal(AIUtils.calculateThirteenOrphansShanten(orphans), 1);
});

test('standard shanten cannot count more incomplete groups than the hand can use', () => {
    const { Tiles, AIUtils } = runtime();
    const hand = [...[1, 2, 3, 4].flatMap(v => [Tiles.createTile('feng', v), Tiles.createTile('feng', v)]),
        ...[1, 2, 3].flatMap(v => [Tiles.createTile('jian', v), Tiles.createTile('jian', v)])];
    assert.equal(AIUtils.calculateStandardShanten(hand), 3);
});

test('dingque prefers an already absent suit and seen tiles are not automatically safe', () => {
    const { Tiles, AIUtils } = runtime();
    const hand = [1, 2, 3, 4, 5, 6, 7].map(v => Tiles.createTile('wan', v));
    hand.push(...[1, 2, 3, 4, 5, 6].map(v => Tiles.createTile('tong', v)));
    assert.equal(AIUtils.evaluateQueYiMenChoice(hand, { mahjongType: 'sichuan' }).suit, 'tiao');
    const tile = Tiles.createTile('wan', 5);
    const context = { discardPile: [Tiles.createTile('wan', 5)], deckCount: 10, players: [{ id: 1,
        melds: [1, 2, 3].map(v => ({ type: 'triplet', tiles: Array.from({ length: 3 }, () => Tiles.createTile('wan', v)) })) }] };
    assert.ok(AIUtils.evaluateDanger(tile, context) > 0);
});

test('finishing an earlier claim cannot clear a later pending response', async () => {
    const { MahjongEngine } = runtime();
    const engine = new MahjongEngine();
    engine.initPlayers([]);
    const next = { player: engine.players[1], action: { type: 'peng' } };
    engine.executeChi = async () => { engine.pendingAction = next; engine._pendingActions = [next]; };
    await engine.executeAction(engine.players[0], { type: 'chi' });
    assert.equal(engine.pendingAction, next);
    assert.equal(engine._pendingActions.length, 1);
    engine.destroy();
});

test('invalid self win does not change scores or mark the player as won', async () => {
    const { MahjongEngine, Tiles } = runtime();
    const engine = new MahjongEngine({ speed: 'instant' });
    engine.initPlayers([]);
    engine.state = 'playing';
    engine.players[0].hand = [Tiles.createTile('wan', 1)];
    assert.equal(await engine.executeHu(engine.players[0], { type: 'hu' }), false);
    assert.equal(engine.players[0].isHu, false);
    assert.equal(engine.players[0].score, 1000);
    engine.destroy();
});

test('discard win is rechecked against the actual hand instead of a supplied result', async () => {
    const { MahjongEngine, Tiles } = runtime();
    const engine = new MahjongEngine({ speed: 'instant', maxRounds: 1 });
    engine.initPlayers([]);
    engine.state = 'playing';
    engine.lastDiscard = Tiles.createTile('wan', 1);
    engine.players[1].hand = [Tiles.createTile('tong', 5)];
    assert.equal(await engine.executeHu(engine.players[1], { type: 'hu', winInfo: { canWin: true, type: 'seven_pairs' } }), false);
    assert.equal(engine.players[1].score, 1000);
    engine.destroy();
});

test('resolved sleeps unregister their cancellation callback', async () => {
    const { Utils } = runtime();
    const token = new Utils.CancelToken();
    await Utils.sleep(0, token);
    assert.equal(token._callbacks.length, 0);
});

test('pausing freezes pending AI work and resumes the remaining human time', async t => {
    const { Utils, MahjongEngine } = runtime();
    const engine = new MahjongEngine();
    t.after(() => engine.destroy());
    engine.initPlayers([{ name: 'Human', isAI: false }]);
    engine.state = 'playing';
    engine.startTimer(300);
    let completed = false;
    const work = Utils.sleep(60, engine._token).then(() => { completed = true; });
    engine.pause();
    await new Promise(resolve => setTimeout(resolve, 90));
    assert.equal(completed, false);
    assert.equal(engine.timer, null);
    let remaining;
    engine.on('timerStart', data => { remaining = data.timeout; });
    engine.resume();
    assert.ok(remaining > 0 && remaining <= 300);
    await work;
    assert.equal(completed, true);
    engine.destroy();
});

test('replay resolves real UUID tiles from round snapshots', () => {
    const { Tiles, ReplayPlayer } = runtime();
    const tile = Tiles.createTile('wan', 5);
    const replay = new ReplayPlayer({ players: [{ id: 0 }], rounds: [{ history: [],
        players: [{ id: 0, hand: [], melds: [], discards: [tile] }] }] });
    replay._applyStep({ action: 'gameStart', data: { players: [{ id: 0, hand: [] }] } });
    replay._applyStep({ action: 'draw', data: { playerId: 0, tile: tile.id, deckCount: 60 } });
    assert.equal(replay._findTile(tile.id)?.value, 5);
    replay._applyStep({ action: 'discard', data: { playerId: 0, tile: tile.id } });
    assert.equal(replay._findTile(tile.id)?.value, 5);
    assert.equal(replay.deckCount, 60);
});

test('replay jia gang consumes the fourth tile and preserves four physical IDs', () => {
    const { Tiles, ReplayPlayer } = runtime();
    const tiles = Array.from({ length: 4 }, () => Tiles.createTile('tong', 3));
    const replay = new ReplayPlayer({ players: [{ id: 0 }], rounds: [] });
    replay._applyStep({ action: 'gameStart', data: { players: [{ id: 0, hand: [tiles[3]],
        melds: [{ type: 'triplet', tiles: tiles.slice(0, 3) }] }] } });
    replay._applyStep({ action: 'jiaGang', data: { playerId: 0, meldId: tiles[0].id, tile: tiles[3] } });
    assert.equal(replay.playerStates[0].hand.length, 0);
    assert.equal(new Set(replay.playerStates[0].melds[0].tiles.map(t => t.id)).size, 4);
});

test('flower replacement replay removes the flower and adds the replacement', () => {
    const { Tiles, ReplayPlayer } = runtime();
    const flower = Tiles.createTile('hua', 1), replacement = Tiles.createTile('tong', 8);
    const replay = new ReplayPlayer({ players: [{ id: 0 }], rounds: [] });
    replay._applyStep({ action: 'gameStart', data: { players: [{ id: 0, hand: [flower] }] } });
    replay._applyStep({ action: 'flower', data: { playerId: 0, flower, replacement, deckCount: 50 } });
    assert.equal(replay.playerStates[0].hand[0]?.id, replacement.id);
    assert.equal(replay.playerStates[0].flowers[0]?.id, flower.id);
    assert.equal(replay.deckCount, 50);
});

test('online roster preserves the authoritative host flag', async () => {
    const { P2PNetwork } = runtime();
    const net = new P2PNetwork();
    await net._handleSignal({ type: 'playerOnline', playerId: 'host', name: 'Host', isHost: true });
    assert.equal(net.players[0].isHost, true);
});

test('DataChannel identity cannot be overwritten by message data', () => {
    const { P2PNetwork } = runtime();
    const net = new P2PNetwork(), channel = {};
    let sender;
    net.on('data', data => { sender = data.from; });
    net._attachChannel('actual-peer', channel);
    channel.onmessage({ data: JSON.stringify({ type: 'stateSync', from: 'forged-host' }) });
    assert.equal(sender, 'actual-peer');
});

test('a replacement peer can be closed after its predecessor', () => {
    const { P2PNetwork } = runtime();
    const net = new P2PNetwork();
    let closed = 0;
    for (let i = 0; i < 2; i++) {
        net.peers.set('peer', { close() { closed++; } });
        net._closePeer('peer');
    }
    assert.equal(closed, 2);
    assert.equal(net.peers.size, 0);
});

test('rejected peng and gang preserve the unclaimed discard', async () => {
    for (const method of ['executePeng', 'executeGang']) {
        const { MahjongEngine, Tiles } = runtime({ console: { ...console, error() {} } });
        const engine = new MahjongEngine();
        engine.initPlayers([]);
        engine.state = 'playing';
        const tile = Tiles.createTile('wan', 1);
        engine.lastDiscard = tile;
        engine.discardPile = [tile];
        engine.players[0].discards = [tile];
        engine.nextTurn = async () => {};
        await engine[method](engine.players[1], {});
        assert.equal(engine.discardPile[0]?.id, tile.id);
        assert.equal(engine.players[0].discards[0]?.id, tile.id);
        engine.destroy();
    }
});

test('concealed gang requires four distinct matching tiles owned by the player', async () => {
    const { MahjongEngine, Tiles } = runtime();
    const engine = new MahjongEngine();
    engine.initPlayers([]);
    engine.state = 'playing';
    const tile = Tiles.createTile('wan', 1);
    engine.players[0].hand = [tile];
    const result = await engine.executeAnGang(engine.players[0], { type: 'an_gang', tiles: [tile, tile, tile, tile] });
    assert.equal(result, false);
    assert.equal(engine.players[0].melds.length, 0);
    assert.equal(engine.players[0].hand.length, 1);
    engine.destroy();
});

test('cancel releases all paused sleeps and listeners', async () => {
    const { Utils } = runtime();
    const token = new Utils.CancelToken();
    token.pause();
    const promises = [Utils.sleep(5000, token), Utils.sleep(5000, token)];
    token.cancel();
    const results = await Promise.allSettled(promises);
    assert.ok(results.every(result => result.status === 'rejected' && result.reason.message === 'CANCELLED'));
    assert.equal(token._callbacks.length, 0);
    assert.equal(token._pauseListeners.size, 0);
});
