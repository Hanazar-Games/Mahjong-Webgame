const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const audioSource = fs.readFileSync(path.join(__dirname, '../../js/audio/audio-manager.js'), 'utf8');

async function openApp(page, game = false) {
    await page.goto('/');
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
    if (game) await page.evaluate(() => startGame({ playerCount: 4, speed: 'instant', maxRounds: 1 }));
}

for (const cancel of [false, true, 'multitouch']) {
    const outcome = cancel === 'multitouch' ? 'cancels when a second finger joins'
        : cancel ? 'can be cancelled without discarding' : 'discards without opening the menu';
    test(`touch dragging into the discard pile ${outcome}`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await openApp(page, true);
        await page.waitForTimeout(800);
        await page.evaluate(() => {
            window.__touchDiscards = [];
            AppEventBus.on('engine:discard', data => window.__touchDiscards.push(data.tile.id));
        });
        const tile = page.locator('#hand-bottom .mahjong-tile').first();
        const id = await tile.getAttribute('data-id');
        const start = await tile.boundingBox();
        const target = await page.locator('#discard-pile').boundingBox();
        const from = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
        const to = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
        for (let step = 1; step <= 4; step++) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
                x: from.x + (to.x - from.x) * step / 4, y: from.y + (to.y - from.y) * step / 4
            }] });
        }
        if (cancel === 'multitouch') {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
                { ...to, id: 0 }, { x: to.x + 10, y: to.y + 10, id: 1 }
            ] });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: cancel === true ? 'touchCancel' : 'touchEnd', touchPoints: [] });
        await expect(page.locator('#ingame-menu')).toBeHidden();
        if (cancel) {
            expect(await page.evaluate(() => window.__touchDiscards)).toEqual([]);
            await expect(page.locator(`#hand-bottom [data-id="${id}"]`)).toHaveCount(1);
        } else {
            await expect.poll(() => page.evaluate(id => window.__touchDiscards.includes(id), id)).toBe(true);
        }
        await expect(page.locator('.mahjong-tile.dragging')).toHaveCount(0);
        await expect(page.locator('#discard-pile')).not.toHaveClass(/discard-target/);
        await cdp.detach();
    });
}

async function openGuest(page, claim = false) {
    await openApp(page, true);
    await page.evaluate(claim => {
        const engine = App.engine;
        engine.config.gameId = 'choice-audit';
        engine.players.forEach((player, index) => { player.networkId = 'p' + index; player.isAI = false; });
        engine.players[1].hand = [
            ...Array.from({ length: 4 }, () => Tiles.createTile('wan', 1)),
            ...Array.from({ length: 4 }, () => Tiles.createTile('tong', 2)),
            ...[1, 3, 5, 7, 8, 9].map(value => Tiles.createTile('tiao', value))
        ];
        engine.currentPlayerIndex = 1;
        if (claim) {
            const player = engine.players[1];
            player.hand = [...[1, 2, 4, 5].map(value => Tiles.createTile('wan', value)),
                ...Array.from({ length: 9 }, (_, index) => Tiles.createTile('tiao', index + 1))];
            engine.lastDiscard = Tiles.createTile('wan', 3);
            engine.discardPile = [engine.lastDiscard];
            engine.currentPlayerIndex = 0;
            engine.state = 'waiting';
            const action = engine.checkActions(player, engine.lastDiscard, true).find(action => action.type === 'chi');
            engine.pendingAction = { player, action, priority: action.priority };
            engine._pendingActions = [engine.pendingAction];
        }
        window.__choicePayload = JSON.parse(JSON.stringify({ config: engine.config, state: buildNetworkStateFor('p1') }));
        engine.destroy();
        App.engine = null;
        App.isNetworkGame = true;
        window.__guestMessages = [];
        App.network = { isHost: false, playerId: 'p1', players: [{ id: 'p0', isHost: true }],
            sendTo: (id, message) => { window.__guestMessages.push(message); return true; } };
        applyRemoteState(window.__choicePayload);
    }, claim);
}

