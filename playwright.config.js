const { defineConfig } = require('@playwright/test');

const requestedPort = Number.parseInt(process.env.PLAYWRIGHT_PORT, 10);
const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65536
    ? requestedPort
    : 4173;

module.exports = defineConfig({
    testDir: './test/e2e',
    timeout: 30_000,
    fullyParallel: false,
    workers: 1,
    reporter: 'dot',
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        headless: true,
        serviceWorkers: 'block',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure'
    },
    webServer: {
        command: `python3 -m http.server ${port} --bind 127.0.0.1`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: false,
        timeout: 10_000,
        stdout: 'ignore',
        stderr: 'ignore'
    }
});
