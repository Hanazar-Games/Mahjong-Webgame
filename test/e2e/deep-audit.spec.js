const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const audioSource = fs.readFileSync(path.join(__dirname, '../../js/audio/audio-manager.js'), 'utf8');

test('all audible SFX and BGM render finite non-clipping waveforms, including delayed layers', async ({ page }) => {
    await page.goto('/');
    const results = await page.evaluate(async source => {
        async function render(name, bgm = false, muted = false) {
            const offline = new OfflineAudioContext(1, 44100 * 4, 44100);
            let now = 0, id = 0;
            const tasks = new Map();
            const context = new Proxy(offline, { get(target, property) {
                if (property === 'currentTime') return now;
                if (property === 'state') return 'running';
                const value = target[property];
                return typeof value === 'function' ? value.bind(target) : value;
            } });
            const manager = new Function('window', 'document', 'setTimeout', 'clearTimeout', source + ';return AudioManager;')(
                { AudioContext: function() { return context; } }, { hidden: false },
                (callback, delay) => { tasks.set(++id, { at: now + delay / 1000, callback }); return id; }, key => tasks.delete(key));
            manager.setSfxVolume(1);
            manager.setBgmVolume(1);
            manager.setMuted(muted);
            if (bgm) manager.startBgm(name);
            else manager.SFX[name](name === 'gameEnd' ? true : { suit: 'wan', value: 5 });
            for (let step = 0; step < 100 && tasks.size; step++) {
                const [key, task] = [...tasks].sort((a, b) => a[1].at - b[1].at)[0];
                if (task.at >= 4) break;
                tasks.delete(key);
                now = task.at;
                task.callback();
            }
            const samples = (await offline.startRendering()).getChannelData(0);
            let peak = 0, energy = 0, finite = true;
            for (const value of samples) {
                peak = Math.max(peak, Math.abs(value));
                energy += value * value;
                if (!Number.isFinite(value)) finite = false;
            }
            return { name, peak, energy, finite, muted };
        }
        const names = Object.keys(AudioManager.SFX).filter(name => name !== 'error');
        return Promise.all([
            ...names.map(name => render(name)),
            ...['calm', 'upbeat', 'zen'].map(name => render(name, true)),
            render('calm', true, true), render('hu', false, true)
        ]);
    }, audioSource);
    for (const result of results) {
        expect(result.finite, result.name).toBe(true);
        expect(result.peak, result.name).toBeLessThan(1);
        if (result.muted) expect(result.energy, result.name).toBe(0);
        else expect(result.energy, result.name).toBeGreaterThan(0.00001);
    }
});

test('BGM phrases share their time boundary and obsolete callbacks cannot revive a stopped loop', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(source => {
        const offline = new OfflineAudioContext(1, 44100, 44100);
        const starts = [], tasks = [];
        const createOscillator = offline.createOscillator.bind(offline);
        offline.createOscillator = () => {
            const osc = createOscillator(), start = osc.start.bind(osc);
            osc.start = time => { starts.push(time); start(time); };
            return osc;
        };
        const stableMath = Object.create(Math);
        stableMath.random = () => 0;
        const context = new Proxy(offline, { get(target, key) {
            if (key === 'state') return 'running';
            const value = target[key];
            return typeof value === 'function' ? value.bind(target) : value;
        } });
        const manager = new Function('window', 'document', 'setTimeout', 'clearTimeout', 'Math', source + ';return AudioManager;')(
            { AudioContext: function() { return context; } }, { hidden: false },
            (callback, delay) => { tasks.push({ callback, delay }); return tasks.length; }, () => {}, stableMath);
        manager.startBgm('calm');
        const oldLoop = tasks[0];
        const firstCount = starts.length;
        oldLoop.callback();
        const nextStart = starts[firstCount];
        manager.stopBgm();
        manager.startBgm('upbeat');
        const beforeStaleCallback = starts.length;
        oldLoop.callback();
        return { nextStart, scheduledBoundary: oldLoop.delay / 1000 + 0.15,
            beforeStaleCallback, afterStaleCallback: starts.length };
    }, audioSource);
    expect(result.nextStart).toBeCloseTo(result.scheduledBoundary, 5);
    expect(result.afterStaleCallback).toBe(result.beforeStaleCallback);
});

test('audio recreates a closed context on the next sound', async ({ page }) => {
    await page.goto('/');
    const created = await page.evaluate(async source => {
        const contexts = [];
        const manager = new Function('window', 'document', source + ';return AudioManager;')({
            AudioContext: function() { const context = new AudioContext(); contexts.push(context); return context; }
        }, document);
        manager.SFX.buttonClick();
        await contexts[0].close();
        manager.SFX.buttonClick();
        await contexts[1].close();
        return contexts.length;
    }, audioSource);
    expect(created).toBe(2);
});