test('swiping upward from the player information still opens the game menu', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page, true);
    await page.waitForTimeout(800);
    const box = await page.locator('#player-bottom .player-info').boundingBox();
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let step = 1; step <= 4; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x, y: from.y - step * 35 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('#ingame-menu')).toBeVisible();
    await cdp.detach();
});

test('a refreshed guest state preserves the chosen gang option by tile identity', async ({ page }) => {
    await openGuest(page);
    await page.locator('#btn-gang').click();
    await expect(page.locator('#tile-selector-overlay')).toBeVisible();
    await page.evaluate(() => applyRemoteState(JSON.parse(JSON.stringify(window.__choicePayload))));
    await page.locator('.tile-selector-options > button').nth(1).click();
    await expect.poll(() => page.evaluate(() => window.__guestMessages.map(message => message.data))).toEqual([
        { type: 'gang', optionIndex: 1 }
    ]);
});

test('a guest choice closes when the authoritative turn moves on', async ({ page }) => {
    await openGuest(page);
    await page.locator('#btn-gang').click();
    await page.evaluate(() => {
        const next = JSON.parse(JSON.stringify(window.__choicePayload));
        next.state.currentPlayer = 2;
        next.state.selfActions = {};
        applyRemoteState(next);
    });
    await expect(page.locator('#tile-selector-overlay')).toHaveCount(0);
    expect(await page.evaluate(() => window.__guestMessages)).toEqual([]);
    expect(await page.evaluate(() => App._actionPending)).toBe(false);
});

test('a refreshed chi choice follows the selected tiles when option order changes', async ({ page }) => {
    await openGuest(page, true);
    await page.locator('#btn-chi').click();
    await expect(page.locator('.tile-selector-options > button')).toHaveCount(3);
    await page.evaluate(() => {
        const next = JSON.parse(JSON.stringify(window.__choicePayload));
        next.state.pendingAction.actions[0].options.reverse();
        next.state.pendingAction.action.options.reverse();
        applyRemoteState(next);
    });
    await page.locator('.tile-selector-options > button').first().click();
    await expect.poll(() => page.evaluate(() => window.__guestMessages.map(message => message.data))).toEqual([
        { type: 'chi', selectedOptionIndex: 2 }
    ]);
});

for (const change of ['removed-options', 'new-round', 'new-discard']) {
    test(`a stale choice closes after ${change} even without a player change`, async ({ page }) => {
        await openGuest(page, change === 'new-discard');
        await page.locator(change === 'new-discard' ? '#btn-chi' : '#btn-gang').click();
        await page.evaluate(change => {
            const next = JSON.parse(JSON.stringify(window.__choicePayload));
            if (change === 'removed-options') next.state.selfActions = {};
            if (change === 'new-round') next.state.round++;
            if (change === 'new-discard') next.state.lastDiscard = Tiles.createTile('wan', 3);
            applyRemoteState(next);
        }, change);
        await expect(page.locator('#tile-selector-overlay')).toHaveCount(0);
        expect(await page.evaluate(() => ({ messages: window.__guestMessages, pending: App._actionPending })))
            .toEqual({ messages: [], pending: false });
    });
}

test('a settings redraw cannot unlock or repeat an unacknowledged guest discard', async ({ page }) => {
    await openGuest(page);
    await page.evaluate(async () => {
        const id = App.engine.players[1].hand[0].id;
        await _doDiscard(id);
        renderGameState();
    });
    await expect(page.locator('#hand-bottom .mahjong-tile[aria-disabled="false"]')).toHaveCount(0);
    await page.evaluate(() => _doDiscard(App.engine.players[1].hand[0].id));
    expect(await page.evaluate(() => window.__guestMessages.length)).toBe(1);
    await page.evaluate(() => applyRemoteState(JSON.parse(JSON.stringify(window.__choicePayload))));
    await expect(page.locator('#hand-bottom .mahjong-tile[aria-disabled="false"]')).toHaveCount(14);
});

