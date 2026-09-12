const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

let server, origin, networkDown = false, upgradeRevision = 'old';
const root = path.resolve(__dirname, '../..');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.md': 'text/plain' };

test.beforeAll(async () => {
    server = http.createServer(async (req, res) => {
        if (networkDown) { req.socket.destroy(); return; }
        const url = new URL(req.url, 'http://localhost');
        const match = url.pathname.match(/^\/(Mahjong-Webgame|Other-Mahjong|Upgrade-Mahjong)\/(.*)$/);
        if (!match) { res.writeHead(404).end(); return; }
        const file = path.resolve(root, match[2] || 'index.html');
        if (!file.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
        try {
            let body = await fs.readFile(file);
            if (match[1] === 'Upgrade-Mahjong') {
                if (match[2] === 'sw.js') body = Buffer.from(body.toString().replace(/v\d+/g, upgradeRevision === 'old' ? 'v1001' : 'v1002'));
                if (match[2] === 'js/main.js') body = Buffer.from(body + `\nwindow.__pagesBuild = '${upgradeRevision}';`);
            }
            res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
                'Cache-Control': match[2] === 'sw.js' ? 'no-store' : 'public, max-age=3600' });
            res.end(body);
        } catch { res.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterEach(() => { networkDown = false; });

test.afterAll(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
});

async function waitForWorker(page) {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test('project Pages paths load every asset and support offline play with a query URL', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    try {
        const page = await context.newPage();
        const errors = [], failed = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
        await page.goto(origin + '/Mahjong-Webgame/');
        await page.locator('#loading-screen').waitFor({ state: 'detached' });
        await waitForWorker(page);
        const manifest = await page.evaluate(async () => {
            const url = new URL(document.querySelector('link[rel="manifest"]').href);
            const data = await (await fetch(url)).json();
            return { start: new URL(data.start_url, url).pathname, scope: new URL(data.scope, url).pathname };
        });
        expect(manifest).toEqual({ start: '/Mahjong-Webgame/', scope: '/Mahjong-Webgame/' });
        networkDown = true;
        await expect(fetch(origin + '/Mahjong-Webgame/uncached-check')).rejects.toThrow();
        await page.goto(origin + '/Mahjong-Webgame/?installed=1');
        await page.locator('#loading-screen').waitFor({ state: 'detached' });
        await page.getByRole('button', { name: /快速开始/ }).click();
        await expect(page.locator('#hand-bottom .mahjong-tile')).toHaveCount(14);
        expect(errors).toEqual([]);
        expect(failed).toEqual([]);
    } finally { await context.close(); }
});

test('two Pages projects keep independent offline caches', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    try {
        const page = await context.newPage();
        await page.goto(origin + '/Other-Mahjong/');
        await waitForWorker(page);
        const firstCaches = await page.evaluate(() => caches.keys());
        await page.goto(origin + '/Mahjong-Webgame/');
        await waitForWorker(page);
        const nextCaches = await page.evaluate(() => caches.keys());
        expect(nextCaches.length).toBeGreaterThan(firstCaches.length);
        firstCaches.forEach(name => expect(nextCaches).toContain(name));
        networkDown = true;
        await page.goto(origin + '/Other-Mahjong/');
        await page.locator('#loading-screen').waitFor({ state: 'detached' });
        await page.getByRole('button', { name: /快速开始/ }).click();
        await expect(page.locator('#hand-bottom .mahjong-tile')).toHaveCount(14);
    } finally { await context.close(); }
});

test('another project cache cannot replace the deployed game scripts', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    try {
        const page = await context.newPage();
        await page.goto(origin + '/Mahjong-Webgame/manifest.json');
        await page.evaluate(async () => {
            const cache = await caches.open('another-project');
            await cache.put(new URL('js/main.js', location.href), new Response('window.__foreignScript = true;',
                { headers: { 'Content-Type': 'application/javascript' } }));
        });
        await page.goto(origin + '/Mahjong-Webgame/');
        await waitForWorker(page);
        await page.reload();
        expect(await page.evaluate(() => !!window.__foreignScript)).toBe(false);
        await page.locator('#loading-screen').waitFor({ state: 'detached' });
    } finally { await context.close(); }
});

test('a Pages update installs fresh assets despite a warm HTTP cache', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    upgradeRevision = 'old';
    try {
        const page = await context.newPage();
        await page.goto(origin + '/Upgrade-Mahjong/');
        await waitForWorker(page);
        expect(await page.evaluate(() => window.__pagesBuild)).toBe('old');
        upgradeRevision = 'new';
        await page.evaluate(async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            await new Promise(async (resolve, reject) => {
                navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
                try { await registration.update(); } catch (error) { reject(error); }
            });
        });
        await page.reload();
        expect(await page.evaluate(() => window.__pagesBuild)).toBe('new');
    } finally { await context.close(); }
});

