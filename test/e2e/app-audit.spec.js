const { test, expect } = require('@playwright/test');

const VIEWPORTS = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'laptop', width: 1280, height: 720 },
    { name: 'phone-portrait', width: 390, height: 844 },
    { name: 'small-phone-portrait', width: 375, height: 667 },
    { name: 'phone-landscape', width: 844, height: 390 },
    { name: 'small-phone-landscape', width: 667, height: 375 }
];

async function openApp(page) {
    await page.goto('/');
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
}

async function startQuickGame(page) {
    await page.getByRole('button', { name: /快速开始/ }).click();
    await expect(page.locator('#game-screen')).toHaveClass(/active/);
    await expect(page.locator('#hand-bottom .mahjong-tile')).toHaveCount(14, { timeout: 10_000 });
    await page.waitForTimeout(750);
}

function collectRuntimeFailures(page) {
    const failures = [];
    page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error') failures.push(`console: ${message.text()}`);
    });
    page.on('requestfailed', request => {
        failures.push(`request: ${request.url()} (${request.failure()?.errorText || 'failed'})`);
    });
    return failures;
}

test('main flows load without runtime or resource errors', async ({ page }) => {
    const failures = collectRuntimeFailures(page);
    await openApp(page);

    const markupIssues = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
        const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
        const brokenLabels = [...document.querySelectorAll('label[for]')]
            .map(label => label.htmlFor)
            .filter(id => !document.getElementById(id));
        return { duplicateIds, brokenLabels };
    });
    expect(markupIssues).toEqual({ duplicateIds: [], brokenLabels: [] });

    for (const screenName of ['回放', '成就', '战绩']) {
        await page.getByRole('button', { name: screenName }).click();
        await page.locator('.screen.active').getByRole('button', { name: '← 返回', exact: true }).click();
    }

    await page.getByRole('button', { name: '设置' }).click();
    await expect(page.locator('#settings-modal')).not.toHaveClass(/hidden/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#settings-modal')).toHaveClass(/hidden/);

    expect(failures).toEqual([]);
});

test('audio and appearance settings update and persist', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: '设置' }).click();

    await page.locator('#bgm-volume').fill('0');
    await page.locator('#bgm-style').selectOption('calm');
    await expect(page.locator('#bgm-volume')).toHaveValue('30');
    await expect(page.locator('#bgm-volume-value')).toHaveText('30%');

    await page.locator('#table-theme').selectOption('amethyst');
    await page.getByRole('button', { name: '关闭设置' }).click();
    await page.reload();
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '设置' }).click();

    await expect(page.locator('#bgm-volume')).toHaveValue('30');
    await expect(page.locator('#bgm-style')).toHaveValue('calm');
    await expect(page.locator('#table-theme')).toHaveValue('amethyst');
});

test('in-game settings preserve the paused menu and Escape closes only the top modal', async ({ page }) => {
    await openApp(page);
    await startQuickGame(page);

    await page.getByRole('button', { name: '打开游戏菜单' }).click();
    await expect(page.locator('#ingame-menu')).not.toHaveClass(/hidden/);
    await page.getByRole('button', { name: /游戏设置/ }).click();

    await expect(page.locator('#settings-modal')).not.toHaveClass(/hidden/);
    await expect(page.locator('#ingame-menu')).toHaveClass(/hidden/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#settings-modal')).toHaveClass(/hidden/);
    await expect(page.locator('#ingame-menu')).not.toHaveClass(/hidden/);

    await page.getByRole('button', { name: /继续游戏/ }).click();
    await expect(page.locator('#ingame-menu')).toHaveClass(/hidden/);
});

test('opponent display mode applies immediately during a game', async ({ page }) => {
    await openApp(page);
    await startQuickGame(page);
    await page.getByRole('button', { name: '打开游戏菜单' }).click();
    await page.getByRole('button', { name: /游戏设置/ }).click();

    await page.locator('#opponent-display').selectOption('hidden');
    await expect(page.locator('#hand-top > span')).toHaveText(/\d+张/);
    await expect(page.locator('#hand-left > span')).toHaveText(/\d+张/);

    await page.locator('#opponent-display').selectOption('small');
    await expect.poll(() => page.locator('#hand-top .mahjong-tile.back').count()).toBeGreaterThanOrEqual(13);
});

test('network and keyboard-accessible custom game entry points work', async ({ page }) => {
    const failures = collectRuntimeFailures(page);
    await openApp(page);

    await page.getByRole('button', { name: /局域网联机/ }).click();
    await expect(page.getByLabel('信令服务器')).toBeVisible();
    await expect(page.getByLabel('房间名称')).toBeVisible();
    await expect(page.getByLabel('麻将种类')).toBeVisible();
    await expect(page.getByRole('button', { name: '连接服务器' })).toBeVisible();
    await page.evaluate(() => renderRoomList([{
        id: '\"><img src=x onerror=alert(1)>',
        name: '<img src=x onerror=alert(1)>',
        type: '<svg onload=alert(1)>',
        players: '<img src=x>',
        maxPlayers: 'invalid'
    }]));
    await expect(page.locator('#room-list img, #room-list svg')).toHaveCount(0);
    await expect(page.locator('#room-list .room-item-meta')).toContainText('0/4人');
    await page.locator('#network-lobby').getByRole('button', { name: '← 返回', exact: true }).click();

    await page.getByRole('button', { name: /自定义模式/ }).click();
    const threePlayerType = page.getByRole('button', { name: /四川三人麻将/ });
    await threePlayerType.focus();
    await page.keyboard.press('Enter');
    await expect(threePlayerType).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '开始游戏', exact: true }).click();
    await expect(page.locator('#game-table')).toHaveClass(/three-player/);
    await expect(page.locator('#player-top')).toBeHidden();
    await expect(page.locator('#hand-bottom .mahjong-tile')).toHaveCount(14, { timeout: 10_000 });
    expect(failures).toEqual([]);
});

