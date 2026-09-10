const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

async function openGame(page, playerCount = 4) {
    await page.goto('/');
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
    await page.evaluate(playerCount => startGame({ playerCount, speed: 'instant', maxRounds: 1 }), playerCount);
}

test('discard reconciliation updates replaced tiles even when the pile length is unchanged', async ({ page }) => {
    await openGame(page);
    const expected = await page.evaluate(() => {
        const first = Tiles.createTile('wan', 1), claimed = Tiles.createTile('tong', 2), latest = Tiles.createTile('tiao', 3);
        App.engine.discardPile = [first, claimed];
        renderDiscardPile(false);
        App.engine.discardPile = [first, latest];
        renderDiscardPile(false);
        return [first.id, latest.id];
    });
    expect(await page.locator('#discard-pile .mahjong-tile').evaluateAll(tiles => tiles.map(tile => tile.dataset.id))).toEqual(expected);
});

test('an unchanged state refresh preserves the discard scroll position', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await openGame(page);
    await page.evaluate(() => {
        App.engine.discardPile = Array.from({ length: 80 }, (_, index) => Tiles.createTile('wan', index % 9 + 1));
        renderDiscardPile();
    });
    await page.waitForTimeout(900);
    await page.locator('#discard-pile').evaluate(pile => { pile.scrollTop = 0; });
    await page.evaluate(() => renderGameState());
    await page.waitForTimeout(100);
    expect(await page.locator('#discard-pile').evaluate(pile => pile.scrollTop)).toBe(0);
});

for (const [width, height] of [[1440, 900], [1280, 720], [390, 844], [375, 667], [844, 390], [667, 375]]) {
test(`switching between four and two seats at ${width}x${height} clears unused seats`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await openGame(page);
    await page.evaluate(() => startGame({ playerCount: 2, speed: 'instant', maxRounds: 1 }));
    await expect(page.locator('#player-left')).toBeHidden();
    await expect(page.locator('#player-right')).toBeHidden();
    await expect(page.locator('#player-top')).toBeVisible();
    await expect(page.locator('#hand-top .mahjong-tile')).toHaveCount(13);
    await page.waitForTimeout(900);
    await page.screenshot({ path: testInfo.outputPath('two-player-table.png') });
    await page.evaluate(() => startGame({ playerCount: 4, speed: 'instant', maxRounds: 1 }));
    await expect(page.locator('#player-left')).toBeVisible();
    await expect(page.locator('#player-right')).toBeVisible();
});
}

test('saved two-player replay uses the same opposing seats as the live table', async ({ page }) => {
    await openGame(page, 2);
    await page.evaluate(async () => {
        await App.engine.endRound();
        openReplayPlayer(Replay.getReplays()[0]);
    });
    await expect(page.locator('#replay-p-left')).toBeHidden();
    await expect(page.locator('#replay-p-right')).toBeHidden();
    await expect(page.locator('#replay-hand-top .mahjong-tile')).toHaveCount(13);
});

test('guest state refreshes shanten and preserves human player identities', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => {
        const engine = App.engine;
        engine.players.forEach((player, index) => { player.networkId = 'player-' + index; player.isAI = false; });
        engine.players[1].hand = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(value => Tiles.createTile('wan', value));
        engine.players[1].hand.push(Tiles.createTile('tong', 2), Tiles.createTile('tong', 4),
            Tiles.createTile('jian', 1), Tiles.createTile('jian', 1));
        const data = { config: engine.config, state: buildNetworkStateFor('player-1') };
        engine.destroy();
        App.engine = null;
        App.network = { isHost: false, playerId: 'player-1' };
        App.isNetworkGame = true;
        App.settings.showShanten = true;
        document.getElementById('shanten-value').textContent = 'stale';
        applyRemoteState(data);
    });
    await expect(page.locator('#shanten-value')).toHaveText(/^听 \d+张$/);
    await expect(page.locator('.player-area:not(.hidden) .player-avatar use').first()).toHaveAttribute('href', 'assets/ui/icons.svg#user');
    expect(await page.evaluate(() => App.engine.players.every(player => !player.isAI))).toBe(true);
});

test('BGM can recover from a later audio suspension while SFX remain disabled', async ({ page }) => {
    await page.goto('/');
    const source = fs.readFileSync(path.join(__dirname, '../../js/audio/audio-manager.js'), 'utf8');
    const result = await page.evaluate(async source => {
        const offline = new OfflineAudioContext(1, 44100, 44100);
        let state = 'running', resumes = 0;
        const context = new Proxy(offline, { get(target, key) {
            if (key === 'state') return state;
            if (key === 'resume') return async () => { resumes++; state = 'running'; };
            const value = target[key];
            return typeof value === 'function' ? value.bind(target) : value;
        } });
        const doc = new EventTarget();
        doc.hidden = false;
        const manager = new Function('window', 'document', 'setTimeout', 'clearTimeout', source + ';return AudioManager;')(
            { AudioContext: function() { return context; } }, doc, () => 1, () => {});
        manager.setSfxEnabled(false);
        manager.setupUserInteraction();
        manager.startBgm('calm');
        doc.dispatchEvent(new Event('click'));
        state = 'suspended';
        doc.dispatchEvent(new Event('click'));
        await Promise.resolve();
        const result = { state, resumes, style: manager.currentBgm, sfx: manager.isSfxEnabled };
        manager.stopBgm();
        return result;
    }, source);
    expect(result).toEqual({ state: 'running', resumes: 1, style: 'calm', sfx: false });
});
