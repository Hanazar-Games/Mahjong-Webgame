const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const audioSource = fs.readFileSync(path.join(__dirname, '../../js/audio/audio-manager.js'), 'utf8');

async function openGame(page) {
    await page.goto('/');
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
    await page.evaluate(() => startGame({ playerCount: 4, speed: 'instant', maxRounds: 1 }));
    await page.evaluate(() => {
        window.__discards = [];
        AppEventBus.on('engine:discard', data => window.__discards.push(data.tile.id));
    });
}

test('holding Enter on a hand tile selects it without repeating a discard', async ({ page }) => {
    await openGame(page);
    const tile = page.locator('#hand-bottom .mahjong-tile').first();
    const id = await tile.getAttribute('data-id');
    await tile.focus();
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    expect(await page.evaluate(id => window.__discards.includes(id), id)).toBe(false);
    await expect(tile).toHaveClass(/selected/);
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(id => window.__discards.includes(id), id)).toBe(true);
});

test('Space on a hand tile cannot also trigger the global win shortcut', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => {
        const player = App.engine.players[0];
        player.hand = [...[1, 1, 1, 2, 3, 4, 5, 6, 7].map(value => Tiles.createTile('wan', value)),
            ...[2, 3, 4].map(value => Tiles.createTile('tong', value)),
            Tiles.createTile('tiao', 9), Tiles.createTile('tiao', 9)];
        renderGameState();
        App.engine.emit('ziMo', { player: player.toJSON() });
    });
    await expect(page.locator('#btn-hu')).toBeEnabled();
    await page.locator('#hand-bottom .mahjong-tile').first().focus();
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => App.engine.players[0].isHu)).toBe(false);
    await expect(page.locator('#hand-bottom .mahjong-tile.selected')).toHaveCount(1);
});

test('dragging a selected tile back onto itself cancels without a click discard', async ({ page }) => {
    await openGame(page);
    const tile = page.locator('#hand-bottom .mahjong-tile').first();
    const id = await tile.getAttribute('data-id');
    await tile.click();
    await page.waitForTimeout(300);
    const box = await tile.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 70, y, { steps: 4 });
    await page.mouse.move(x, y, { steps: 4 });
    await page.mouse.up();
    expect(await page.evaluate(id => window.__discards.includes(id), id)).toBe(false);
    await expect(page.locator('.mahjong-tile.dragging')).toHaveCount(0);
    await tile.click();
    await expect.poll(() => page.evaluate(id => window.__discards.includes(id), id)).toBe(true);
});

async function offerTwoGangs(page) {
    await page.evaluate(() => {
        const player = App.engine.players[0];
        player.hand = [...Array.from({ length: 4 }, () => Tiles.createTile('wan', 1)),
            ...Array.from({ length: 4 }, () => Tiles.createTile('tong', 2)),
            ...[1, 3, 5, 7, 8, 9].map(value => Tiles.createTile('tiao', value))];
        App.engine.deck.push(Tiles.createTile('tiao', 2));
        App.anGangOptions = Rules.canAnGang(player.hand, player.melds, App.engine.ruleConfig);
        renderGameState();
        enableActionButtons({ type: 'gang' });
    });
}

test('a local player can declare the remaining gang after a replacement draw', async ({ page }) => {
    await openGame(page);
    await offerTwoGangs(page);
    await page.locator('#btn-gang').click();
    await page.locator('.tile-selector-options > button').first().click();
    await expect.poll(() => page.evaluate(() => App.engine.players[0].melds.length)).toBe(1);
    await expect(page.locator('#btn-gang')).toBeEnabled();
    expect(await page.evaluate(() => App.anGangOptions?.length)).toBe(1);
    await page.locator('#btn-gang').click();
    await expect.poll(() => page.evaluate(() => App.engine.players[0].melds.length)).toBe(2);
});

test('claiming a gang also offers a remaining concealed gang after drawing', async ({ page }, testInfo) => {
    await openGame(page);
    await offerTwoGangs(page);
    await page.evaluate(() => {
        const engine = App.engine, player = engine.players[0];
        player.hand.shift();
        engine.lastDiscard = Tiles.createTile('wan', 1);
        engine.discardPile = [engine.lastDiscard];
        engine.currentPlayerIndex = 3;
        engine.state = 'waiting';
        const actions = engine.checkActions(player, engine.lastDiscard, true);
        engine._pendingActions = actions.map(action => ({ player, action, priority: action.priority }));
        engine.pendingAction = engine._pendingActions.find(item => item.action.type === 'gang');
        App.anGangOptions = null;
        renderGameState();
        disableActionButtons();
        actions.forEach(enableActionButtons);
    });
    await expect(page.locator('#btn-peng')).toBeEnabled();
    await page.locator('#btn-gang').click();
    await expect.poll(() => page.evaluate(() => App.engine.players[0].melds.length)).toBe(1);
    await expect(page.locator('#btn-gang')).toBeEnabled();
    await expect(page.locator('#btn-peng')).toBeDisabled();
    await expect(page.locator('#btn-chi')).toBeDisabled();
    await expect(page.locator('#btn-hu')).toBeDisabled();
    expect(await page.evaluate(() => App.anGangOptions?.length)).toBe(1);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: testInfo.outputPath('continued-gang.png') });
});