test('the pause menu takes focus and restores it when resumed', async ({ page }) => {
    await openApp(page, true);
    await page.locator('#btn-menu').click();
    await expect(page.locator('#btn-resume')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#btn-menu')).toBeFocused();
});

test('modal Tab navigation recovers focus if it was moved outside the dialog', async ({ page }) => {
    await openApp(page, true);
    await page.locator('#btn-menu').click();
    await page.locator('#btn-menu').evaluate(button => button.focus());
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.getElementById('ingame-menu').contains(document.activeElement))).toBe(true);
});

for (const setting of ['disabled', 'zero-volume']) {
    test(`ordinary interactions do not initialize audio with ${setting} SFX and no BGM`, async ({ page }) => {
        await page.addInitScript(setting => {
            localStorage.setItem('mahjong__version', '1');
            localStorage.setItem('mahjong_settings', JSON.stringify({ bgmStyle: 'none', bgmVolume: 0,
                sfxEnabled: setting !== 'disabled', sfxVolume: setting === 'zero-volume' ? 0 : 50 }));
            window.__audioStarts = 0;
            window.AudioContext = new Proxy(window.AudioContext, { construct(Target, args) {
                window.__audioStarts++;
                return new Target(...args);
            } });
        }, setting);
        await openApp(page);
        await page.getByRole('button', { name: '设置', exact: true }).click();
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => window.__audioStarts)).toBe(0);
        if (setting === 'disabled') await page.locator('label[for="sfx-enabled"]').click();
        else { await page.locator('#sfx-volume').fill('40'); await page.locator('#sfx-volume').dispatchEvent('change'); }
        expect(await page.evaluate(() => window.__audioStarts)).toBe(1);
    });
}

test('a suspended BGM stops adding future phrases and resumes on interaction', async ({ page }) => {
    await openApp(page);
    const result = await page.evaluate(source => {
        const offline = new OfflineAudioContext(1, 44100, 44100);
        const timers = new Map();
        let state = 'running', notes = 0, timerId = 0;
        const context = new Proxy(offline, { get(target, key) {
            if (key === 'state') return state;
            if (key === 'resume') return () => { state = 'running'; return Promise.resolve(); };
            if (key === 'createOscillator') return () => { notes++; return target.createOscillator(); };
            const value = target[key];
            return typeof value === 'function' ? value.bind(target) : value;
        } });
        const doc = new EventTarget();
        doc.hidden = false;
        const manager = new Function('window', 'document', 'setTimeout', 'clearTimeout', source + ';return AudioManager;')(
            { AudioContext: function() { return context; } }, doc,
            fn => { timers.set(++timerId, fn); return timerId; }, id => timers.delete(id));
        manager.setupUserInteraction();
        manager.startBgm('calm');
        const before = notes;
        state = 'suspended';
        const [id, callback] = [...timers][0];
        timers.delete(id);
        callback();
        const stopped = { notes, timers: timers.size };
        doc.dispatchEvent(new Event('click'));
        const resumed = { notes, style: manager.currentBgm, playing: manager.isPlaying };
        manager.stopBgm();
        return { before, stopped, resumed };
    }, audioSource);
    expect(result.stopped).toEqual({ notes: result.before, timers: 0 });
    expect(result.resumed.notes).toBeGreaterThan(result.before);
    expect(result.resumed.style).toBe('calm');
    expect(result.resumed.playing).toBe(true);
});

