const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

async function openApp(page, game = false) {
    await page.goto('/');
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
    if (game) await page.evaluate(() => startGame({ playerCount: 4, speed: 'instant', maxRounds: 1 }));
}

test('a successful setting change settles pending slider persistence before later failures', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.evaluate(() => {
        const volume = document.getElementById('sfx-volume');
        volume.value = '25';
        volume.dispatchEvent(new Event('input', { bubbles: true }));
        const theme = document.getElementById('table-theme');
        theme.value = 'amethyst';
        theme.dispatchEvent(new Event('change', { bubbles: true }));
        Stats.saveSettings = () => false;
    });
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => ({
        memory: App.settings.tableTheme, stored: Stats.getSettings().tableTheme,
        volume: App.settings.sfxVolume, liveVolume: AudioManager.getSfxVolume()
    }))).toEqual({ memory: 'amethyst', stored: 'amethyst', volume: 25, liveVolume: 0.25 });
    await expect(page.locator('#table-theme')).toHaveValue('amethyst');
});

test('a failed setting change rolls back the pending slider as one transaction', async ({ page }) => {
    await openApp(page);
    const initial = await page.evaluate(() => App.settings.sfxVolume);
    const actual = await page.evaluate(() => {
        const volume = document.getElementById('sfx-volume');
        volume.value = '25';
        volume.dispatchEvent(new Event('input', { bubbles: true }));
        Stats.saveSettings = () => false;
        const theme = document.getElementById('table-theme');
        theme.value = 'amethyst';
        theme.dispatchEvent(new Event('change', { bubbles: true }));
        return { volume: App.settings.sfxVolume, live: AudioManager.getSfxVolume() };
    });
    expect(actual).toEqual({ volume: initial, live: initial / 100 });
});