async function openHttpsLobby(page, request) {
    await page.route('https://pages.test/**', async route => {
        const url = new URL(route.request().url());
        await route.fulfill({ response: await request.get(origin + url.pathname) });
    });
    await page.goto('https://pages.test/Mahjong-Webgame/');
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: /局域网联机/ }).click();
}

test('HTTPS hosting explains the signal server requirement and rejects mixed content before requesting it', async ({ page, request }) => {
    await openHttpsLobby(page, request);
    await expect(page.locator('#network-config .config-hint')).toContainText('HTTPS');
    const requests = [];
    page.on('request', req => { if (req.url().startsWith('http://192.168.1.20')) requests.push(req.url()); });
    await page.locator('#signal-server').fill('http://192.168.1.20:8081');
    await page.locator('#btn-connect-server').click();
    await expect(page.locator('#network-error')).toContainText('HTTPS');
    await expect(page.locator('#conn-status')).toContainText('未连接');
    expect(requests).toEqual([]);
});

test('switching to an unreachable server clears the old reachable state', async ({ page }) => {
    await page.goto(origin + '/Mahjong-Webgame/');
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: /局域网联机/ }).click();
    await page.evaluate(() => {
        App.networkServerReachable = true;
        App.network.discoverRooms = async () => { throw new Error('unreachable'); };
    });
    await page.locator('#signal-server').fill('http://127.0.0.1:1');
    await page.locator('#btn-connect-server').click();
    await expect(page.locator('#conn-status')).toContainText('未连接');
    expect(await page.evaluate(() => canUseSignalServer())).toBe(false);
});

test('an HTTPS signal server under a proxy path can connect', async ({ page, request }) => {
    await openHttpsLobby(page, request);
    await page.route('https://signal.test/api/rooms', route => route.fulfill({ json: { rooms: [] } }));
    await page.locator('#signal-server').fill('https://signal.test/api/');
    await page.locator('#btn-connect-server').click();
    await expect(page.locator('#conn-status')).toContainText('已连接');
    expect(await page.evaluate(() => App.network.serverUrl)).toBe('https://signal.test/api');
    expect(await page.evaluate(() => canUseSignalServer())).toBe(true);
});

test('a late connection response cannot mark a different server reachable', async ({ page }) => {
    await page.goto(origin + '/Mahjong-Webgame/');
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: /局域网联机/ }).click();
    await page.evaluate(() => { App.network.discoverRooms = () => new Promise(resolve => { window.__finishConnection = resolve; }); });
    await page.locator('#signal-server').fill('https://old-signal.test');
    await page.locator('#btn-connect-server').click();
    await expect(page.locator('#btn-connect-server')).toBeDisabled();
    await page.locator('#signal-server').fill('https://new-signal.test');
    await page.locator('#network-lobby-back').click();
    await page.getByRole('button', { name: /局域网联机/ }).click();
    await page.evaluate(() => window.__finishConnection([]));
    await expect(page.locator('#btn-connect-server')).toBeEnabled();
    expect(await page.evaluate(() => App.network.serverUrl)).toBe('https://new-signal.test');
    expect(await page.evaluate(() => canUseSignalServer())).toBe(false);
    await expect(page.locator('#conn-status')).toContainText('未连接');
});