test('initial asynchronous audio resume starts only the current BGM request', async ({ page }) => {
    await openApp(page);
    const result = await page.evaluate(async source => {
        const offline = new OfflineAudioContext(1, 44100, 44100);
        let state = 'suspended', finishResume, notes = 0;
        const pending = new Promise(resolve => { finishResume = () => { state = 'running'; resolve(); }; });
        const context = new Proxy(offline, { get(target, key) {
            if (key === 'state') return state;
            if (key === 'resume') return () => pending;
            if (key === 'createOscillator') return () => { notes++; return target.createOscillator(); };
            const value = target[key];
            return typeof value === 'function' ? value.bind(target) : value;
        } });
        const manager = new Function('window', 'document', 'setTimeout', 'clearTimeout', source + ';return AudioManager;')(
            { AudioContext: function() { return context; } }, { hidden: false }, () => 1, () => {});
        manager.startBgm('calm');
        manager.stopBgm();
        manager.startBgm('zen');
        const before = notes;
        finishResume();
        await pending;
        await Promise.resolve();
        const resumed = { notes, style: manager.currentBgm, playing: manager.isPlaying };
        manager.stopBgm();
        return { before, resumed };
    }, audioSource);
    expect(result.before).toBe(0);
    expect(result.resumed.notes).toBeGreaterThan(0);
    expect(result.resumed.style).toBe('zen');
    expect(result.resumed.playing).toBe(true);
});

test('settlement score and supporting text remain readable in every theme', async ({ page }) => {
    await openApp(page, true);
    const failures = await page.evaluate(() => {
        App.engine.state = 'ended';
        const players = App.engine.players.map((player, index) => ({ ...player.toJSON(), score: index ? 950 : 1150 }));
        showGameResult({ players, winner: players[0] }, { matchIsWin: true, expGain: 20 });
        const rgba = text => text.match(/[\d.]+/g).map(Number);
        const blend = (front, back) => front.slice(0, 3).map((value, index) => value * (front[3] ?? 1) + back[index] * (1 - (front[3] ?? 1)));
        const luminance = rgb => rgb.map(value => value / 255).map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
            .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        const selectors = ['.result-p-score.positive', '.result-p-score.negative', '.result-subtitle',
            '.result-rank.normal', '.result-rank.gold', '.result-rank.silver', '.result-rank.bronze', '.result-reward-chip'];
        const failures = [];
        for (const theme of ['classic-green', 'dark-blue', 'wood', 'red', 'amethyst', 'ink', 'sunset']) {
            applyTheme(theme);
            for (const selector of selectors) {
                const element = document.querySelector(selector), parents = [];
                for (let node = element; node; node = node.parentElement) parents.unshift(node);
                const bg = parents.reduce((color, node) => blend(rgba(getComputedStyle(node).backgroundColor), color), [0, 0, 0]);
                const style = getComputedStyle(element);
                const gradientStops = style.backgroundImage.match(/rgba?\([^)]+\)/g);
                const backgrounds = gradientStops ? gradientStops.map(stop => blend(rgba(stop), bg)) : [bg];
                const foreground = luminance(rgba(style.color));
                const ratio = Math.min(...backgrounds.map(color => {
                    const background = luminance(color);
                    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
                }));
                if (ratio < 4.5) failures.push({ theme, selector, ratio });
            }
        }
        return failures;
    });
    expect(failures).toEqual([]);
});

test('a long network name does not push settlement scores outside the row', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openApp(page, true);
    await page.evaluate(() => {
        App.engine.state = 'ended';
        const players = App.engine.players.map((player, index) => ({ ...player.toJSON(),
            name: 'WWWWWWWWWWWW', score: index ? -10000 : 34000 }));
        showGameResult({ players, winner: players[0] }, { matchIsWin: true, expGain: 20 });
    });
    const rows = await page.locator('.result-player-row').evaluateAll(rows => rows.map(row => ({
        width: row.clientWidth, content: row.scrollWidth
    })));
    expect(rows.every(row => row.content <= row.width + 1)).toBe(true);
    await page.waitForTimeout(700);
    await page.screenshot({ path: testInfo.outputPath('long-name-settlement.png') });
});