test('remote chi starts an authoritative discard countdown', async ({ page }) => {
    await openApp(page, true);
    const result = await page.evaluate(async () => {
        const engine = App.engine;
        engine.config.speed = 'normal';
        engine.turnTimeout = 9000;
        const remote = engine.players[1];
        remote.isAI = false;
        remote.networkId = 'remote';
        remote.name = 'Remote';
        App.isNetworkGame = true;
        App.network = { isHost: true, playerId: 'host', players: [{ id: 'remote' }], sendTo: () => true };
        const claimed = Tiles.createTile('wan', 3);
        const sequence = [Tiles.createTile('wan', 1), Tiles.createTile('wan', 2), claimed];
        remote.hand = [...sequence.slice(0, 2), ...Array.from({ length: 11 }, (_, i) => Tiles.createTile('tong', i % 9 + 1))];
        engine.lastDiscard = claimed;
        engine.discardPile = [claimed];
        engine.currentPlayerIndex = 0;
        engine.state = 'waiting';
        const action = engine.checkActions(remote, claimed, true).find(action => action.type === 'chi');
        engine.pendingAction = { player: remote, action, priority: action.priority };
        engine._pendingActions = [engine.pendingAction];
        await handleRemotePlayerAction('remote', { type: 'chi', selectedOptionIndex: 0 });
        return { current: engine.currentPlayerIndex, melds: remote.melds.length,
            timed: !!engine.timer, remaining: buildNetworkStateFor('remote').turnRemainingMs };
    });
    expect(result.current).toBe(1);
    expect(result.melds).toBe(1);
    expect(result.timed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
    await expect(page.locator('#turn-timer-display')).toBeVisible();
    await expect(page.locator('#player-right')).toHaveClass(/current-turn/);
    await expect(page.locator('#turn-guidance')).toContainText('等待 Remote 出牌');
});

for (const [width, height] of [[1440, 900], [1280, 720], [390, 844], [375, 667], [844, 390], [667, 375]]) {
    test(`complete settlement stays scrollable and contained at ${width}x${height}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height });
        await openApp(page, true);
        await page.evaluate(async () => {
            App.engine.state = 'ended';
            const players = App.engine.players.map((player, index) => ({ ...player.toJSON(), name: `PlayerName${index}` }));
            showGameResult({ players, winner: players[0] }, { expGain: 50, matchIsWin: true,
                matchHuCount: 4, matchZiMoCount: 2, matchGangCount: 6, matchFan: 88, matchWonRounds: 4, matchRounds: 4 });
            document.getElementById('game-result').scrollTop = 0;
        });
        await page.waitForTimeout(500);
        await page.screenshot({ path: testInfo.outputPath('settlement-top.png') });
        const top = await page.locator('.result-header').boundingBox();
        expect(top.y).toBeGreaterThanOrEqual(0);
        await page.locator('#btn-result-exit').scrollIntoViewIfNeeded();
        const exit = await page.locator('#btn-result-exit').boundingBox();
        expect(exit.y + exit.height).toBeLessThanOrEqual(height);
        if (height < 500) await page.screenshot({ path: testInfo.outputPath('settlement-actions.png') });
        const bounds = await page.locator('.result-player-row').evaluateAll(rows => rows.map(row => ({
            width: row.clientWidth, content: row.scrollWidth
        })));
        expect(bounds.every(row => row.content <= row.width + 1)).toBe(true);
    });
}

test('replay write failure is visible without preventing settlement', async ({ page }) => {
    await openApp(page, true);
    await page.evaluate(async () => {
        const original = Storage.set;
        Storage.set = (key, value) => key === 'replays' ? false : original(key, value);
        await App.engine.endRound();
    });
    await expect(page.locator('#game-result')).toHaveClass(/active/);
    await expect(page.getByText('回放保存失败', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => Stats.getStats().totalGames)).toBe(1);
});

test('an empty replay clears the previous deck count and player information', async ({ page }) => {
    await openApp(page, true);
    await page.evaluate(async () => {
        await App.engine.endRound();
        openReplayPlayer(Replay.getReplays()[0]);
    });
    await expect(page.locator('#replay-deck-count')).not.toHaveText('剩余: —');
    await page.evaluate(() => openReplayPlayer({ mahjongType: 'guangdong',
        players: [{ id: 0, name: 'Empty A' }, { id: 1, name: 'Empty B' }], rounds: [] }));
    await expect(page.locator('#replay-deck-count')).toHaveText('剩余: —');
    await expect(page.locator('#replay-name-bottom')).toHaveText('Empty A');
    await expect(page.locator('#replay-name-top')).toHaveText('Empty B');
});

test('a real audio context can close and recover BGM through a settings click', async ({ page }) => {
    await page.addInitScript(() => {
        window.__auditAudioContexts = [];
        window.AudioContext = new Proxy(window.AudioContext, {
            construct(Target, args) {
                const context = new Target(...args);
                window.__auditAudioContexts.push(context);
                return context;
            }
        });
    });
    await openApp(page);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.locator('#bgm-style').selectOption('zen');
    await page.evaluate(() => window.__auditAudioContexts[0].close());
    await page.locator('#settings-close').click();
    await expect.poll(() => page.evaluate(() => ({
        contexts: window.__auditAudioContexts.length,
        state: window.__auditAudioContexts.at(-1).state,
        style: AudioManager.currentBgm,
        playing: AudioManager.isPlaying
    }))).toEqual({ contexts: 2, state: 'running', style: 'zen', playing: true });
});

for (const sfx of [false, true]) {
    for (const runClosedLoop of [false, true]) {
        test(`selected BGM survives context closure (SFX ${sfx}, closed loop ${runClosedLoop})`, async ({ page }) => {
            await openApp(page);
            const source = fs.readFileSync(path.join(__dirname, '../../js/audio/audio-manager.js'), 'utf8');
            const result = await page.evaluate(({ source, sfx, runClosedLoop }) => {
                const states = [], timers = new Map();
                let nextTimer = 0, notes = 0;
                const doc = new EventTarget();
                doc.hidden = false;
                const manager = new Function('window', 'document', 'setTimeout', 'clearTimeout', source + ';return AudioManager;')({
                    AudioContext: function() {
                        const offline = new OfflineAudioContext(1, 44100, 44100);
                        const index = states.push('running') - 1;
                        return new Proxy(offline, { get(target, key) {
                            if (key === 'state') return states[index];
                            if (key === 'createOscillator') return () => { notes++; return target.createOscillator(); };
                            const value = target[key];
                            return typeof value === 'function' ? value.bind(target) : value;
                        } });
                    }
                }, doc, callback => { timers.set(++nextTimer, callback); return nextTimer; }, id => timers.delete(id));
                manager.setSfxEnabled(sfx);
                manager.setupUserInteraction();
                manager.startBgm('zen');
                const oldLoop = [...timers.values()][0];
                states[0] = 'closed';
                if (runClosedLoop) oldLoop();
                if (sfx) manager.SFX.buttonClick();
                const beforeInteraction = notes;
                doc.dispatchEvent(new Event('click'));
                const result = { contexts: states.length, style: manager.currentBgm,
                    playing: manager.isPlaying, newNotes: notes > beforeInteraction, sfx: manager.isSfxEnabled };
                manager.stopBgm();
                return result;
            }, { source, sfx, runClosedLoop });
            expect(result).toEqual({ contexts: 2, style: 'zen', playing: true, newNotes: true, sfx });
        });
    }
}
