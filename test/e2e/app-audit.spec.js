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

test('startup overlay is accessible and clears without a forced wait', async ({ page }) => {
    await page.goto('/');

    const loading = page.locator('#loading-screen');
    await expect(loading).toHaveAttribute('role', 'status');
    await expect(loading).toHaveAttribute('aria-live', 'polite');
    await expect(loading).toHaveClass(/hidden/, { timeout: 1_000 });
    await loading.waitFor({ state: 'detached' });
});

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
        await page.locator('.screen.active').getByRole('button', { name: '返回', exact: true }).click();
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

test('main menu uses a consistent SVG icon system and compact mobile rhythm', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);

    await expect(page.locator('#main-menu .btn-icon .ui-icon')).toHaveCount(6);
    await expect(page.locator('#main-menu .menu-tool-btn .ui-icon')).toHaveCount(2);
    await expect(page.locator('.menu-logo img')).toHaveAttribute('src', 'assets/tiles/red-dragon.svg');

    const rhythm = await page.evaluate(() => {
        const badge = document.querySelector('.menu-player-badge').getBoundingClientRect();
        const primary = document.querySelector('.menu-primary-actions').getBoundingClientRect();
        return { actionGap: primary.top - badge.bottom };
    });
    expect(rhythm.actionGap).toBeLessThan(80);
});

test('supporting menu text stays readable across themes', async ({ page }) => {
    await openApp(page);

    const ratios = await page.evaluate(() => {
        const luminance = color => {
            const channels = color.match(/[\d.]+/g).slice(0, 3).map(value => Number(value) / 255);
            const linear = channels.map(value => value <= 0.03928
                ? value / 12.92
                : ((value + 0.055) / 1.055) ** 2.4);
            return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
        };
        const contrast = (foreground, background) => {
            const lighter = Math.max(luminance(foreground), luminance(background));
            const darker = Math.min(luminance(foreground), luminance(background));
            return (lighter + 0.05) / (darker + 0.05);
        };
        const themes = ['classic-green', 'dark-blue', 'wood', 'red', 'amethyst', 'ink', 'sunset'];
        const selectors = ['.menu-tagline', '.menu-exp-text', '.menu-btn.primary .btn-desc', '.menu-tool-btn'];
        return themes.flatMap(theme => {
            applyTheme(theme);
            const background = getComputedStyle(document.body).backgroundColor;
            return selectors.map(selector => contrast(getComputedStyle(document.querySelector(selector)).color, background));
        });
    });

    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5);
});

test('secondary flows keep the shared SVG icon system', async ({ page }) => {
    await openApp(page);

    await expect(page.locator('.back-btn .ui-icon')).toHaveCount(6);
    await expect(page.locator('#btn-start-network .ui-icon')).toHaveCount(1);
    await expect(page.locator('#btn-leave-room .ui-icon')).toHaveCount(1);
    await expect(page.locator('#result-icon .ui-icon')).toHaveCount(1);

    await page.evaluate(() => UIComponents.createModal('图标检查', '<p>内容</p>', [{ text: '确定' }]));
    const dialog = page.getByRole('dialog', { name: '图标检查' });
    await expect(dialog.locator('.modal-close use')).toHaveAttribute('href', 'assets/ui/icons.svg#close');
    await dialog.getByRole('button', { name: '关闭弹窗' }).click();

    await page.getByRole('button', { name: '战绩' }).click();
    await expect(page.locator('#stats-page-content .stats-card > h3 .ui-icon')).toHaveCount(3);
});

test('tall portrait menu keeps utility controls visually connected', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);

    const spacing = await page.evaluate(() => {
        const secondary = document.querySelector('.menu-secondary-actions').getBoundingClientRect();
        const footer = document.querySelector('.menu-footer').getBoundingClientRect();
        return { utilityGap: footer.top - secondary.bottom };
    });
    expect(spacing.utilityGap).toBeLessThan(190);
});

test('landscape main menu keeps every entry point inside the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await openApp(page);

    const layout = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('#main-menu button')];
        const outside = buttons
            .filter(button => {
                const rect = button.getBoundingClientRect();
                return rect.top < 0 || rect.left < 0 || rect.right > innerWidth || rect.bottom > innerHeight;
            })
            .map(button => button.textContent.trim());
        return { outside, visibleButtons: buttons.length };
    });

    expect(layout.visibleButtons).toBe(8);
    expect(layout.outside).toEqual([]);
});

test('reset statistics uses an in-app confirmation dialog', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
        window.__nativeConfirmCalls = 0;
        window.__resetStatsCalls = 0;
        window.confirm = () => { window.__nativeConfirmCalls++; return true; };
        Stats.resetStats = () => { window.__resetStatsCalls++; };
    });

    await page.getByRole('button', { name: '重置' }).click();
    const dialog = page.getByRole('dialog', { name: '重置统计数据' });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => window.__nativeConfirmCalls)).toBe(0);
    expect(await page.evaluate(() => window.__resetStatsCalls)).toBe(0);

    await dialog.getByRole('button', { name: '确认重置' }).click();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => window.__resetStatsCalls)).toBe(1);
});

test('desktop settings and confirmation dialogs keep readable widths', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page);
    await page.getByRole('button', { name: '设置' }).click();

    const settingsWidth = await page.locator('.settings-panel').evaluate(element =>
        element.getBoundingClientRect().width);
    expect(settingsWidth).toBeLessThanOrEqual(520);
    await page.getByRole('button', { name: '关闭设置' }).click();

    await page.getByRole('button', { name: '重置' }).click();
    const confirmWidth = await page.getByRole('dialog', { name: '重置统计数据' })
        .locator('.modal-panel').evaluate(element => element.getBoundingClientRect().width);
    expect(confirmWidth).toBeGreaterThanOrEqual(320);
});

