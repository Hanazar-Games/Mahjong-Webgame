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

async function seedReplay(page) {
    await page.evaluate(() => {
        const makeTile = (suit, value, suffix) => ({
            id: `${suit}_${value}_${suffix}`,
            suit,
            value,
            name: `${value}${suit === 'wan' ? '万' : suit === 'tong' ? '筒' : '条'}`,
            shortName: `${value}${suit === 'wan' ? '万' : suit === 'tong' ? '筒' : '条'}`
        });
        const makePlayer = (id, round) => ({
            id,
            name: id === 0 ? '玩家' : `电脑${id}`,
            score: 1000,
            position: id,
            hand: Array.from({ length: id === 0 ? 14 : 13 }, (_, index) =>
                makeTile(['wan', 'tong', 'tiao'][id % 3], index % 9 + 1, `r${round}p${id}t${index}`)),
            melds: [],
            discards: []
        });
        const rounds = [1, 2].map(round => {
            const players = Array.from({ length: 4 }, (_, id) => makePlayer(id, round));
            const discard = players[0].hand[0];
            const draw = makeTile('tong', 9, `r${round}draw`);
            return {
                round,
                wind: round - 1,
                players,
                history: [
                    { action: 'gameStart', data: { round, players }, timestamp: round * 1000 },
                    { action: 'discard', data: { playerId: 0, tile: discard.id }, timestamp: round * 1000 + 100 },
                    { action: 'draw', data: { playerId: 1, tile: draw }, timestamp: round * 1000 + 200 },
                    { action: 'discard', data: { playerId: 1, tile: draw.id }, timestamp: round * 1000 + 300 },
                    { action: 'roundEnd', data: { round, players }, timestamp: round * 1000 + 400 }
                ]
            };
        });
        Replay.clearReplays();
        Replay.saveReplay({
            mahjongType: 'guobiao',
            maxRounds: 2,
            players: rounds[0].players.map(({ id, name, position }) => ({ id, name, position })),
            rounds,
            finalScores: rounds[0].players.map((player, index) => ({
                name: player.name,
                score: 1000,
                isWin: index === 0
            }))
        });
        renderReplays();
    });
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
        expect(await page.evaluate(() => App.currentScreen)).toBe('main-menu');
    }

    const hiddenScreenIssues = await page.evaluate(() => [...document.querySelectorAll('.screen:not(.active)')]
        .filter(screen => getComputedStyle(screen).visibility !== 'hidden')
        .map(screen => screen.id));
    expect(hiddenScreenIssues).toEqual([]);

    await page.getByRole('button', { name: '设置' }).click();
    await expect(page.locator('#settings-modal')).not.toHaveClass(/hidden/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#settings-modal')).toHaveClass(/hidden/);

    await page.evaluate(() => Utils.toast('<b>提示</b>', 500));
    await expect(page.locator('#toast-container .toast')).toHaveText('<b>提示</b>');
    await expect(page.locator('#toast-container .toast b')).toHaveCount(0);

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

test('mobile settings and replay sliders keep practical touch targets', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);
    await page.getByRole('button', { name: '设置' }).click();
    const settingsTargets = await page.evaluate(() => ({
        textHeight: document.getElementById('player-name').getBoundingClientRect().height,
        selectHeight: document.getElementById('bgm-style').getBoundingClientRect().height,
        bgmRangeHeight: document.getElementById('bgm-volume').getBoundingClientRect().height,
        sfxRangeHeight: document.getElementById('sfx-volume').getBoundingClientRect().height
    }));
    expect(settingsTargets.textHeight).toBeGreaterThanOrEqual(44);
    expect(settingsTargets.selectHeight).toBeGreaterThanOrEqual(44);
    expect(settingsTargets.bgmRangeHeight).toBeGreaterThanOrEqual(44);
    expect(settingsTargets.sfxRangeHeight).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: '关闭设置' }).click();

    await seedReplay(page);
    await page.getByRole('button', { name: '回放' }).click();
    await page.locator('#replay-container').getByRole('button', { name: '播放', exact: true }).click();
    const replayRangeHeight = await page.locator('#replay-progress').evaluate(element =>
        element.getBoundingClientRect().height);
    expect(replayRangeHeight).toBeGreaterThanOrEqual(32);
});

