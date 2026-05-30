/**
 * Node.js 环境下运行规则测试
 * cd 项目根目录 && node test/rules-test-node.js
 */
const fs = require('fs');
const path = require('path');

// 模拟 Utils
globalThis.Utils = {
    uuid: () => Math.random().toString(36).slice(2) + Date.now().toString(36),
    shuffle: (arr) => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }
};

// 加载 Tiles
const Tiles = (new Function(
    fs.readFileSync(path.join(__dirname, '../js/core/tiles.js'), 'utf8') + '\n;return Tiles;'
))();

// 加载 Rules
const Rules = (new Function('Tiles',
    fs.readFileSync(path.join(__dirname, '../js/core/rules.js'), 'utf8') + '\n;return Rules;'
))(Tiles);

// 加载测试并运行
const testCode = fs.readFileSync(path.join(__dirname, 'rules-test.js'), 'utf8');
// 覆盖 renderResults 避免 DOM 操作
eval(testCode.replace(
    /function renderResults\(\) \{[\s\S]*?\n    \}/,
    `function renderResults() {
        console.log('\\n========== 规则系统一致性测试 ==========');
        console.log('✅ 通过: ' + passCount);
        console.log('❌ 失败: ' + failCount);
        results.forEach(r => {
            console.log((r.ok ? '✅' : '❌') + ' ' + r.name + (r.detail ? ' | ' + r.detail : ''));
        });
        if (failCount > 0) process.exit(1);
    }`
));