test('statistics reset surfaces a write failure and achievements refresh on entry', async ({ page }) => {
    await page.goto('/');
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
    await page.evaluate(() => {
        Stats.recordGame({ isWin: true, netScore: 10, finalScore: 1010, rounds: 1, mahjongType: 'guangdong' });
    });
    await page.getByRole('button', { name: '成就', exact: true }).click();
    await expect(page.locator('#achievements-grid .achievement-card.unlocked')).not.toHaveCount(0);
    const result = await page.evaluate(() => {
        const original = Storage.set;
        Storage.set = () => false;
        let error;
        try { Stats.resetStats(); } catch (failure) { error = failure.message; }
        Storage.set = original;
        return { error, games: Stats.getStats().totalGames };
    });
    expect(result.error).toBeTruthy();
    expect(result.games).toBe(1);
});

test('unimplemented regional mechanics are marked in the rule panel', async ({ page }) => {
    await page.goto('/');
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: /自定义/ }).click();
    await page.locator('[data-type="hangzhou"]').click();
    await expect(page.locator('.rule-option').filter({ hasText: '财神牌' })).toContainText('待实现');
    await expect(page.locator('.rule-option').filter({ hasText: '允许吃' })).toContainText('开启');
});

test('guest renders the host countdown without creating an autonomous turn timer', async ({ page }) => {
    await page.goto('/');
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
    await page.evaluate(async () => {
        await startGame({ mahjongType: 'guangdong', playerCount: 4, speed: 'instant', maxRounds: 1 });
        const hostEngine = App.engine;
        hostEngine.config.speed = 'normal';
        hostEngine.players[0].networkId = 'host';
        hostEngine.players[1].networkId = 'guest';
        hostEngine.startTimer(5000);
        const data = { state: buildNetworkStateFor('guest'), config: hostEngine.config };
        hostEngine.destroy();
        App.engine = null;
        App.isNetworkGame = true;
        App.network = { isHost: false, playerId: 'guest', players: [{ id: 'host', isHost: true }, { id: 'guest' }] };
        applyRemoteState(data);
    });
    await expect(page.locator('#turn-timer-display')).toBeVisible();
    await expect(page.locator('#turn-timer-value')).toHaveText('5');
    expect(await page.evaluate(() => App.engine.timer)).toBe(null);
});

test('service worker preserves unrelated caches and serves a complete game offline', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, serviceWorkers: 'allow' });
    try {
        const page = await context.newPage();
        await page.goto('/manifest.json');
        await page.evaluate(async () => {
            await caches.open('unrelated-app');
            await caches.open('mahjong-v-old');
            await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
        });
        await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes('mahjong-v-old'))).toBe(false);
        expect(await page.evaluate(() => caches.keys())).toContain('unrelated-app');
        await page.goto('/');
        await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
        await context.setOffline(true);
        await page.reload();
        await page.locator('#loading-screen').waitFor({ state: 'detached' });
        await page.getByRole('button', { name: /快速开始/ }).click();
        await expect(page.locator('#hand-bottom .mahjong-tile')).toHaveCount(14);
    } finally {
        await context.close();
    }
});

for (const [width, height] of [[1440, 900], [1280, 720], [390, 844], [375, 667], [844, 390], [667, 375]]) {
    test(`dense Taiwan table keeps all hands and discards clear of actions at ${width}x${height}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.goto('/');
        await page.locator('#loading-screen').waitFor({ state: 'detached' });
        await page.evaluate(() => startGame({ mahjongType: 'taiwan', playerCount: 4, speed: 'instant', maxRounds: 1 }));
        await expect(page.locator('#hand-bottom .mahjong-tile')).toHaveCount(17);
        await page.evaluate(() => {
            App.engine.pause();
            App.engine.discardPile = Array.from({ length: 80 }, (_, i) => Tiles.createTile('wan', i % 9 + 1));
            renderDiscardPile();
            ['chi', 'peng', 'gang', 'hu'].forEach(type => enableActionButtons({ type }));
        });
        await page.waitForTimeout(800);
        const layout = await page.evaluate(() => {
            const rect = selector => document.querySelector(selector).getBoundingClientRect();
            const top = rect('#player-top'), action = rect('#action-bar'), pile = rect('#discard-pile');
            const handOverflow = [...document.querySelectorAll('#hand-top .mahjong-tile')].some(tile => {
                const box = tile.getBoundingClientRect();
                return box.left < top.left - 1 || box.right > top.right + 1;
            });
            const bottom = rect('#hand-bottom');
            const selfHandOverflow = [...document.querySelectorAll('#hand-bottom .mahjong-tile')].some(tile => {
                const box = tile.getBoundingClientRect();
                return box.left < bottom.left - 1 || box.right > bottom.right + 1;
            });
            const overlap = Math.max(0, Math.min(action.right, pile.right) - Math.max(action.left, pile.left)) *
                Math.max(0, Math.min(action.bottom, pile.bottom) - Math.max(action.top, pile.top));
            document.getElementById('discard-pile').scrollTop = 0;
            return { handOverflow, selfHandOverflow, overlap, firstDiscardVisible: rect('#discard-pile .mahjong-tile').top >= pile.top,
                pileHasReadableWidth: pile.width >= 80 };
        });
        expect(layout).toEqual({ handOverflow: false, selfHandOverflow: false, overlap: 0, firstDiscardVisible: true, pileHasReadableWidth: true });
    });
}