test('background audio pauses while the page is hidden and resumes when visible', async ({ page }) => {
    await openApp(page);
    const audioState = await page.evaluate(() => {
        AudioManager.setBgmVolume(0.3);
        AudioManager.startBgm('calm');
        const before = { playing: AudioManager.isPlaying, style: AudioManager.currentBgm };

        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        document.dispatchEvent(new Event('visibilitychange'));
        const hidden = { playing: AudioManager.isPlaying, style: AudioManager.currentBgm };

        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event('visibilitychange'));
        const visible = { playing: AudioManager.isPlaying, style: AudioManager.currentBgm };
        delete document.hidden;
        AudioManager.stopBgm();
        return { before, hidden, visible };
    });

    expect(audioState).toEqual({
        before: { playing: true, style: 'calm' },
        hidden: { playing: false, style: null },
        visible: { playing: true, style: 'calm' }
    });
});

test('muted SFX does not initialize or schedule silent audio work', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
        window.__audioContextAttempts = 0;
        const CountingAudioContext = class {
            constructor() {
                window.__audioContextAttempts++;
                throw new Error('count-only audio context');
            }
        };
        Object.defineProperty(window, 'AudioContext', { configurable: true, value: CountingAudioContext });
        Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: CountingAudioContext });
        AudioManager.setSfxVolume(0);
        AudioManager.SFX.ziMo();
    });
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => window.__audioContextAttempts)).toBe(0);

    await page.evaluate(() => {
        AudioManager.setSfxVolume(0.5);
        AudioManager.SFX.buttonClick();
    });
    expect(await page.evaluate(() => window.__audioContextAttempts)).toBe(1);
});

