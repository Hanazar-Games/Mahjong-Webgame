const { test, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const path = require('node:path');

let server, signalUrl;
test.beforeEach(async ({ baseURL }) => {
    const socket = createServer();
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    signalUrl = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, [path.join(__dirname, '../../server/signaling-server.js'), String(port)], {
        env: { ...process.env, NODE_ENV: 'production', ALLOWED_ORIGINS: baseURL }, stdio: 'ignore'
    });
    await expect.poll(async () => fetch(signalUrl + '/rooms').then(r => r.status).catch(() => 0)).toBe(200);
});
test.afterEach(async () => {
    if (server && server.exitCode === null) {
        const exited = new Promise(resolve => server.once('exit', resolve));
        server.kill();
        await exited;
    }
});

test('real WebRTC clients synchronize turns, survive reconnect, rematch and leave', async ({ browser, baseURL }) => {
    test.setTimeout(60_000);
    const contexts = await Promise.all([browser.newContext({ baseURL }), browser.newContext({ baseURL })]);
    const [host, guest] = await Promise.all(contexts.map(context => context.newPage()));
    const errors = [];
    for (const page of [host, guest]) {
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    }
    try {
        for (const page of [host, guest]) {
            await page.goto('/');
            await page.locator('#loading-screen').waitFor({ state: 'detached' });
            await page.evaluate(url => {
                document.getElementById('signal-server').value = url;
                initNetwork();
            }, signalUrl);
        }
        const { roomId } = await host.evaluate(() => App.network.createRoom('Integration', 'guangdong', 'Host'));
        await guest.evaluate(id => App.network.joinRoom(id, 'Guest'), roomId);
        for (const page of [host, guest]) {
            await expect.poll(() => page.evaluate(() => [...App.network.channels.values()].filter(c => c.readyState === 'open').length)).toBe(1);
        }
        await host.evaluate(() => App.network.startGame({ mahjongType: 'guangdong', playerCount: 4, speed: 'instant', maxRounds: 1 }));
        await expect(guest.locator('#hand-bottom .mahjong-tile')).toHaveCount(13);
        expect(await guest.evaluate(() => App.localPlayerIndex)).toBe(1);
        expect(await host.evaluate(() => App.engine.players.length)).toBe(2);
        expect(await guest.evaluate(() => App.network.players.find(p => p.isHost)?.name)).toBe('Host');
        await host.evaluate(() => App.engine.playerDiscard(App.engine.players[0].hand[0].id));
        if (await guest.evaluate(() => !!App.engine.pendingAction)) await guest.locator('#btn-skip').click();
        await expect.poll(() => guest.evaluate(() => App.engine.currentPlayerIndex)).toBe(1);
        await expect(guest.locator('#hand-bottom .mahjong-tile')).toHaveCount(14);
        const tile = guest.locator('#hand-bottom .mahjong-tile').first();
        const tileId = await tile.getAttribute('data-id');
        await tile.click();
        await tile.click();
        await expect.poll(() => host.evaluate(id => App.engine.players[1].discards.some(t => t.id === id), tileId)).toBe(true);
        await expect(guest.locator('#hand-bottom .mahjong-tile')).toHaveCount(13);
        const snapshot = await guest.evaluate(() => App.engine.players[1].hand.map(t => t.id));
        await guest.waitForTimeout(13_000);
        expect(await guest.evaluate(() => ({ connected: App.network.connected, attempts: App.network.sseReconnectAttempts,
            age: Date.now() - App.network.lastPong }))).toMatchObject({ connected: true, attempts: 0 });
        expect(await guest.evaluate(() => Date.now() - App.network.lastPong)).toBeLessThan(5000);

        await guest.evaluate(() => {
            App.network._closePeer(App.network.players.find(p => p.isHost).id);
            App.network.sse.onerror();
        });
        for (const page of [host, guest]) {
            await expect.poll(() => page.evaluate(() => [...App.network.channels.values()].filter(c => c.readyState === 'open').length), { timeout: 15_000 }).toBe(1);
        }
        expect(await guest.evaluate(() => App.engine.players[1].hand.map(t => t.id))).toEqual(snapshot);
        expect(await guest.evaluate(() => App.network.players.filter(p => p.isHost).length)).toBe(1);
        await guest.evaluate(() => showIngameMenu());
        await expect(guest.locator('#ingame-title-text')).toHaveText('菜单 · 联机对局继续中');
        await expect(guest.locator('#btn-restart')).toBeDisabled();
        await guest.evaluate(() => hideIngameMenu());
        await host.evaluate(() => App.engine.endRound());
        await expect(guest.locator('#game-result')).toHaveClass(/active/);
        await expect(guest.locator('#btn-result-restart')).toBeDisabled();
        await host.locator('#btn-result-restart').click();
        await expect(guest.locator('#game-screen')).toHaveClass(/active/);
        await expect(guest.locator('#hand-bottom .mahjong-tile')).toHaveCount(13);
        expect(await host.evaluate(() => App.isNetworkGame)).toBe(true);
        await host.evaluate(() => endGame());
        await expect.poll(() => guest.evaluate(() => App.network.roomId)).toBe(null);
        await expect(guest.locator('#network-lobby')).toHaveClass(/active/);
        expect(await guest.evaluate(() => App.engine)).toBe(null);
        expect(errors).toEqual([]);
    } finally {
        await Promise.all(contexts.map(context => context.close()));
    }
});