test('finishing an old gang cannot clear the replacement game choices', async ({ page }) => {
    await openGame(page);
    await offerTwoGangs(page);
    await page.evaluate(() => {
        App.anGangOptions = App.anGangOptions.slice(0, 1);
        App.engine.executeAnGang = () => new Promise(resolve => { window.__finishGang = resolve; });
        window.__oldGang = handleAction('gang');
    });
    await page.evaluate(() => startGame({ playerCount: 4, speed: 'instant', maxRounds: 1 }));
    await offerTwoGangs(page);
    await page.evaluate(async () => { window.__finishGang({ gangShangKaiHua: false }); await window.__oldGang; });
    expect(await page.evaluate(() => App.anGangOptions?.length)).toBe(2);
    await expect(page.locator('#btn-gang')).toBeEnabled();
});

async function openGuest(page) {
    await openGame(page);
    await page.evaluate(() => {
        const engine = App.engine;
        engine.config.gameId = 'ack-audit';
        engine.players.forEach((player, index) => { player.networkId = 'p' + index; player.isAI = false; });
        window.__guestState = JSON.parse(JSON.stringify({ config: engine.config, state: buildNetworkStateFor('p0') }));
        engine.destroy();
        App.engine = null;
        App.isNetworkGame = true;
        window.__messages = [];
        App.network = { isHost: false, playerId: 'p0', players: [{ id: 'p1', isHost: true }],
            sendTo: (id, message) => { window.__messages.push(message); return true; } };
        applyRemoteState(window.__guestState);
    });
}

test('in-flight state snapshots do not acknowledge or unlock a guest action', async ({ page }) => {
    await openGuest(page);
    await page.evaluate(() => _doDiscard(App.engine.players[0].hand[0].id));
    await page.evaluate(() => applyRemoteState(JSON.parse(JSON.stringify(window.__guestState))));
    await expect(page.locator('#hand-bottom [aria-disabled="false"]')).toHaveCount(0);
    await expect(page.locator('#turn-guidance')).toContainText('等待房主确认');
    await page.evaluate(() => _doDiscard(App.engine.players[0].hand[0].id));
    expect(await page.evaluate(() => window.__messages.length)).toBe(1);
    await page.evaluate(() => applyRemoteState({ ...window.__guestState, actionAck: window.__messages[0].actionId }));
    await expect(page.locator('#hand-bottom [aria-disabled="false"]')).toHaveCount(14);
});

test('an acknowledgement for an older action cannot unlock the latest action', async ({ page }) => {
    await openGuest(page);
    await page.evaluate(async () => {
        const id = App.engine.players[0].hand[0].id;
        await _doDiscard(id);
        applyRemoteState({ ...window.__guestState, actionAck: window.__messages[0].actionId });
        await _doDiscard(id);
        applyRemoteState({ ...window.__guestState, actionAck: window.__messages[0].actionId });
    });
    await expect(page.locator('#hand-bottom [aria-disabled="false"]')).toHaveCount(0);
    const ids = await page.evaluate(() => window.__messages.map(message => message.actionId));
    expect(new Set(ids).size).toBe(2);
});

test('the host acknowledges a rejected stale turn action only to its sender', async ({ page }) => {
    await openGame(page);
    const result = await page.evaluate(async () => {
        App.engine.players.forEach((player, index) => { player.networkId = 'p' + index; player.isAI = false; });
        const messages = [];
        App.isNetworkGame = true;
        App.network = { isHost: true, playerId: 'p0', players: [{ id: 'p0' }, { id: 'p1' }, { id: 'p2' }],
            sendTo: (id, message) => { messages.push({ id, ack: message.data.actionAck }); return true; } };
        await handleRemotePlayerAction('p1', { type: 'discard', tileId: App.engine.players[1].hand[0].id }, 'stale-turn', App.engine.config.gameId);
        return messages;
    });
    expect(result.find(message => message.id === 'p1')?.ack).toBe('stale-turn');
    expect(result.find(message => message.id === 'p2')?.ack).toBeFalsy();
});

test('turning BGM volume off while resume is pending cancels the pending loop', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async source => {
        const offline = new OfflineAudioContext(1, 44100, 44100);
        let state = 'suspended', finish, timers = 0;
        const pending = new Promise(resolve => { finish = () => { state = 'running'; resolve(); }; });
        const context = new Proxy(offline, { get(target, key) {
            if (key === 'state') return state;
            if (key === 'resume') return () => pending;
            const value = target[key];
            return typeof value === 'function' ? value.bind(target) : value;
        } });
        const manager = new Function('window', 'document', 'setTimeout', 'clearTimeout', source + ';return AudioManager;')(
            { AudioContext: function() { return context; } }, { hidden: false }, () => ++timers, () => timers--);
        manager.startBgm('calm');
        manager.setBgmVolume(0);
        finish();
        await pending;
        await Promise.resolve();
        const result = { playing: manager.isPlaying, style: manager.currentBgm, timers };
        manager.stopBgm();
        return result;
    }, audioSource);
    expect(result).toEqual({ playing: false, style: null, timers: 0 });
});

