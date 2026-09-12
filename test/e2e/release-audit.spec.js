const { test, expect } = require('@playwright/test');

async function openGame(page, config = {}) {
    await page.goto('/');
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
    await page.evaluate(config => startGame({ playerCount: 4, speed: 'instant', maxRounds: 1, ...config }), config);
}

test('a paused game redraw keeps the hand disabled for keyboard and assistive input', async ({ page }) => {
    await openGame(page);
    await page.locator('#btn-menu').click();
    await page.locator('#btn-ingame-settings').click();
    await page.locator('label[for="show-tile-names"]').click();
    expect(await page.evaluate(() => App.engine.paused)).toBe(true);
    await expect(page.locator('#hand-bottom [aria-disabled="false"]')).toHaveCount(0);
    await expect(page.locator('#hand-bottom [tabindex="0"]')).toHaveCount(0);
});

for (const [width, height] of [[375, 667], [390, 844], [667, 375]]) {
    test(`Taiwan five declared gangs remain inside the player area at ${width}x${height}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height });
        await openGame(page, { mahjongType: 'taiwan' });
        await page.evaluate(() => {
            const player = App.engine.players[0];
            player.melds = Array.from({ length: 5 }, (_, index) => ({ type: 'gang',
                tiles: Array.from({ length: 4 }, () => Tiles.createTile('wan', index + 1)) }));
            player.hand = [Tiles.createTile('tong', 1), Tiles.createTile('tong', 2)];
            renderGameState();
            ['chi', 'peng', 'gang', 'hu'].forEach(type => enableActionButtons({ type }));
        });
        await page.waitForTimeout(500);
        const layout = await page.evaluate(() => {
            const area = document.getElementById('player-bottom').getBoundingClientRect();
            const action = document.getElementById('action-bar').getBoundingClientRect();
            const tiles = [...document.querySelectorAll('#player-bottom .mahjong-tile')].map(el => el.getBoundingClientRect());
            return { clipped: tiles.some(tile => tile.left < area.left - 1 || tile.right > area.right + 1 ||
                tile.top < area.top - 1 || tile.bottom > area.bottom + 1),
                readable: tiles.every(tile => tile.width >= 16 && tile.height >= 26),
                covered: tiles.some(tile => tile.left < action.right && tile.right > action.left &&
                    tile.top < action.bottom && tile.bottom > action.top) };
        });
        expect(layout).toEqual({ clipped: false, readable: true, covered: false });
        await page.screenshot({ path: testInfo.outputPath('taiwan-five-gangs.png') });
    });
}

test('an ordinary HTML server cannot masquerade as a reachable signaling service', async ({ page }) => {
    await page.goto('/');
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: /局域网联机/ }).click();
    await page.route('https://signal.test/rooms', route => route.fulfill({ contentType: 'text/html', body: '<html>Static site</html>' }));
    await page.locator('#signal-server').fill('https://signal.test');
    await page.locator('#btn-connect-server').click();
    await expect(page.locator('#network-error')).toContainText('有效房间列表');
    expect(await page.evaluate(() => canUseSignalServer())).toBe(false);
});

for (const kind of ['confirmation', 'settings', 'tile options']) {
    test(`delayed ${kind} autofocus preserves focus already moved inside the dialog`, async ({ page }) => {
        await page.goto('/');
        await page.locator('#loading-screen').waitFor({ state: 'detached' });
        const preserved = await page.evaluate(kind => {
            const raf = window.requestAnimationFrame;
            let autofocus, target;
            window.requestAnimationFrame = callback => { autofocus = callback; return 0; };
            try {
                if (kind === 'settings') {
                    showSettingsModal();
                    target = document.getElementById('player-name');
                } else if (kind === 'tile options') {
                    showTileOptionsSelector([[Tiles.createTile('wan', 1)]], '选择牌组', tiles => tiles);
                    target = document.querySelector('#tile-selector-overlay .modal-btn');
                } else {
                    const modal = UIComponents.createModal('焦点检查', '', [{ text: '确定' }]);
                    target = modal.querySelector('.modal-close');
                }
            } finally { window.requestAnimationFrame = raf; }
            target.focus();
            autofocus();
            return document.activeElement === target;
        }, kind);
        expect(preserved).toBe(true);
    });
}