test('generic result modal is keyboard accessible and restores focus', async ({ page }) => {
    await openApp(page);
    const trigger = page.locator('#btn-open-settings');
    await trigger.focus();
    await page.evaluate(() => UIComponents.createModal('测试弹窗', '<p>内容</p>', [{ text: '确定' }]));

    const dialog = page.getByRole('dialog', { name: '测试弹窗' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: '确定' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
});

test('tile option selector supports keyboard cancellation and focus restoration', async ({ page }) => {
    await openApp(page);
    const trigger = page.locator('#btn-open-settings');
    await trigger.focus();
    await page.evaluate(() => {
        window.__selectorResult = 'pending';
        const tile = Tiles.createTile('wan', 1, 'selector-test');
        showTileOptionsSelector([[tile]], '请选择吃的组合', option => option)
            .then(result => { window.__selectorResult = result; });
    });

    const dialog = page.getByRole('dialog', { name: '请选择吃的组合' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: '请选择吃的组合，选项 1' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__selectorResult)).toBe(null);
    await expect(trigger).toBeFocused();
});

test('failed stats persistence does not break game result handling', async ({ page }) => {
    await openApp(page);
    const completed = await page.evaluate(() => {
        const originalRecordGame = Stats.recordGame;
        const originalConsoleError = console.error;
        Stats.recordGame = () => { throw new Error('expected persistence failure'); };
        console.error = () => {};
        try {
            saveGameResult({
                players: [{ id: 0, position: 0, name: '玩家', score: 1000 }],
                winner: null
            });
            return true;
        } finally {
            Stats.recordGame = originalRecordGame;
            console.error = originalConsoleError;
        }
    });
    expect(completed).toBe(true);
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

test('player hand supports keyboard selection and discard', async ({ page }) => {
    await openApp(page);
    await startQuickGame(page);
    const tiles = page.locator('#hand-bottom .mahjong-tile[role="button"]');
    await expect(tiles).toHaveCount(14);
    const firstTile = tiles.first();
    await expect(firstTile).toHaveAttribute('tabindex', '0');
    await expect(firstTile).toHaveAttribute('aria-disabled', 'false');
    await firstTile.focus();
    await page.keyboard.press('Enter');
    await expect(firstTile).toHaveClass(/selected/);
    await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('#hand-bottom .mahjong-tile').count()).toBe(13);
    await expect(page.locator('#hand-bottom .mahjong-tile[tabindex="0"]')).toHaveCount(0);
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

for (const viewport of VIEWPORTS.filter(item =>
    ['desktop', 'phone-portrait', 'phone-landscape', 'small-phone-landscape'].includes(item.name))) {
    test(`replay player stays accessible and contained at ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const failures = collectRuntimeFailures(page);
        await openApp(page);
        await seedReplay(page);
        await page.getByRole('button', { name: '回放' }).click();
        await page.locator('#replay-container').getByRole('button', { name: '播放', exact: true }).click();

        if (viewport.name === 'desktop') {
            await page.locator('#replay-speed').click();
            await page.locator('#replay-speed').click();
            await expect(page.locator('#replay-speed')).toHaveText('4×');
            await page.locator('#replay-back-btn').click();
            await page.locator('#replay-container').getByRole('button', { name: '播放', exact: true }).click();
            await expect(page.locator('#replay-speed')).toHaveText('1×');
        }

        await expect(page.locator('#replay-player')).toHaveClass(/active/);
        await page.waitForTimeout(350);
        expect(await page.evaluate(() => App.currentScreen)).toBe('replay-player');
        await expect(page.locator('.replay-timeline-item')).toHaveCount(5);
        await expect(page.locator('.replay-timeline-item').first()).toHaveAttribute('aria-current', 'step');
        await expect(page.locator('#replay-step-back')).toBeDisabled();
        await expect(page.locator('#replay-round-prev')).toBeDisabled();
        await expect(page.locator('#replay-play-pause')).toHaveAttribute('aria-label', '播放回放');

        const secondStep = page.locator('.replay-timeline-item').nth(1);
        await secondStep.focus();
        await page.keyboard.press('Enter');
        await expect(secondStep).toHaveAttribute('aria-current', 'step');
        await expect(page.locator('#replay-step-back')).toBeEnabled();

        if (viewport.name === 'desktop') {
            await page.evaluate(() => {
                _replayPlayer.players[0].name = '<b>玩家</b>';
                _replayPlayer.goToStep(1);
            });
            await expect(page.locator('#replay-action-sub')).toHaveText('玩家: <b>玩家</b>');
            await page.evaluate(() => {
                _replayPlayer.players[0].name = '玩家';
                _replayPlayer.goToStep(1);
            });
            await page.locator('#replay-round-next').click();
            await expect(page.locator('#replay-round-next')).toBeDisabled();
            await expect(page.locator('#replay-round-prev')).toBeEnabled();
            await page.locator('#replay-speed').click();
            await page.locator('#replay-speed').click();
            const timelineItems = page.locator('.replay-timeline-item');
            await expect(timelineItems).toHaveCount(5);
            await timelineItems.nth(3).click();
            await page.locator('#replay-play-pause').click();
            await expect(timelineItems.last()).toHaveAttribute('aria-current', 'step');
            expect(await page.locator('#replay-play-pause').getAttribute('aria-label')).toBe('播放回放');
            await expect(page.locator('#replay-step-forward')).toBeDisabled();
            await expect(page.locator('#replay-play-pause')).toBeDisabled();
        }

        const layout = await page.evaluate(() => {
            const rect = selector => {
                const element = document.querySelector(selector);
                if (!element) return null;
                const box = element.getBoundingClientRect();
                return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
            };
            const inside = (child, parent, tolerance = 1) => child && parent &&
                child.left >= parent.left - tolerance && child.right <= parent.right + tolerance &&
                child.top >= parent.top - tolerance && child.bottom <= parent.bottom + tolerance;
            const screen = rect('#replay-player');
            const body = rect('#replay-player .replay-player-body');
            const table = rect('#replay-table');
            const controls = rect('#replay-player .replay-controls');
            const discardPile = rect('#replay-player .replay-discard-pile');
            const overlaps = (first, second) => first && second &&
                Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left)) *
                Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top)) > 1;
            const overflowingTiles = [...document.querySelectorAll('#replay-table .mahjong-tile')]
                .filter(tile => {
                    const box = tile.getBoundingClientRect();
                    return !inside({ left: box.left, right: box.right, top: box.top, bottom: box.bottom }, table);
                }).length;
            const playerTilesInDiscardPile = [...document.querySelectorAll('#replay-table .replay-player-area .mahjong-tile')]
                .filter(tile => {
                    const box = tile.getBoundingClientRect();
                    return overlaps({ left: box.left, right: box.right, top: box.top, bottom: box.bottom }, discardPile);
                }).length;
            return {
                tableInsideBody: inside(table, body),
                controlsInsideScreen: inside(controls, screen),
                overflowingTiles,
                playerTilesInDiscardPile,
                horizontalScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                verticalScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight
            };
        });

        expect(layout.tableInsideBody).toBe(true);
        expect(layout.controlsInsideScreen).toBe(true);
        expect(layout.overflowingTiles).toBe(0);
        expect(layout.playerTilesInDiscardPile).toBe(0);
        expect(layout.horizontalScroll).toBe(0);
        expect(layout.verticalScroll).toBe(0);
        expect(failures).toEqual([]);

        if (['desktop', 'phone-portrait', 'phone-landscape'].includes(viewport.name)) {
            await page.screenshot({ path: `test-results/replay-audit-${viewport.name}.png`, fullPage: true });
        }
    });
}

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