test('release metadata and announcement history stay aligned', async ({ request }) => {
    const packageJson = await (await request.get('/package.json')).json();
    const packageLock = await (await request.get('/package-lock.json')).json();
    const serviceWorker = await (await request.get('/sw.js')).text();
    const changelog = await (await request.get('/CHANGELOG.md')).text();
    const historyIndex = changelog.indexOf('## 历史公告');

    expect(packageJson.version).toBe('1.0.26');
    expect(packageLock.version).toBe('1.0.26');
    expect(packageLock.packages[''].version).toBe('1.0.26');
    expect(serviceWorker).toContain("const CACHE_NAME = CACHE_PREFIX + 'v27'");
    expect(serviceWorker).toContain('self.registration.scope');
    expect(serviceWorker).toContain("'./assets/ui/icons.svg'");
    expect(serviceWorker).toContain("'./manifest.json'");
    const currentIndex = changelog.indexOf('## [1.0.26] - 2026-09-12');
    expect(currentIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeLessThan(historyIndex);
    expect(changelog.indexOf('### [1.0.25] - 2026-09-11')).toBeGreaterThan(historyIndex);
    expect(changelog.indexOf('### [1.0.24] - 2026-09-11')).toBeGreaterThan(historyIndex);
    expect(changelog.indexOf('### [1.0.23] - 2026-09-11')).toBeGreaterThan(historyIndex);
    expect(changelog.indexOf('### [1.0.22] - 2026-09-11')).toBeGreaterThan(historyIndex);
    expect(changelog.indexOf('### [1.0.21] - 2026-09-11')).toBeGreaterThan(historyIndex);
    expect(changelog.indexOf('### [1.0.20] - 2026-09-11')).toBeGreaterThan(historyIndex);
    expect(changelog.indexOf('### [1.0.19] - 2026-07-30')).toBeGreaterThan(historyIndex);
    expect(changelog.indexOf('### [1.0.18] - 2026-07-29')).toBeGreaterThan(historyIndex);
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

test('SFX volume control previews the selected level', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: '设置' }).click();
    await page.evaluate(() => {
        window.__sfxPreviewCount = 0;
        AudioManager.SFX.buttonClick = () => { window.__sfxPreviewCount++; };
    });

    await page.locator('#sfx-volume').fill('70');

    await expect.poll(() => page.evaluate(() => window.__sfxPreviewCount)).toBe(1);
});

test('damaged stored settings are normalized before UI and audio initialization', async ({ page }) => {
    const failures = collectRuntimeFailures(page);
    await page.addInitScript(() => {
        localStorage.setItem('mahjong__version', '1');
        localStorage.setItem('mahjong_settings', JSON.stringify({
            playerName: 123,
            aiDifficulty: 'impossible',
            tableTheme: 'missing-theme',
            gameRounds: 999,
            gameSpeed: null,
            bgmVolume: 'not-a-number',
            sfxVolume: 500,
            sfxEnabled: 'false',
            bgmStyle: 'missing-style',
            opponentDisplay: 'giant',
            mahjongType: 'missing-type'
        }));
        localStorage.setItem('mahjong_replays', JSON.stringify({ damaged: true }));
    });
    await openApp(page);
    await page.getByRole('button', { name: '设置' }).click();

    await expect(page.locator('#player-name')).toHaveValue('玩家');
    await expect(page.locator('#ai-difficulty')).toHaveValue('normal');
    await expect(page.locator('#table-theme')).toHaveValue('classic-green');
    await expect(page.locator('#game-rounds')).toHaveValue('4');
    await expect(page.locator('#bgm-volume')).toHaveValue('0');
    await expect(page.locator('#sfx-volume')).toHaveValue('100');
    await expect(page.locator('#sfx-enabled')).toBeChecked();
    expect(await page.evaluate(() => ({
        bgmVolume: AudioManager.getBgmVolume(),
        sfxVolume: AudioManager.getSfxVolume(),
        mahjongType: App.settings.mahjongType,
        replayCount: Replay.getReplays().length
    }))).toEqual({ bgmVolume: 0, sfxVolume: 1, mahjongType: 'guangdong', replayCount: 0 });
    expect(failures).toEqual([]);
});

test('failed slider persistence restores the control, settings and live audio volume', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: '设置' }).click();
    await page.evaluate(() => { Stats.saveSettings = () => false; });

    await page.locator('#sfx-volume').fill('80');
    await expect(page.locator('#sfx-volume')).toHaveValue('50', { timeout: 2_000 });
    await expect(page.locator('#sfx-volume-value')).toHaveText('50%');
    expect(await page.evaluate(() => ({
        setting: App.settings.sfxVolume,
        live: AudioManager.getSfxVolume()
    }))).toEqual({ setting: 50, live: 0.5 });
});

test('failed settings save restores BGM state only once', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: '设置' }).click();
    await page.evaluate(() => {
        App.settings.bgmStyle = 'calm';
        App.settings.bgmVolume = 30;
        window.__bgmRestoreCalls = 0;
        AudioManager.startBgm = () => { window.__bgmRestoreCalls++; };
        Stats.saveSettings = () => { throw new Error('expected save failure'); };
    });

    await page.getByRole('button', { name: '关闭设置' }).click();
    expect(await page.evaluate(() => window.__bgmRestoreCalls)).toBe(1);
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

test('portrait replay keeps side players readable without rotating labels', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);
    await seedReplay(page);
    await page.getByRole('button', { name: '回放' }).click();
    await page.locator('#replay-container').getByRole('button', { name: '播放', exact: true }).click();

    const sideLayout = await page.evaluate(() => ['left', 'right'].map(position => {
        const area = document.getElementById(`replay-p-${position}`);
        const info = area.querySelector('.replay-player-info').getBoundingClientRect();
        const name = area.querySelector('.replay-p-name');
        const matrix = new DOMMatrix(getComputedStyle(area).transform);
        return {
            rotationB: Math.abs(matrix.b),
            rotationC: Math.abs(matrix.c),
            infoIsHorizontal: info.width > info.height,
            nameFits: name.scrollWidth <= name.clientWidth
        };
    }));

    expect(sideLayout).toEqual([
        { rotationB: 0, rotationC: 0, infoIsHorizontal: true, nameFits: true },
        { rotationB: 0, rotationC: 0, infoIsHorizontal: true, nameFits: true }
    ]);
});

