const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

async function openApp(page) {
    await page.goto('/');
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
}

for (const [width, height] of [[1440, 900], [1280, 720], [390, 844], [375, 667], [844, 390], [667, 375]]) {
test(`gang selector fits ${width}x${height} and offers touch cancellation`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await openApp(page);
    await page.evaluate(() => {
        window.__choice = 'pending';
        showAnGangOptionsSelector([1, 2, 3, 4].map(value => ({ type: 'an_gang',
            tiles: Array.from({ length: 4 }, () => Tiles.createTile('wan', value)) })))
            .then(choice => { window.__choice = choice; });
    });
    const dialog = page.getByRole('dialog', { name: '请选择杠的组合' });
    const box = await dialog.locator(':scope > div').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await dialog.getByRole('button', { name: /选项 4/ }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('gang-selector.png') });
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => window.__choice)).toBe(null);
});
}

test('replacing and force-closing selectors resolves every choice and restores focus', async ({ page }) => {
    await openApp(page);
    const trigger = page.getByRole('button', { name: /快速开始/ });
    await trigger.focus();
    await page.evaluate(() => {
        const tile = Tiles.createTile('wan', 1);
        window.__firstChoice = window.__secondChoice = 'pending';
        showChiOptionsSelector([[tile]]).then(choice => { window.__firstChoice = choice; });
        showChiOptionsSelector([[tile]]).then(choice => { window.__secondChoice = choice; });
    });
    await expect(page.locator('#tile-selector-overlay')).toHaveCount(1);
    expect(await page.evaluate(() => window.__firstChoice)).toBe(null);
    await page.evaluate(() => closeAllSelectors());
    await expect(page.locator('#tile-selector-overlay')).toHaveCount(0);
    expect(await page.evaluate(() => window.__secondChoice)).toBe(null);
    await expect(trigger).toBeFocused();
});

test('Escape and focus trapping target a winning-hand dialog above settings', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.locator('#settings-close').focus();
    await page.evaluate(() => showHuResult({ isZiMo: true, player: { name: 'Guest' }, score: 8 }));
    const confirmation = page.getByRole('dialog', { name: /自摸/ });
    await expect(confirmation).toBeVisible();
    const buttons = confirmation.getByRole('button');
    await buttons.last().focus();
    await page.keyboard.press('Tab');
    await expect(buttons.first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirmation).toHaveCount(0);
    await expect(page.locator('#settings-modal')).toBeVisible();
    await expect(page.locator('#settings-close')).toBeFocused();
});

test('a stale discard failure cannot change a replacement game', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => startGame({ speed: 'instant', maxRounds: 1 }));
    const guidance = await page.evaluate(async () => {
        let rejectDiscard;
        App.engine.playerDiscard = () => new Promise((resolve, reject) => { rejectDiscard = reject; });
        const pending = _doDiscard(App.engine.players[0].hand[0].id);
        await startGame({ speed: 'instant', maxRounds: 1 });
        updateTurnGuidance('New game turn');
        rejectDiscard(new Error('Old game ended'));
        await pending;
        return document.getElementById('turn-guidance').textContent;
    });
    expect(guidance).toBe('New game turn');
});

test('restarting during a gang choice releases the old action lock', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async () => {
        await startGame({ speed: 'instant', maxRounds: 1 });
        App.anGangOptions = [1, 2].map(value => ({ type: 'an_gang',
            tiles: Array.from({ length: 4 }, () => Tiles.createTile('wan', value)) }));
        window.__oldAction = handleAction('gang');
    });
    await expect(page.locator('#tile-selector-overlay')).toBeVisible();
    await page.evaluate(async () => {
        await startGame({ speed: 'instant', maxRounds: 1 });
        await window.__oldAction;
    });
    expect(await page.evaluate(() => App._actionPending)).toBe(false);
    await expect(page.locator('#tile-selector-overlay')).toHaveCount(0);
    await page.locator('#hand-bottom .mahjong-tile').first().click();
    await expect(page.locator('#hand-bottom .mahjong-tile.selected')).toHaveCount(1);
});

test('rejected discards leave the local hand usable and pause blocks tile selection', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => startGame({ speed: 'instant', maxRounds: 1 }));
    const accepted = await page.evaluate(() => {
        App.engine.playerDiscard = async () => false;
        return _doDiscard(App.engine.players[0].hand[0].id);
    });
    expect(accepted).toBe(false);
    await expect(page.locator('#hand-bottom .mahjong-tile').first()).toHaveAttribute('aria-disabled', 'false');
    await page.evaluate(() => { App.engine.pause(); handleTileClick(App.engine.players[0].hand[0]); });
    await expect(page.locator('#hand-bottom .mahjong-tile.selected')).toHaveCount(0);
});

test('skipping self-draw with four open melds returns to discard guidance', async ({ page }) => {
    await openApp(page);
    await page.evaluate(async () => {
        await startGame({ speed: 'instant', maxRounds: 1 });
        const engine = App.engine, local = engine.players[0];
        engine.stopTimer();
        local.melds = [1, 2, 3, 4].map(value => ({ type: 'triplet',
            tiles: Array.from({ length: 3 }, () => Tiles.createTile('wan', value)) }));
        local.hand = [Tiles.createTile('tong', 5)];
        engine.deck = [Tiles.createTile('tong', 5)];
        App.anGangOptions = null;
        await engine.playerDraw();
    });
    await expect(page.locator('#btn-hu')).toBeEnabled();
    await page.locator('#btn-skip').click();
    await expect(page.locator('#turn-guidance')).toContainText('选择一张手牌');
    await expect(page.locator('#btn-hu')).toBeDisabled();
    await expect(page.locator('#hand-bottom .mahjong-tile').first()).toHaveAttribute('aria-disabled', 'false');
});

test('background audio suppresses new SFX and resumes the selected BGM once visible', async ({ page }) => {
    await openApp(page);
    const source = fs.readFileSync(path.join(__dirname, '../../js/audio/audio-manager.js'), 'utf8');
    const result = await page.evaluate(source => {
        const context = new OfflineAudioContext(1, 44100, 44100);
        let sources = 0;
        const createOscillator = context.createOscillator.bind(context);
        context.createOscillator = () => { sources++; return createOscillator(); };
        const listeners = {};
        const doc = { hidden: false, addEventListener(name, fn) { listeners[name] = fn; }, removeEventListener() {} };
        const manager = new Function('window', 'document', 'setTimeout', 'clearTimeout', source + ';return AudioManager;')(
            { AudioContext: function() { return context; } }, doc, () => 1, () => {});
        manager.setupUserInteraction();
        manager.startBgm('calm');
        doc.hidden = true;
        listeners.visibilitychange();
        const before = sources;
        manager.SFX.opponentDiscard({ suit: 'wan' });
        manager.SFX.gameStart();
        const after = sources;
        const hiddenPlaying = manager.isPlaying;
        doc.hidden = false;
        listeners.visibilitychange();
        const resumed = manager.isPlaying && manager.currentBgm === 'calm';
        manager.stopBgm();
        return { before, after, hiddenPlaying, resumed };
    }, source);
    expect(result.after).toBe(result.before);
    expect(result.hiddenPlaying).toBe(false);
    expect(result.resumed).toBe(true);
});