test('recreating an audio context discards delayed SFX from the closed context', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(source => {
        const states = [], timers = new Map();
        let id = 0;
        const manager = new Function('window', 'document', 'setTimeout', 'clearTimeout', source + ';return AudioManager;')({
            AudioContext: function() {
                const offline = new OfflineAudioContext(1, 44100, 44100);
                const index = states.push('running') - 1;
                return new Proxy(offline, { get(target, key) {
                    if (key === 'state') return states[index];
                    const value = target[key];
                    return typeof value === 'function' ? value.bind(target) : value;
                } });
            }
        }, { hidden: false }, callback => { timers.set(++id, callback); return id; }, id => timers.delete(id));
        manager.SFX.buttonClick();
        manager.SFX.gameStart();
        const before = timers.size;
        states[0] = 'closed';
        const [timerId, callback] = [...timers][0];
        timers.delete(timerId);
        callback();
        const contextsBeforeInteraction = states.length;
        manager.SFX.buttonClick();
        return { before, after: timers.size, contexts: states.length, contextsBeforeInteraction };
    }, audioSource);
    expect(result.before).toBeGreaterThan(0);
    expect(result.contextsBeforeInteraction).toBe(1);
    expect(result.contexts).toBe(2);
    expect(result.after).toBe(0);
});

test('a guest ignores incoming player actions from other peers', async ({ page }) => {
    await openGuest(page);
    await page.evaluate(() => handleRemotePlayerAction('p0', { type: 'skip' }));
    expect(await page.evaluate(() => !!App.engine.players[0].selfActionsSkipped)).toBe(false);
});

test('a delayed player action from an earlier match cannot change the new match', async ({ page }) => {
    await openGame(page);
    const skipped = await page.evaluate(() => {
        App.engine.config.gameId = 'current-match';
        App.engine.players[1].networkId = 'guest';
        App.engine.currentPlayerIndex = 1;
        App.network = { isHost: true };
        handleNetworkData('playerAction', { type: 'skip' }, 'guest', 'old-action', 'previous-match');
        return !!App.engine.players[1].selfActionsSkipped;
    });
    expect(skipped).toBe(false);
});

for (const [width, height] of [[1440, 900], [1280, 720], [390, 844], [375, 667], [844, 390], [667, 375]]) {
    test(`declared melds and the playable hand fit together at ${width}x${height}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height });
        await openGame(page);
        for (const count of [1, 4]) {
            await page.evaluate(count => {
                const player = App.engine.players[0];
                player.melds = Array.from({ length: count }, (_, index) => ({ type: 'gang',
                    tiles: Array.from({ length: 4 }, () => Tiles.createTile('wan', index + 1)) }));
                player.hand = Array.from({ length: 14 - count * 3 }, (_, index) => Tiles.createTile('tong', index % 9 + 1));
                renderGameState();
                ['chi', 'peng', 'gang', 'hu'].forEach(type => enableActionButtons({ type }));
            }, count);
            await page.waitForTimeout(400);
            const layout = await page.evaluate(() => {
                const player = document.getElementById('player-bottom').getBoundingClientRect();
                const hand = document.getElementById('hand-bottom');
                const actions = document.getElementById('action-bar').getBoundingClientRect();
                const info = document.querySelector('#player-bottom .player-info').getBoundingClientRect();
                const handTiles = [...hand.querySelectorAll('.mahjong-tile')].map(tile => tile.getBoundingClientRect());
                const tiles = [...document.querySelectorAll('#player-bottom .mahjong-tile')].map(tile => tile.getBoundingClientRect());
                const inside = rect => rect.left >= player.left - 1 && rect.right <= player.right + 1 &&
                    rect.top >= player.top - 1 && rect.bottom <= player.bottom + 1;
                const overlap = rect => Math.max(0, Math.min(rect.right, actions.right) - Math.max(rect.left, actions.left)) *
                    Math.max(0, Math.min(rect.bottom, actions.bottom) - Math.max(rect.top, actions.top));
                return { clipped: tiles.filter(tile => !inside(tile)).length,
                    readable: tiles.every(tile => tile.width >= 18 && tile.height >= 26),
                    handOverlap: handTiles.some((tile, index) => index > 0 && tile.left < handTiles[index - 1].right - 1),
                    covered: [info, ...tiles].some(rect => overlap(rect) > 0), scroll: hand.scrollWidth - hand.clientWidth };
            });
            expect(layout, `${count} melds`).toEqual({ clipped: 0, readable: true, handOverlap: false, covered: false, scroll: 0 });
        }
        await page.screenshot({ path: testInfo.outputPath('melds-and-hand.png') });
    });
}