test('replay controls keep SVG icons while toggling play and pause', async ({ page }) => {
    await openApp(page);
    await seedReplay(page);
    await page.getByRole('button', { name: '回放' }).click();
    await page.locator('#replay-container').getByRole('button', { name: '播放', exact: true }).click();

    await expect(page.locator('.replay-control-bar .ui-icon')).toHaveCount(5);
    const playButton = page.locator('#replay-play-pause');
    await expect(playButton.locator('use')).toHaveAttribute('href', 'assets/ui/icons.svg#play');
    await playButton.click();
    await expect(playButton).toHaveAttribute('aria-label', '暂停回放');
    await expect(playButton.locator('use')).toHaveAttribute('href', 'assets/ui/icons.svg#pause');
    await playButton.click();
    await expect(playButton.locator('use')).toHaveAttribute('href', 'assets/ui/icons.svg#play');
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

test('changing BGM while hidden defers playback until the page is visible', async ({ page }) => {
    await openApp(page);
    const states = await page.evaluate(() => {
        AudioManager.stopBgm();
        AudioManager.setBgmVolume(0.3);
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        AudioManager.startBgm('zen');
        const hidden = { playing: AudioManager.isPlaying, style: AudioManager.currentBgm };

        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event('visibilitychange'));
        const visible = { playing: AudioManager.isPlaying, style: AudioManager.currentBgm };
        delete document.hidden;
        AudioManager.stopBgm();
        return { hidden, visible };
    });

    expect(states).toEqual({
        hidden: { playing: false, style: null },
        visible: { playing: true, style: 'zen' }
    });
});

test('configured BGM startup is idempotent and stops stale playback when disabled', async ({ page }) => {
    await openApp(page);
    const state = await page.evaluate(() => {
        const originalStartBgm = AudioManager.startBgm;
        let startCalls = 0;
        AudioManager.startBgm = style => {
            startCalls++;
            return originalStartBgm(style);
        };
        try {
            AudioManager.stopBgm();
            App.settings.bgmStyle = 'calm';
            App.settings.bgmVolume = 30;
            startConfiguredBgm();
            startConfiguredBgm();
            const active = { playing: AudioManager.isPlaying, style: AudioManager.currentBgm };

            App.settings.bgmStyle = 'none';
            startConfiguredBgm();
            return {
                startCalls,
                active,
                disabled: { playing: AudioManager.isPlaying, style: AudioManager.currentBgm }
            };
        } finally {
            AudioManager.startBgm = originalStartBgm;
            AudioManager.stopBgm();
        }
    });

    expect(state).toEqual({
        startCalls: 1,
        active: { playing: true, style: 'calm' },
        disabled: { playing: false, style: null }
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

    expect(await page.evaluate(() => {
        AudioManager.setSfxVolume(Number.NaN);
        return AudioManager.getSfxVolume();
    })).toBe(0);

    await page.evaluate(() => {
        AudioManager.setSfxVolume(0.5);
        AudioManager.SFX.buttonClick();
    });
    expect(await page.evaluate(() => window.__audioContextAttempts)).toBe(1);
});

test('draw and discard SFX receive the concrete tile', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
        window.__tileSfx = { draw: null, discard: null, opponentDiscard: null };
        AudioManager.SFX.draw = tile => {
            window.__tileSfx.draw = tile ? { id: tile.id, suit: tile.suit } : null;
        };
        AudioManager.SFX.discard = tile => {
            window.__tileSfx.discard = tile ? { id: tile.id, suit: tile.suit } : null;
        };
        AudioManager.SFX.opponentDiscard = tile => {
            window.__tileSfx.opponentDiscard = tile ? { id: tile.id, suit: tile.suit } : null;
        };
    });
    await startQuickGame(page);

    const drawn = await page.evaluate(() => window.__tileSfx.draw);
    expect(drawn?.id).toBeTruthy();
    expect(drawn?.suit).toMatch(/^(wan|tong|tiao|feng|jian|hua)$/);

    const tile = page.locator('#hand-bottom .mahjong-tile').first();
    const discarded = {
        id: await tile.getAttribute('data-id'),
        suit: await tile.getAttribute('data-suit')
    };
    await tile.click();
    await tile.click();
    await expect.poll(() => page.evaluate(() => window.__tileSfx.discard)).toEqual(discarded);

    const opponentDiscard = await page.evaluate(() => {
        const tile = Tiles.createTile('tong', 5, 'opponent-sfx');
        App.engine.emit('discard', {
            player: { ...App.engine.players[1].toJSON(), position: 1 },
            tile
        });
        return { id: tile.id, suit: tile.suit };
    });
    await expect.poll(() => page.evaluate(() => window.__tileSfx.opponentDiscard)).toEqual(opponentDiscard);
});

test('AI difficulty explains its strategy accessibly', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: '设置' }).click();

    const difficulty = page.locator('#ai-difficulty');
    await expect(difficulty).toHaveAttribute('aria-describedby', 'ai-difficulty-hint');
    await expect(difficulty.locator('option')).toHaveCount(3);
    expect(await difficulty.locator('option').evaluateAll(options => options.map(option => ({
        value: option.value,
        label: option.textContent.trim()
    })))).toEqual([
        { value: 'easy', label: '简单' },
        { value: 'normal', label: '普通' },
        { value: 'expert', label: '困难' }
    ]);
    await expect(page.locator('#ai-difficulty-hint')).toContainText('牌效');
    await difficulty.selectOption('expert');
    await expect(page.locator('#ai-difficulty-hint')).toContainText('对手建模');
});

test('game HUD uses SVG player identities and compact AI names', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openApp(page);
    await page.getByRole('button', { name: '设置' }).click();
    await page.locator('#ai-difficulty').selectOption('expert');
    await page.getByRole('button', { name: '关闭设置' }).click();
    await startQuickGame(page);

    await expect(page.locator('#game-screen .player-avatar .ui-icon')).toHaveCount(4);
    for (const name of ['玩家', '难下', '难对', '难上']) {
        await expect(page.locator('#game-screen').getByText(name, { exact: true })).toHaveCount(1);
    }
    const overflowingNames = await page.locator('#game-screen .player-name').evaluateAll(elements =>
        elements
            .map(element => {
                const range = document.createRange();
                range.selectNodeContents(element);
                return {
                    element,
                    textWidth: range.getBoundingClientRect().width,
                    clientWidth: element.getBoundingClientRect().width
                };
            })
            .filter(({ textWidth, clientWidth }) => textWidth > clientWidth)
            .map(element => ({
                name: element.element.textContent,
                textWidth: element.textWidth,
                clientWidth: element.clientWidth
            }))
    );
    expect(overflowingNames).toEqual([]);

    await page.setViewportSize({ width: 1440, height: 900 });
    const desktopSideNameSizes = await page.locator(
        '#game-screen .player-area.left .player-name, #game-screen .player-area.right .player-name'
    ).evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).fontSize)));
    expect(Math.min(...desktopSideNameSizes)).toBeGreaterThanOrEqual(12);
});

test('expert AI advances after the human discard at instant speed', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: '设置' }).click();
    await page.locator('#ai-difficulty').selectOption('expert');
    await page.locator('#game-speed').selectOption('instant');
    await page.getByRole('button', { name: '关闭设置' }).click();
    await startQuickGame(page);

    const tile = page.locator('#hand-bottom .mahjong-tile').first();
    await tile.click();
    await tile.click();

    await expect.poll(() => page.evaluate(() => App.engine.gameHistory.some(entry =>
        entry.action === 'discard' && entry.data.playerId !== (App.localPlayerIndex ?? 0)
    ))).toBe(true);
    const flow = await page.evaluate(() => ({
        state: App.engine.state,
        localIndex: App.localPlayerIndex ?? 0,
        pendingPlayer: App.engine.pendingAction?.player?.position ?? null,
        enabledActions: document.querySelectorAll('#action-bar .action-btn:not(:disabled)').length
    }));
    expect(flow.state !== 'waiting' || (
        flow.pendingPlayer === flow.localIndex && flow.enabledActions > 0
    )).toBe(true);
});

