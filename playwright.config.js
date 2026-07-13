const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './test/e2e',
    timeout: 30_000,
    fullyParallel: false,
    workers: 1,
    reporter: 'dot',
    use: {
        baseURL: 'http://127.0.0.1:4173',
        headless: true,
        serviceWorkers: 'block',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure'
    },
    webServer: {
        command: 'python3 -m http.server 4173 --bind 127.0.0.1',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: true,
        timeout: 10_000,
        stdout: 'ignore',
        stderr: 'ignore'
    }
});