test('signaling membership credentials protect public player IDs and room boundaries', async ({ request }) => {
    const create = async () => (await request.post(signalUrl + '/room/create', {
        data: { name: 'Auth', mahjongType: 'guangdong', playerName: 'Host' }
    })).json();
    const owner = await create(), other = await create();
    const guest = await (await request.post(`${signalUrl}/room/${owner.roomId}/join`, { data: { playerName: 'Guest' } })).json();
    for (const endpoint of ['start', 'leave', 'send']) {
        expect((await request.post(`${signalUrl}/room/${owner.roomId}/${endpoint}`, {
            data: { playerId: owner.playerId, type: 'sdp-offer', data: {} }
        })).status()).toBe(403);
    }
    expect((await request.get(`${signalUrl}/room/${owner.roomId}/events?playerId=${owner.playerId}`)).status()).toBe(403);
    for (const identity of [other, guest]) {
        expect((await request.post(`${signalUrl}/room/${owner.roomId}/start`, {
            headers: { Authorization: `Bearer ${identity.playerToken}` }, data: { playerId: identity.playerId }
        })).status()).toBe(403);
    }
    const rooms = await (await request.get(signalUrl + '/rooms')).json();
    expect(JSON.stringify(rooms)).not.toContain(owner.playerToken);
    for (const identity of [owner, other]) {
        expect((await request.post(`${signalUrl}/room/${identity.roomId}/leave`, {
            headers: { Authorization: `Bearer ${identity.playerToken}` }, data: { playerId: identity.playerId }
        })).status()).toBe(200);
    }
});

test('four real clients receive their own seats, hidden hands and authoritative countdowns', async ({ browser, baseURL }) => {
    const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ baseURL, serviceWorkers: 'block' })));
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    try {
        await Promise.all(pages.map(async page => {
            await page.goto('/');
            await page.locator('#loading-screen').waitFor({ state: 'detached' });
            await page.evaluate(url => {
                document.getElementById('signal-server').value = url;
                initNetwork();
                App.settings.opponentDisplay = 'full';
            }, signalUrl);
        }));
        const [host, ...guests] = pages;
        const { roomId } = await host.evaluate(() => App.network.createRoom('Four players', 'guangdong', 'Host'));
        for (let index = 0; index < guests.length; index++) {
            await guests[index].evaluate(({ roomId, index }) => App.network.joinRoom(roomId, 'Guest ' + index), { roomId, index });
        }
        await expect.poll(() => host.evaluate(() => [...App.network.channels.values()].filter(channel => channel.readyState === 'open').length)).toBe(3);
        await host.evaluate(() => App.network.startGame({ speed: 'instant', maxRounds: 1 }));
        for (let index = 0; index < guests.length; index++) {
            const page = guests[index];
            await expect(page.locator('#hand-bottom .mahjong-tile')).toHaveCount(13);
            expect(await page.evaluate(() => App.localPlayerIndex)).toBe(index + 1);
            expect(await page.locator('#hand-top .tile-face, #hand-left .tile-face, #hand-right .tile-face').count()).toBe(0);
        }
        await host.evaluate(() => {
            App.engine.config.speed = 'normal';
            App.engine.startTimer(10_000);
            broadcastGameState();
        });
        for (const page of guests) {
            await expect(page.locator('#turn-timer-display')).toBeVisible();
            expect(await page.evaluate(() => App.engine.timer)).toBe(null);
        }
        await host.evaluate(() => App.network.leaveRoom());
        for (const page of guests) await expect.poll(() => page.evaluate(() => App.network.roomId)).toBe(null);
    } finally {
        await Promise.all(contexts.map(context => context.close()));
    }
});