test('AI turns expose an explicit thinking state', async ({ page }) => {
    await openApp(page);
    await startQuickGame(page);

    await page.evaluate(() => {
        const player = App.engine.players[1];
        App.engine.emit('turnStart', { player: player.toJSON(), index: player.position });
    });

    await expect(page.locator('#turn-guidance')).toContainText('正在思考');
    await expect(page.locator('#turn-guidance')).toHaveAttribute('data-state', 'thinking');
});

test('game table uses tactile tiles and a focused match hierarchy', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page);
    await startQuickGame(page);
    await page.evaluate(() => enableActionButtons({ type: 'peng' }));

    await expect(page.locator('#table-status-core')).toBeVisible();
    await expect(page.locator('#table-wind-indicator')).toHaveText('东');
    await expect(page.locator('#table-round-info')).toContainText('1/4');

    const visual = await page.evaluate(() => {
        enableActionButtons({ type: 'peng' });
        const tile = document.querySelector('#hand-bottom .mahjong-tile:not(.back)');
        const sideAvatar = document.querySelector('#player-left .player-avatar');
        const action = document.querySelector('#btn-peng');
        const table = document.getElementById('game-table');
        const tileStyle = getComputedStyle(tile);
        const actionStyle = getComputedStyle(action);
        return {
            tileBackground: tileStyle.backgroundImage,
            tileLightness: tileStyle.color,
            sideAvatarVisible: getComputedStyle(sideAvatar).display !== 'none',
            actionRadius: Number.parseFloat(actionStyle.borderRadius),
            actionHeight: Number.parseFloat(actionStyle.height),
            tableFrame: getComputedStyle(table, '::before').content
        };
    });

    expect(visual.tileBackground).toContain('rgb(255, 253, 245)');
    expect(visual.tileLightness).not.toBe('rgb(255, 255, 255)');
    expect(visual.sideAvatarVisible).toBe(true);
    expect(visual.actionRadius).toBeGreaterThanOrEqual(24);
    expect(visual.actionHeight).toBeGreaterThanOrEqual(48);
    expect(visual.tableFrame).not.toBe('none');
});

test('audio settings expose a live BGM and SFX summary', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: '设置' }).click();

    const status = page.locator('#audio-settings-status');
    await expect(status).toHaveAttribute('role', 'status');
    await expect(status).toContainText('背景音乐：关闭');
    await page.locator('#bgm-style').selectOption('zen');
    await expect(status).toContainText('背景音乐：禅意 · 30%');
    await page.locator('#sfx-volume').fill('65');
    await expect(status).toContainText('游戏音效：65%');
});