for (const viewport of VIEWPORTS) {
    test(`game table stays usable at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const failures = collectRuntimeFailures(page);
        await openApp(page);
        await startQuickGame(page);

        const layout = await page.evaluate(() => {
            const rect = selector => {
                const el = document.querySelector(selector);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
            };
            const inside = (child, parent, tolerance = 1) => child && parent &&
                child.left >= parent.left - tolerance && child.right <= parent.right + tolerance &&
                child.top >= parent.top - tolerance && child.bottom <= parent.bottom + tolerance;
            const overlap = (a, b) => a && b && Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
                Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

            const screen = rect('#game-screen');
            const table = rect('#game-table');
            const center = rect('#game-screen .table-center');
            const action = rect('#action-bar');
            const bottomHand = rect('#hand-bottom');
            const positions = ['top', 'left', 'right', 'bottom'];
            const playerRects = positions.map(position => rect(`#player-${position}`));
            const tiles = [...document.querySelectorAll('#game-screen .player-area .mahjong-tile')].map(el => {
                const r = el.getBoundingClientRect();
                return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
            });
            const verticalTileOverflowByPosition = Object.fromEntries(positions.map(position => {
                const player = rect(`#player-${position}`);
                const overflowing = [...document.querySelectorAll(`#player-${position} .mahjong-tile`)].filter(el => {
                    const r = el.getBoundingClientRect();
                    return r.top < player.top - 1 || r.bottom > player.bottom + 1;
                });
                return [position, overflowing.length];
            }));
            const sideTileOverflow = ['left', 'right'].reduce((total, position) => {
                const player = rect(`#player-${position}`);
                return total + [...document.querySelectorAll(`#player-${position} .mahjong-tile`)].filter(el => {
                    const r = el.getBoundingClientRect();
                    return !inside({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }, player);
                }).length;
            }, 0);

            return {
                screen,
                table,
                center,
                action,
                bottomHand,
                playerRects,
                tiles,
                tableInsideScreen: inside(table, screen),
                playersInsideTable: playerRects.every(player => inside(player, table)),
                verticalTileOverflowByPosition,
                sideTileOverflow,
                actionInsideScreen: inside(action, screen),
                actionBottomHandOverlap: overlap(action, bottomHand),
                horizontalScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                verticalScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight
            };
        });

        expect(layout.tableInsideScreen).toBe(true);
        expect(layout.playersInsideTable).toBe(true);
        expect(layout.verticalTileOverflowByPosition).toEqual({ top: 0, left: 0, right: 0, bottom: 0 });
        expect(layout.sideTileOverflow).toBe(0);
        expect(layout.actionInsideScreen).toBe(true);
        expect(layout.actionBottomHandOverlap).toBe(0);
        expect(layout.horizontalScroll).toBe(0);
        expect(layout.verticalScroll).toBe(0);
        expect(layout.tiles.every(tile => tile.width >= 20 && tile.height >= 26)).toBe(true);
        expect(failures).toEqual([]);

        if (['desktop', 'phone-portrait', 'phone-landscape'].includes(viewport.name)) {
            await page.screenshot({ path: `test-results/ui-audit-${viewport.name}.png`, fullPage: true });
        }
    });
}