test('all synthesized SFX and BGM styles run and stop without runtime errors', async ({ page }) => {
    const failures = collectRuntimeFailures(page);
    await openApp(page);
    const audioState = await page.evaluate(() => {
        const tile = { id: 'audio-test', suit: 'wan', value: 1 };
        AudioManager.setSfxEnabled(true);
        AudioManager.setSfxVolume(0.2);
        Object.values(AudioManager.SFX).forEach(play => play(tile));

        AudioManager.setBgmVolume(0.2);
        const styles = ['calm', 'upbeat', 'zen'].map(style => {
            AudioManager.startBgm(style);
            return { style: AudioManager.currentBgm, playing: AudioManager.isPlaying };
        });
        AudioManager.startBgm('unknown-style');
        const unknown = { style: AudioManager.currentBgm, playing: AudioManager.isPlaying };
        return { styles, unknown };
    });
    await page.waitForTimeout(1_000);
    await page.evaluate(() => {
        AudioManager.stopBgm();
        AudioManager.stopAllSfx();
    });

    expect(audioState.styles).toEqual([
        { style: 'calm', playing: true },
        { style: 'upbeat', playing: true },
        { style: 'zen', playing: true }
    ]);
    expect(audioState.unknown).toEqual({ style: null, playing: false });
    expect(failures).toEqual([]);
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

test('empty replay clears the previous replay state and disables playback', async ({ page }) => {
    await openApp(page);
    await seedReplay(page);
    await page.getByRole('button', { name: '回放' }).click();
    await page.locator('#replay-container').getByRole('button', { name: '播放', exact: true }).click();
    await expect(page.locator('.replay-timeline-item')).toHaveCount(5);

    await page.evaluate(() => openReplayPlayer({
        mahjongType: 'guobiao',
        players: [],
        rounds: [],
        finalScores: []
    }));
    await expect(page.locator('#replay-action-text')).toHaveText('无回放数据');
    await expect(page.locator('#replay-action-sub')).toHaveText('');
    await expect(page.locator('#replay-step-counter')).toHaveText('0 / 0');
    await expect(page.locator('.replay-timeline-item')).toHaveCount(0);
    await expect(page.locator('#replay-table .mahjong-tile')).toHaveCount(0);
    await expect(page.locator('#replay-play-pause')).toBeDisabled();
    await expect(page.locator('#replay-meta')).toHaveText('无对局数据');

    await page.evaluate(() => openReplayPlayer({
        mahjongType: 'guobiao',
        players: { damaged: true },
        rounds: [{ history: { damaged: true } }],
        finalScores: { damaged: true }
    }));
    await expect(page.locator('#replay-action-text')).toHaveText('本局无动作记录');
    await expect(page.locator('.replay-timeline-item')).toHaveCount(0);
    await expect(page.locator('#replay-scores .score-tag')).toHaveCount(0);
});

test('network guest receives a localized final result from the trusted host', async ({ page }) => {
    await openApp(page);
    await startQuickGame(page);
    await page.evaluate(() => {
        App.localPlayerIndex = 2;
        App.isNetworkGame = true;
        App.network = {
            isHost: false,
            playerId: 'guest',
            players: [{ id: 'host', isHost: true }, { id: 'guest', isHost: false }]
        };
        handleNetworkData('gameResult', {
            mahjongType: 'guangdong',
            round: 4,
            players: [
                { id: 0, position: 0, name: '房主', score: 900, networkId: 'host' },
                { id: 1, position: 1, name: '玩家1', score: 950 },
                { id: 2, position: 2, name: '访客', score: 1300, networkId: 'guest' },
                { id: 3, position: 3, name: '玩家3', score: 850 }
            ],
            winner: { position: 2 }
        }, 'host');
    });

    await expect(page.locator('#game-result')).toHaveClass(/active/);
    await expect(page.locator('#result-title')).toHaveText('胜利');
    await expect(page.locator('#result-subtitle')).toHaveText('净胜 +300 分');
    await expect(page.locator('.result-player-row.winner .result-p-name')).toHaveText('访客');
    await expect(page.locator('#result-rewards')).toContainText('广东麻将');
    expect(await page.evaluate(() => App.isNetworkGame)).toBe(true);
    await expect(page.locator('#btn-result-restart')).toBeDisabled();
});

test('Taiwan 17-tile hand remains fully visible on a small portrait phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openApp(page);
    await page.getByRole('button', { name: /自定义模式/ }).click();
    await page.getByRole('button', { name: /台湾麻将/ }).click();
    await page.getByRole('button', { name: '开始游戏', exact: true }).click();
    const tiles = page.locator('#hand-bottom .mahjong-tile');
    await expect(tiles).toHaveCount(17, { timeout: 10_000 });
    await expect.poll(() => page.locator('#hand-bottom .tile-drawn').count()).toBe(0);
    await tiles.last().click();
    await expect(tiles.last()).toHaveClass(/selected/);
    const containment = await page.evaluate(() => {
        const hand = document.getElementById('hand-bottom').getBoundingClientRect();
        const tileRects = [...document.querySelectorAll('#hand-bottom .mahjong-tile')]
            .map(tile => tile.getBoundingClientRect());
        return {
            allVisible: tileRects.every(tile => tile.left >= hand.left - 1 && tile.right <= hand.right + 1),
            scrollOverflow: document.getElementById('hand-bottom').scrollWidth - document.getElementById('hand-bottom').clientWidth,
            minWidth: Math.min(...tileRects.map(tile => tile.width)),
            edgeReserve: Math.min(tileRects[0].left - hand.left, hand.right - tileRects.at(-1).right)
        };
    });
    expect(containment.allVisible).toBe(true);
    expect(containment.scrollOverflow).toBeLessThanOrEqual(1);
    expect(containment.minWidth).toBeGreaterThanOrEqual(24);
    expect(containment.edgeReserve).toBeGreaterThanOrEqual(8);
});

test('game table explains the next action and hides unavailable action buttons', async ({ page }) => {
    await openApp(page);
    await startQuickGame(page);

    const guidance = page.locator('#turn-guidance');
    await expect(guidance).toHaveAttribute('role', 'status');
    await expect(guidance).toHaveAttribute('aria-live', 'polite');
    await expect(guidance).toContainText('选择一张手牌，再次点击打出');
    await expect(page.locator('#player-bottom .player-info > #shanten-display')).toHaveCount(1);
    await expect(page.locator('#action-bar')).toBeHidden();

    const firstTile = page.locator('#hand-bottom .mahjong-tile').first();
    const tileName = await firstTile.getAttribute('aria-label');
    await firstTile.click();
    await expect(guidance).toContainText(`已选择 ${tileName}`);
    await expect(guidance).toContainText('再次点击打出');

    await page.evaluate(() => enableActionButtons({ type: 'peng' }));
    await page.evaluate(() => updateTurnGuidance('可以碰牌，也可以点击“过”继续', 'action'));
    await expect(page.locator('#action-bar')).toBeVisible();
    await expect(page.locator('#action-bar')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#btn-peng')).toBeEnabled();
    await expect(page.locator('#btn-peng')).toBeVisible();
    await expect(page.locator('#btn-skip')).toBeVisible();
    await expect(page.locator('#btn-chi')).toBeHidden();
    await expect(page.locator('#btn-gang')).toBeHidden();
    await expect(page.locator('#btn-hu')).toBeHidden();
    await expect(page.locator('#btn-peng')).toHaveCSS('animation-name', 'none');
    const immediateReadyStyle = await page.evaluate(() => {
        disableActionButtons();
        enableActionButtons({ type: 'peng' });
        const style = getComputedStyle(document.getElementById('btn-peng'));
        return { opacity: style.opacity, filter: style.filter };
    });
    expect(immediateReadyStyle).toEqual({ opacity: '1', filter: 'none' });
    await page.screenshot({ path: 'test-results/ui-audit-action-state.png', fullPage: true });

    await page.evaluate(() => disableActionButtons());
    expect(await page.locator('#action-bar').evaluate(element => {
        const style = getComputedStyle(element);
        return { opacity: style.opacity, visibility: style.visibility };
    })).toEqual({ opacity: '0', visibility: 'hidden' });
});

test('pausing from the game menu keeps the engine and visible countdown in sync', async ({ page }) => {
    await openApp(page);
    await startQuickGame(page);
    await page.evaluate(() => {
        App.engine.turnTimeout = 5_000;
        App.engine.startTimer();
    });
    await expect(page.locator('#turn-timer-value')).toHaveText('5');
    await expect(page.locator('#turn-timer-display')).toBeVisible();

    await page.evaluate(() => showIngameMenu());
    await expect(page.locator('#turn-timer-display')).toBeHidden();
    expect(await page.evaluate(() => App.engine.timer)).toBeNull();

    await page.evaluate(() => hideIngameMenu());
    await expect(page.locator('#turn-timer-value')).toHaveText('5');
    await expect(page.locator('#turn-timer-display')).toBeVisible();
    expect(await page.evaluate(() => Boolean(App.engine.timer))).toBe(true);
});

test('drag discard replaces stale selection guidance immediately', async ({ page }) => {
    await openApp(page);
    await startQuickGame(page);
    const tile = page.locator('#hand-bottom .mahjong-tile').first();
    const tileId = await tile.getAttribute('data-id');
    await tile.click();
    await expect(page.locator('#turn-guidance')).toContainText('已选择');

    await page.evaluate(id => {
        App.engine.playerDiscard = () => new Promise(() => {});
        const draggedTile = App.engine.players[App.localPlayerIndex ?? 0].hand.find(tile => tile.id === id);
        AppEventBus.emit('tile:dragend', draggedTile);
    }, tileId);

    await expect(page.locator('#turn-guidance')).toHaveText('已打出，等待其他玩家响应…');
    await expect(tile).toHaveAttribute('aria-disabled', 'true');
});

test('skipping a self action restores discard guidance and its visible timer', async ({ page }) => {
    await openApp(page);
    await startQuickGame(page);
    await page.evaluate(() => {
        const tile = App.engine.players[App.localPlayerIndex ?? 0].hand[0];
        App.anGangOptions = [{ type: 'an_gang', tiles: [tile, tile, tile, tile] }];
        enableActionButtons({ type: 'gang' });
        updateTurnGuidance('可以杠牌，也可以点击“过”继续', 'action');
        document.getElementById('turn-timer-display').classList.add('hidden');
    });

    await page.evaluate(() => handleAction('skip'));
    await expect(page.locator('#turn-guidance')).toHaveText('选择一张手牌，再次点击打出');
    await expect(page.locator('#turn-timer-display')).toBeVisible();
    await expect(page.locator('#action-bar')).toBeHidden();
    await expect(page.locator('#hand-bottom .mahjong-tile').first()).toHaveAttribute('aria-disabled', 'false');
});

test('cancelling an kong choice keeps the action available', async ({ page }) => {
    await openApp(page);
    await startQuickGame(page);
    await page.evaluate(() => {
        const [first, second] = App.engine.players[App.localPlayerIndex ?? 0].hand;
        App.anGangOptions = [first, second].map(tile => ({
            type: 'an_gang',
            tiles: [tile, tile, tile, tile]
        }));
        enableActionButtons({ type: 'gang' });
        window.__gangAction = handleAction('gang');
    });

    await expect(page.getByRole('dialog', { name: '请选择杠的组合' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__gangAction);
    await expect(page.locator('#btn-gang')).toBeEnabled();
    await expect(page.locator('#action-bar')).toBeVisible();
    expect(await page.evaluate(() => App.anGangOptions.length)).toBe(2);
});

test('a new claim replaces stale action buttons', async ({ page }) => {
    await openApp(page);
    await startQuickGame(page);
    await page.evaluate(() => {
        const engine = App.engine;
        const player = engine.players[App.localPlayerIndex ?? 0];
        engine.stopTimer();
        engine.state = 'waiting';
        engine.emit('actionAvailable', { player: player.toJSON(), action: { type: 'hu', priority: 4 } });
        engine.emit('actionAvailable', { player: player.toJSON(), action: { type: 'peng', priority: 2 } });
    });

    await expect(page.locator('#btn-hu')).toBeHidden();
    await expect(page.locator('#btn-peng')).toBeEnabled();
    await expect(page.locator('#btn-skip')).toBeEnabled();
});

test('rules that forbid chi explain the restriction when the game starts', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => startGame({
        mahjongType: 'sichuan',
        playerCount: 4,
        aiDifficulty: 'normal',
        speed: 'instant',
        maxRounds: 1
    }));

    await expect(page.locator('#toast-container .toast').filter({ hasText: '当前规则不可吃牌' })).toBeVisible();
});

test('clicking chi claims the discard and continues with a playable hand', async ({ page }) => {
    await openApp(page);
    await startQuickGame(page);
    await page.evaluate(() => {
        const engine = App.engine;
        const player = engine.players[App.localPlayerIndex ?? 0];
        const one = Tiles.createTile('wan', 1, 'chi-ui-one');
        const two = Tiles.createTile('wan', 2, 'chi-ui-two');
        const discard = Tiles.createTile('wan', 3, 'chi-ui-discard');
        player.hand = [one, two, ...Array.from({ length: 11 }, (_, index) =>
            Tiles.createTile('feng', index % 4 + 1, `chi-ui-rest-${index}`))];
        player.melds = [];
        engine.stopTimer();
        engine.state = 'waiting';
        engine.currentPlayerIndex = 3;
        engine.lastDiscard = discard;
        engine.discardPile = [discard];
        const action = { type: 'chi', options: Rules.canChi(player.hand, discard, engine.ruleConfig), priority: 1 };
        engine.pendingAction = { player, action, priority: 1 };
        engine._pendingActions = [engine.pendingAction];
        renderPlayerHand(player.position, player.hand.length);
        engine.emit('actionAvailable', { player: player.toJSON(), action, tile: discard });
    });

    await page.locator('#btn-chi').click();
    await expect.poll(() => page.evaluate(() => App.engine.players[0].melds.length)).toBe(1);
    expect(await page.evaluate(() => ({
        meldSize: App.engine.players[0].melds[0].tiles.length,
        handSize: App.engine.players[0].hand.length,
        discardCount: App.engine.discardPile.length,
        currentPlayer: App.engine.currentPlayerIndex,
        state: App.engine.state
    }))).toEqual({ meldSize: 3, handSize: 11, discardCount: 0, currentPlayer: 0, state: 'playing' });
    await expect(page.locator('#melds-bottom .meld-group .mahjong-tile')).toHaveCount(3);
    await expect(page.locator('#hand-bottom .mahjong-tile').first()).toHaveAttribute('aria-disabled', 'false');
});

test('an upstream discard offers every legal chi choice through the real turn flow', async ({ page }) => {
    await openApp(page);
    await startQuickGame(page);
    await page.evaluate(async () => {
        const engine = App.engine;
        const local = engine.players[0];
        const upstream = engine.players[3];
        const discard = Tiles.createTile('wan', 3, 'chi-flow-discard');
        local.hand = [
            Tiles.createTile('wan', 1, 'chi-flow-one'),
            Tiles.createTile('wan', 2, 'chi-flow-two'),
            Tiles.createTile('wan', 4, 'chi-flow-four'),
            Tiles.createTile('wan', 5, 'chi-flow-five'),
            ...Array.from({ length: 9 }, (_, index) =>
                Tiles.createTile('feng', index % 4 + 1, `chi-flow-rest-${index}`))
        ];
        local.melds = [];
        upstream.hand = [discard];
        for (const index of [1, 2]) {
            engine.players[index].hand = Array.from({ length: 13 }, (_, tileIndex) =>
                Tiles.createTile('jian', tileIndex % 3 + 1, `chi-flow-p${index}-${tileIndex}`));
        }
        engine.stopTimer();
        engine.state = 'playing';
        engine.currentPlayerIndex = 3;
        engine.discardPile = [];
        engine.lastDiscard = null;
        renderGameState();
        await engine.playerDiscard(discard.id);
    });

    await expect(page.locator('#btn-chi')).toBeEnabled();
    expect(await page.evaluate(() => App.engine.pendingAction?.action?.options?.length)).toBe(3);
    await page.locator('#btn-chi').click();
    const selector = page.getByRole('dialog', { name: '请选择吃的组合' });
    await expect(selector).toBeVisible();
    await expect(selector.getByRole('button', { name: /选项/ })).toHaveCount(3);
    await selector.getByRole('button', { name: /选项/ }).nth(2).click();

    await expect.poll(() => page.evaluate(() => App.engine.players[0].melds.length)).toBe(1);
    expect(await page.evaluate(() => App.engine.players[0].melds[0].tiles.map(tile => tile.value))).toEqual([4, 5, 3]);
    await expect(page.locator('#hand-bottom .mahjong-tile').first()).toHaveAttribute('aria-disabled', 'false');
});

test('chi remains directly selectable when the same player can also peng', async ({ page }) => {
    await openApp(page);
    await startQuickGame(page);
    await page.evaluate(async () => {
        const engine = App.engine;
        const local = engine.players[0];
        const upstream = engine.players[3];
        const discard = Tiles.createTile('wan', 3, 'chi-peng-discard');
        local.hand = [
            Tiles.createTile('wan', 1, 'chi-peng-one'),
            Tiles.createTile('wan', 2, 'chi-peng-two'),
            Tiles.createTile('wan', 3, 'chi-peng-three-a'),
            Tiles.createTile('wan', 3, 'chi-peng-three-b'),
            ...Array.from({ length: 9 }, (_, index) =>
                Tiles.createTile('feng', index % 4 + 1, `chi-peng-rest-${index}`))
        ];
        local.melds = [];
        upstream.hand = [discard];
        for (const index of [1, 2]) {
            engine.players[index].hand = Array.from({ length: 13 }, (_, tileIndex) =>
                Tiles.createTile('jian', tileIndex % 3 + 1, `chi-peng-p${index}-${tileIndex}`));
        }
        engine.stopTimer();
        engine.state = 'playing';
        engine.currentPlayerIndex = 3;
        engine.discardPile = [];
        engine.lastDiscard = null;
        renderGameState();
        await engine.playerDiscard(discard.id);
    });

    await expect(page.locator('#btn-peng')).toBeEnabled();
    await expect(page.locator('#btn-chi')).toBeEnabled();
    await page.locator('#btn-chi').click();
    await expect.poll(() => page.evaluate(() => App.engine.players[0].melds[0]?.type)).toBe('sequence');
});

test('upgrading a peng to jia gang renders the fourth meld tile', async ({ page }) => {
    await openApp(page);
    await startQuickGame(page);
    await page.evaluate(() => {
        const player = App.engine.players[0];
        window.__jiaGangSfx = 0;
        AudioManager.SFX.gang = () => { window.__jiaGangSfx++; };
        const tiles = Array.from({ length: 4 }, (_, index) =>
            Tiles.createTile('tong', 5, `jia-gang-ui-${index}`));
        player.melds = [{ type: 'triplet', tiles: tiles.slice(0, 3) }];
        renderPlayerMelds(0);
        player.melds[0].type = 'gang';
        player.melds[0].tiles.push(tiles[3]);
        App.engine.emit('jiaGang', { player: player.toJSON(), meld: player.melds[0] });
    });

    await expect(page.locator('#melds-bottom .meld-group')).toHaveCount(1);
    await expect(page.locator('#melds-bottom .meld-group .mahjong-tile')).toHaveCount(4);
    expect(await page.evaluate(() => window.__jiaGangSfx)).toBe(1);
});

test('network state sync updates turn guidance, highlight, and authoritative input lock', async ({ page }) => {
    await openApp(page);
    await startQuickGame(page);
    await page.evaluate(() => {
        const networkIds = ['host', 'guest', 'peer-2', 'peer-3'];
        App.isNetworkGame = true;
        App.network = {
            isHost: false,
            playerId: 'guest',
            players: networkIds.map((id, index) => ({ id, isHost: index === 0 })),
            sendTo: () => window.__networkSendSucceeds
        };
        window.__networkSendSucceeds = false;
        const state = App.engine.getState();
        state.state = 'playing';
        state.currentPlayer = 2;
        state.players = App.engine.players.map((player, index) => ({
            ...player.toJSON(index === 1),
            networkId: networkIds[index]
        }));
        window.__remoteState = state;
        window.__remoteConfig = { ...App.engine.config, playerCount: 4 };
        handleNetworkData('stateSync', { state, config: window.__remoteConfig }, 'host');
    });

    await expect(page.locator('#player-right')).toHaveClass(/current-turn/);
    await expect(page.locator('#turn-guidance')).toContainText('等待');
    await expect(page.locator('#turn-guidance')).toContainText('出牌');

    await page.evaluate(() => {
        const state = structuredClone(window.__remoteState);
        const tile = state.players[1].hand[0];
        state.currentPlayer = 1;
        state.selfActions = {
            anGangOptions: [{ type: 'an_gang', tiles: [tile, tile, tile, tile] }]
        };
        handleNetworkData('stateSync', { state, config: window.__remoteConfig }, 'host');
    });
    await expect(page.locator('#player-bottom')).toHaveClass(/current-turn/);
    await expect(page.locator('#turn-guidance')).toContainText('可以杠牌');
    await expect(page.locator('#action-bar')).toBeVisible();

    await page.locator('#btn-skip').click();
    await expect(page.locator('#btn-gang')).toBeEnabled();
    await expect(page.locator('#action-bar')).toBeVisible();
    await expect(page.locator('#hand-bottom .mahjong-tile').first()).toHaveAttribute('aria-disabled', 'false');

    await page.evaluate(() => { window.__networkSendSucceeds = true; });
    await page.locator('#btn-skip').click();
    await expect(page.locator('#turn-guidance')).toHaveText('操作已发送，等待房主确认…');
    await expect(page.locator('#hand-bottom .mahjong-tile').first()).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#action-bar')).toBeHidden();
});

test('host immediately acknowledges a remote chi inside the broadcast throttle window', async ({ page }) => {
    await openApp(page);
    await startQuickGame(page);
    const result = await page.evaluate(async () => {
        const engine = App.engine;
        const remote = engine.players[1];
        const discard = Tiles.createTile('wan', 3, 'network-chi-discard');
        remote.networkId = 'remote-player';
        remote.isAI = false;
        remote.hand = [
            Tiles.createTile('wan', 1, 'network-chi-one'),
            Tiles.createTile('wan', 2, 'network-chi-two'),
            ...Array.from({ length: 11 }, (_, index) =>
                Tiles.createTile('feng', index % 4 + 1, `network-chi-rest-${index}`))
        ];
        engine.stopTimer();
        engine.state = 'waiting';
        engine.currentPlayerIndex = 0;
        engine.lastDiscard = discard;
        engine.discardPile = [discard];
        const action = { type: 'chi', options: Rules.canChi(remote.hand, discard, engine.ruleConfig), priority: 1 };
        engine.pendingAction = { player: remote, action, priority: 1 };
        engine._pendingActions = [engine.pendingAction];

        const sends = [];
        App.isNetworkGame = true;
        App.network = {
            isHost: true,
            playerId: 'host-player',
            players: [
                { id: 'host-player', isHost: true },
                { id: 'remote-player', isHost: false }
            ],
            sendTo(id, payload) {
                sends.push({ id, state: payload.data?.state?.state, currentPlayer: payload.data?.state?.currentPlayer });
                return true;
            }
        };

        broadcastGameState(true);
        sends.length = 0;
        await handleRemotePlayerAction('remote-player', { type: 'chi', selectedOptionIndex: 0 });
        return {
            sends,
            meldCount: remote.melds.length,
            currentPlayer: engine.currentPlayerIndex
        };
    });

    expect(result.meldCount).toBe(1);
    expect(result.currentPlayer).toBe(1);
    expect(result.sends.at(-1)).toEqual({ id: 'remote-player', state: 'playing', currentPlayer: 1 });
});

test('network guest receives simultaneous chi and peng choices and can send chi', async ({ page }) => {
    await openApp(page);
    await startQuickGame(page);
    await page.evaluate(() => {
        const networkIds = ['host', 'guest', 'peer-2', 'peer-3'];
        const state = App.engine.getState();
        const discard = Tiles.createTile('wan', 3, 'guest-chi-discard');
        const one = Tiles.createTile('wan', 1, 'guest-chi-one');
        const two = Tiles.createTile('wan', 2, 'guest-chi-two');
        state.state = 'waiting';
        state.currentPlayer = 0;
        state.lastDiscard = discard;
        state.discardPile = [discard];
        state.players = App.engine.players.map((player, index) => ({
            ...player.toJSON(index === 1),
            networkId: networkIds[index],
            hand: index === 1 ? [one, two, ...player.hand.slice(2)] : undefined
        }));
        state.pendingAction = {
            playerIndex: 1,
            action: { type: 'peng', priority: 2 },
            actions: [
                { type: 'peng', priority: 2 },
                { type: 'chi', priority: 1, options: [[one, two, discard]] }
            ]
        };
        state.selfActions = {};
        window.__guestActions = [];
        App.isNetworkGame = true;
        App.network = {
            isHost: false,
            playerId: 'guest',
            players: networkIds.map((id, index) => ({ id, isHost: index === 0 })),
            sendTo(id, payload) {
                window.__guestActions.push({ id, data: payload.data });
                return true;
            }
        };
        handleNetworkData('stateSync', { state, config: App.engine.config }, 'host');
    });

    await expect(page.locator('#btn-peng')).toBeEnabled();
    await expect(page.locator('#btn-chi')).toBeEnabled();
    await page.locator('#btn-chi').click();
    expect(await page.evaluate(() => window.__guestActions)).toEqual([
        { id: 'host', data: { type: 'chi', selectedOptionIndex: 0 } }
    ]);
    await expect(page.locator('#turn-guidance')).toHaveText('操作已发送，等待房主确认…');
});

test('failed network discard restores hand input for retry', async ({ page }) => {
    await openApp(page);
    await startQuickGame(page);
    await page.evaluate(() => {
        App.isNetworkGame = true;
        App.network = {
            isHost: false,
            playerId: 'guest',
            players: [{ id: 'host', isHost: true }, { id: 'guest', isHost: false }],
            sendTo: () => false
        };
    });

    const tile = page.locator('#hand-bottom .mahjong-tile').first();
    await tile.click();
    await tile.click();
    await expect(page.locator('#turn-guidance')).toHaveText('出牌发送失败，请重新选择手牌');
    await expect(tile).toHaveAttribute('aria-disabled', 'false');
    await expect(page.locator('#hand-bottom .mahjong-tile')).toHaveCount(14);
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
    await page.locator('#network-lobby').getByRole('button', { name: '返回', exact: true }).click();

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
        await page.evaluate(() => {
            disableActionButtons();
            ['chi', 'peng', 'gang', 'hu'].forEach(type => enableActionButtons({ type }));
        });

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
            const guidance = rect('#turn-guidance');
            const bottomHand = rect('#hand-bottom');
            const bottomInfo = rect('#player-bottom .player-info');
            const shanten = rect('#shanten-display:not(.hidden)');
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
            const bottomTilesInsideHand = [...document.querySelectorAll('#hand-bottom .mahjong-tile')].every(el => {
                const r = el.getBoundingClientRect();
                return r.left >= bottomHand.left - 1 && r.right <= bottomHand.right + 1;
            });
            const bottomHandScrollOverflow = document.getElementById('hand-bottom').scrollWidth -
                document.getElementById('hand-bottom').clientWidth;

            return {
                screen,
                table,
                center,
                action,
                guidance,
                bottomHand,
                bottomInfo,
                shanten,
                playerRects,
                tiles,
                tableInsideScreen: inside(table, screen),
                playersInsideTable: playerRects.every(player => inside(player, table)),
                verticalTileOverflowByPosition,
                sideTileOverflow,
                bottomTilesInsideHand,
                bottomHandScrollOverflow,
                actionInsideScreen: inside(action, screen),
                actionBottomHandOverlap: overlap(action, bottomHand),
                actionBottomInfoOverlap: overlap(action, bottomInfo),
                actionShantenOverlap: overlap(action, shanten),
                actionGuidanceOverlap: overlap(action, guidance),
                horizontalScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                verticalScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight
            };
        });

        expect(layout.tableInsideScreen).toBe(true);
        expect(layout.playersInsideTable).toBe(true);
        expect(layout.verticalTileOverflowByPosition).toEqual({ top: 0, left: 0, right: 0, bottom: 0 });
        expect(layout.sideTileOverflow).toBe(0);
        expect(layout.bottomTilesInsideHand).toBe(true);
        expect(layout.bottomHandScrollOverflow).toBeLessThanOrEqual(1);
        expect(layout.actionInsideScreen).toBe(true);
        expect(layout.actionBottomHandOverlap).toBe(0);
        expect(layout.actionBottomInfoOverlap).toBe(0);
        expect(layout.actionShantenOverlap).toBe(0);
        expect(layout.actionGuidanceOverlap).toBe(0);
        expect(layout.horizontalScroll).toBe(0);
        expect(layout.verticalScroll).toBe(0);
        expect(layout.tiles.every(tile => tile.width >= 20 && tile.height >= 26)).toBe(true);
        expect(failures).toEqual([]);

        if (['desktop', 'phone-portrait', 'phone-landscape'].includes(viewport.name)) {
            await page.screenshot({ path: `test-results/ui-audit-${viewport.name}.png`, fullPage: true });
        }
    });
}
