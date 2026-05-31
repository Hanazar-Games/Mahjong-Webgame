# 万能麻将 — 可直接落地的升级方案（基于审计校准版）

> 本方案直接对标《端到端审计报告》中的 80 项问题，将「修复缺陷」与「体验升级」融合为同一套迭代路线。每一行都有明确文件位置、验收标准和可执行动作。

---

## 一、核心问题（审计映射版）

### 🔴 致命级：不修复则产品不可用

| 编号 | 问题 | 审计ID | 用户感知 |
|------|------|--------|---------|
| F1 | 引擎 `destroy()` 不取消异步 → 快速重开/退出必崩 | C4, C5 | 点「再来一局」卡死或控制台报错 |
| F2 | 网络对战远程 claim（吃碰杠胡）被错误拒绝 | C7 | P2P 模式完全不可用 |
| F3 | 四川麻将缺门规则实现错误（副露不检查+可碰缺门花色） | C8 | 四川玩家发现「可以碰缺门牌」，规则感崩塌 |
| F4 | 信令服务器 `/send` 任意类型注入 | C1 | 安全隐患，局域网房间可被外部劫持 |
| F5 | P2P DataChannel/SSE 多组竞态 | C9-C12 | 联机时掉线、重连失败、状态不同步 |

### 🟠 严重级：大幅折损体验与留存

| 编号 | 问题 | 审计ID | 用户感知 |
|------|------|--------|---------|
| F6 | `rules.js` 胡牌判断无记忆化 + AI 340+次重复计算 | C15, H19 | 低端机 AI 回合卡顿 300-500ms |
| F7 | 主程序 `main.js` 2999行上帝文件 | H14 等 | 任何 UI 改动都牵一发而动全身，迭代速度极慢 |
| F8 | 全量 DOM 重建（每摸一张牌清空重建手牌） | H14 | 低端机掉帧，操作不跟手 |
| F9 | CSS 4152 行互相覆盖，主题系统残缺 | H23, M20 | 切主题时颜色冲突，视觉廉价感 |
| F10 | 游戏内信息黑盒（无向听/听牌/dora/缺门提示） | — | 新手完全不知道「为什么还没胡」「该打哪张」 |
| F11 | 无 PWA / 无移动端响应式 / 无安全区适配 | H24 等 | iPhone 上按钮被 Home 条遮挡，无法添加到主屏 |
| F12 | 测试体系形同虚设（mock 测试自己、无断言、弱断言） | H20-H22 | 代码回归无保护，每改一行都怕踩雷 |

### 🟡 拖累级：长期积累成技术债

| 编号 | 问题 | 审计ID | 用户感知 |
|------|------|--------|---------|
| F13 | `checkActions` 单一动作限制：AI 拒绝胡后失去碰杠吃机会 | C18 | Expert AI 偶尔「发呆」不碰明显该碰的牌 |
| F14 | 七对判断允许「四张=两对」 | C16 | 极少数牌型胡牌判定与标准规则不符 |
| F15 | 音频系统 GC 压力 + BGM 节拍漂移 | H18, M16 | 长时间游戏后音效延迟或卡顿 |
| F16 | 无教程/引导、番数计算不透明 | — | 新用户首次流失率极高 |
| F17 | 无每日挑战/无分享/无社交 | — | 玩家无回访动力，无病毒传播 |

---

## 二、设计方向

### 产品定位
> **从「能玩的麻将模拟器」→「随时随地、规则精准、视觉沉浸的国民级浏览器麻将」**

### 设计原则

| 维度 | 原则 | 落地指标 |
|------|------|---------|
| **功能正确性** | 规则即法律 | 14 种麻将每种的核心规则（尤其是四川缺门、国标起胡）100% 符合地方标准 |
| **稳定性** | 崩溃率 < 0.1% | 快速重开/退出/切换模式 100 次无 console 报错 |
| **性能** | 低端机可玩 | Moto G7 级别设备 AI 回合 < 50ms，游戏全程 60fps |
| **可维护性** | 模块化、可测试 | `main.js` 拆分为 6+ 模块，核心逻辑单元测试覆盖率 > 70% |
| **信息架构** | 降低认知门槛 | 游戏内实时显示向听数、听牌张、dora、缺门进度 |
| **视觉** | 质感优先于炫技 | SVG 牌面纹理、4 种高质量牌桌材质、统一的 HSL 主题系统 |
| **交互** | 反馈 < 100ms | 点击→选中→打出全流程有触觉/视觉/声音三重反馈 |
| **移动端** | 触控原生体验 | 滑动出牌、底部安全区避让、PWA 全屏、响应式牌尺寸 |
| **商业** | 留存>拉新 | 每日挑战+等级+成就+分享卡片，形成闭环 |

---

## 三、优先级路线图（8周落地）

```
Week 1-2  根基重建     → 不崩 + 不卡 + 规则对
Week 3-4  信息+交互    → 看得懂 + 打得顺
Week 5-6  视觉+PWA     → 好看 + 好用（移动端）
Week 7-8  商业闭环     → 想回来 + 想分享
```

---

## 四、具体改造建议（按模块）

### 模块 A：引擎稳定性（Week 1 核心）

#### A1. 引入 CancelToken 消灭竞态

**对标审计**：C4, C5, H11

```javascript
// js/utils/helpers.js 新增
Utils.CancelToken = class CancelToken {
    constructor() { this._cancelled = false; this._cbs = []; }
    get isCancelled() { return this._cancelled; }
    cancel() { this._cancelled = true; this._cbs.forEach(cb => cb()); this._cbs = []; }
    onCancel(cb) { this._cancelled ? cb() : this._cbs.push(cb); }
    throwIfCancelled() { if (this._cancelled) throw new Error('CANCELLED'); }
};

Utils.sleep = function(ms, token) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        token?.onCancel(() => { clearTimeout(timer); reject(new Error('CANCELLED')); });
    });
};
```

**引擎改造**：
- `constructor()` 中 `this._token = new Utils.CancelToken()`
- `destroy()` 中 `this._token.cancel(); this._token = new Utils.CancelToken()`
- 所有 `await Utils.sleep(...)` 改为 `await Utils.sleep(..., this._token)`
- `aiTurn()` / `dealTiles()` / `endRound()` 的 sleep 调用点加 `try/catch`，捕获 `CANCELLED` 后静默返回

**验收**：连续快速开始→退出→重新开始 50 次，console 零报错。

---

#### A2. Timer 防失效闭包

**对标审计**：C5

```javascript
startTimer() {
    this.stopTimer();
    if (this.config.speed === 'instant' || this.state === 'destroyed') return;
    const token = this._token; // 捕获当前 token
    this.timer = setTimeout(async () => {
        if (token.isCancelled || this.state === 'destroyed') return;
        if (this.state !== 'playing') return;
        // ... 原有逻辑
    }, this.turnTimeout);
}
```

---

#### A3. `getState()` 深拷贝

**对标审计**：C6

```javascript
getState() {
    return {
        state: this.state,
        config: Utils.deepClone(this.config),
        discardPile: [...this.discardPile],
        lastDiscard: this.lastDiscard,
        players: this.players.map(p => p.toJSON()),
        // ...
    };
}
```

---

#### A4. 四川麻将缺门规则修复

**对标审计**：C8

```javascript
// engine.js: checkQueYiMenComplete 修复
checkQueYiMenComplete(player) {
    if (!player.queYiMen) return true;
    const inHand = player.hand.some(t => t.suit === player.queYiMen);
    const inMelds = player.melds.some(m => m.tiles.some(t => t.suit === player.queYiMen));
    return !inHand && !inMelds;
}

// engine.js: checkActions 中 chi/peng/gang 前增加过滤
if (this.ruleConfig.queYiMen && tile.suit === player.queYiMen) {
    return null; // 不能吃/碰/杠缺门花色的牌
}
```

---

#### A5. `checkActions` 返回多动作 + AI 逐项决策

**对标审计**：C18

```javascript
checkActions(player, tile, isNextPlayer) {
    const actions = [];
    // 胡
    const winResult = Rules.canWin([...player.hand, tile], this.ruleConfig);
    if (winResult.canWin && !(this.ruleConfig.queYiMen && !this.checkQueYiMenComplete(player))) {
        actions.push({ type: 'hu', winInfo: winResult, priority: 4 });
    }
    // 杠
    if (Rules.canGang(player.hand, tile, this.ruleConfig)) {
        actions.push({ type: 'gang', priority: 3 });
    }
    // 碰（若已杠则不碰）
    if (actions.every(a => a.type !== 'gang') && Rules.canPeng(player.hand, tile, this.ruleConfig)) {
        actions.push({ type: 'peng', priority: 2 });
    }
    // 吃
    if (isNextPlayer && this.ruleConfig.allowChi !== false) {
        const chiOptions = Rules.canChi(player.hand, tile, this.ruleConfig);
        if (chiOptions.length > 0) {
            actions.push({ type: 'chi', options: chiOptions, priority: 1 });
        }
    }
    return actions; // 返回数组
}
```

`waitForActions` 中 AI 对数组逐项用 `shouldAction` 决策，取第一个愿意执行的动作。

---

### 模块 B：性能革命（Week 1-2）

#### B1. 胡牌判断 LRU 缓存

**对标审计**：C15

```javascript
// rules.js 模块顶部
const winCache = new Map();
const WIN_CACHE_LIMIT = 5000;

function getHandSignature(hand) {
    // hand 已排序
    return hand.map(t => `${t.suit[0]}${t.value}`).join(',');
}

function canWin(hand, config) {
    const sig = getHandSignature(sortTiles(hand)) + '|' + (config.mahjongType || '');
    if (winCache.has(sig)) return winCache.get(sig);
    const result = _canWinUncached(hand, config);
    if (winCache.size >= WIN_CACHE_LIMIT) {
        const first = winCache.keys().next().value;
        winCache.delete(first);
    }
    winCache.set(sig, result);
    return result;
}
```

**预期收益**：AI 决策中重复手牌判断减少 90%+。

---

#### B2. 向听数模块缓存

**对标审计**：H19

```javascript
// ai-utils.js 内部
const shantenCache = new Map();
const SHANTEN_CACHE_LIMIT = 10000;

function _handSignature(hand) {
    const counts = {};
    for (const t of hand) counts[`${t.suit}-${t.value}`] = (counts[`${t.suit}-${t.value}`] || 0) + 1;
    return Object.entries(counts).sort().map(([k,v])=>`${k}:${v}`).join(',');
}

function calculateStandardShanten(hand, melds = []) {
    const sig = _handSignature(hand) + '|' + melds.length;
    if (shantenCache.has(sig)) return shantenCache.get(sig);
    const result = _calculateStandardShantenUncached(hand, melds);
    if (shantenCache.size >= SHANTEN_CACHE_LIMIT) {
        const first = shantenCache.keys().next().value;
        shantenCache.delete(first);
    }
    shantenCache.set(sig, result);
    return result;
}
```

---

#### B3. 增量 DOM 渲染

**对标审计**：H14

```javascript
// js/game/renderer.js（新文件）
const HandRenderer = {
    _last: new Map(), // playerIndex -> tileId[]

    render(playerIndex, hand, options) {
        const container = document.getElementById(`hand-${getPositionName(playerIndex)}`);
        if (!container) return;
        const lastIds = this._last.get(playerIndex) || [];
        const currIds = hand.map(t => t.id);
        if (JSON.stringify(lastIds) === JSON.stringify(currIds)) return; // 完全无变化

        // 找最长公共前缀（麻将手牌有序，尾部变化最频繁）
        let same = 0;
        while (same < lastIds.length && same < currIds.length && lastIds[same] === currIds[same]) same++;

        while (container.children.length > same) container.lastChild.remove();
        for (let i = same; i < hand.length; i++) {
            container.appendChild(UIComponents.createTileElement(hand[i], options));
        }
        this._last.set(playerIndex, currIds);
    },

    invalidate(playerIndex) {
        if (playerIndex !== undefined) this._last.delete(playerIndex);
        else this._last.clear();
    }
};
```

---

### 模块 C：`main.js` 拆分（Week 2）

**对标审计**：H14（2999 行上帝文件）

**拆分方案**（保持零构建工具，使用 IIFE 全局模块）：

```
js/
├── main.js              ← 入口：init + 路由胶水（~300行）
├── app/
│   ├── state.js         ← App 全局状态（~100行）
│   ├── router.js        ← 屏幕切换（~80行）
│   └── settings.js      ← 设置读写（~150行）
├── game/
│   ├── renderer.js      ← 增量渲染器（~300行）
│   ├── input.js         ← 点击/拖拽/键盘（~350行）
│   ├── hud.js           ← 向听/听牌/dora HUD（~200行）
│   └── effects.js       ← 特效触发（~150行）
├── network/
│   └── lobby.js         ← 网络大厅 UI 逻辑（~250行）
├── replay/
│   └── player.js        ← 回放播放器（~350行）
└── ui/
    └── screens.js       ← 统计/成就/自定义模式（~250行）
```

**迁移策略**：
1. 新建文件，从 `main.js` 中剪切函数粘贴过去
2. 每个新模块用 IIFE 暴露全局对象（如 `GameRenderer`, `GameInput`, `GameHUD`）
3. `main.js` 变为胶水层，只保留事件绑定和跨模块协调
4. **不删除 `main.js` 原内容**，先注释后删除，确保随时可回滚

---

### 模块 D：网络对战修复（Week 2）

**对标审计**：C7, C9-C12, H1-H4, H7, H9

#### D1. 远程 claim 动作修复

```javascript
// main.js handleRemotePlayerAction 修复
async function handleRemotePlayerAction(type, fromPlayerId, data) {
    const net = App.network;
    const engine = App.engine;
    const playerIdx = net.players.findIndex(p => p.id === fromPlayerId);
    if (playerIdx === -1) return;
    const player = engine.players[playerIdx];

    switch (type) {
        case 'chi':
        case 'peng':
        case 'gang':
        case 'hu': {
            // claim 动作：校验 pendingAction 匹配，而非 currentPlayerIndex
            const pa = engine.pendingAction;
            if (!pa || pa.player.position !== playerIdx || pa.action.type !== type) {
                console.warn('Remote claim mismatch');
                return;
            }
            await engine.executeAction(player, pa.action);
            break;
        }
        case 'discard': {
            // 回合动作：必须当前玩家
            if (engine.currentPlayerIndex !== playerIdx) return;
            await engine.playerDiscard(data.tileId);
            break;
        }
        // ...
    }
    broadcastGameState();
}
```

#### D2. 信令服务器加固

```javascript
// server/signaling-server.js:242-258
const ALLOWED_TYPES = ['message', 'sdp-offer', 'sdp-answer', 'ice-candidate', 'playerJoined', 'playerLeft', 'gameStart'];
if (!ALLOWED_TYPES.includes(body.type)) {
    jsonResponse(res, 403, { error: 'Invalid message type' });
    return;
}

// server/signaling-server.js:30-40
function readBody(req, maxSize = 65536) {
    return new Promise((resolve, reject) => {
        let body = '';
        let length = 0;
        req.on('data', chunk => {
            length += chunk.length;
            if (length > maxSize) { req.destroy(); reject(new Error('Body too large')); return; }
            body += chunk;
        });
        req.on('end', () => { ... });
        req.on('error', reject);
    });
}

// server/signaling-server.js:260-275
const p = players.get(body.playerId);
if (!p || !p.isHost || p.roomId !== roomId) { jsonResponse(res, 403, ...); return; }
```

#### D3. P2P 竞态修复

```javascript
// p2p.js: _startSSE 增加 generation 防护
_startSSE() {
    const gen = ++this._sseGen;
    if (this.sse) { try { this.sse.close(); } catch (e) {} this.sse = null; }
    const sse = new EventSource(url);
    this.sse = sse;
    sse.onopen = () => { if (gen !== this._sseGen) return; this.connected = true; ... };
    sse.onerror = () => { if (gen !== this._sseGen) return; ... };
}

// p2p.js: leaveRoom 清理重连定时器
async leaveRoom() {
    clearTimeout(this.sseReconnectTimer);
    this.sseReconnectTimer = null;
    // ... 原有逻辑
}
```

---

### 模块 E：游戏内信息 HUD（Week 3）

**对标问题**：F10（信息黑盒）

#### E1. 实时信息面板

在 `#game-screen` 中新增半透明 HUD 层：

```html
<!-- index.html 中 game-screen 内新增 -->
<div id="game-hud" class="game-hud">
    <div class="hud-section">
        <span class="hud-label">向听</span>
        <span id="hud-shanten" class="hud-value">—</span>
    </div>
    <div class="hud-section">
        <span class="hud-label">听牌</span>
        <span id="hud-tingpai" class="hud-value">—</span>
    </div>
    <div class="hud-section" id="hud-dora-wrap">
        <span class="hud-label">Dora</span>
        <span id="hud-dora" class="hud-tiles"></span>
    </div>
    <div class="hud-section" id="hud-que-wrap" style="display:none">
        <span class="hud-label">缺门</span>
        <span id="hud-que" class="hud-value">—</span>
    </div>
</div>
```

```javascript
// js/game/hud.js
const GameHUD = {
    update(engine) {
        const player = engine.players[0];
        if (!player) return;
        const config = engine.ruleConfig;

        // 向听数
        const shanten = AIUtils.calculateShanten(player.hand, player.melds, config);
        const shantenEl = document.getElementById('hud-shanten');
        shantenEl.textContent = shanten < 0 ? '和了' : shanten === 0 ? '听牌' : shanten;
        shantenEl.className = 'hud-value ' + (shanten <= 0 ? 'tenpai' : '');

        // 听牌张
        const tingPai = shanten === 0 ? Rules.analyzeTingPai(player.hand, config) : [];
        document.getElementById('hud-tingpai').textContent = tingPai.length > 0
            ? tingPai.map(tp => tp.tile.shortName).join(' ')
            : '—';

        // Dora
        const doraContainer = document.getElementById('hud-dora');
        doraContainer.innerHTML = '';
        for (const d of engine.doraIndicators || []) {
            doraContainer.appendChild(UIComponents.createTileElement(d, { small: true }));
        }

        // 缺门
        if (player.queYiMen) {
            const remaining = player.hand.filter(t => t.suit === player.queYiMen).length;
            const names = { wan: '万', tong: '筒', tiao: '条' };
            document.getElementById('hud-que').textContent = `${names[player.queYiMen]}(剩${remaining})`;
            document.getElementById('hud-que-wrap').style.display = '';
        }
    }
};
```

在 `main.js` 的 `bindEngineEvents` 中，每次 `turnStart` / `draw` / `discard` 后调用 `GameHUD.update(App.engine)`。

---

#### E2. 番数明细弹窗

改造 `showHuResult`：

```javascript
function showHuResult(data) {
    const fanRows = (data.fan?.fans || []).map(f => `
        <div class="fan-row">
            <span>${Utils.escapeHtml(f.name)}</span>
            <span class="fan-bar" style="width:${Math.min(100, f.fan * 8)}%"></span>
            <span>${f.fan}番</span>
        </div>
    `).join('');

    UIComponents.createModal(
        data.isZiMo ? '🎉 自摸!' : '🎉 胡牌!',
        `<div class="hu-detail">
            <div class="hu-score">+${data.score || 0} 分 · 共 ${data.fan?.total || 0} 番</div>
            <div class="fan-list">${fanRows}</div>
        </div>`,
        [{ text: '确定' }]
    );
}
```

---

### 模块 F：移动端+PWA（Week 5-6）

#### F1. 响应式牌尺寸

```css
/* css/game.css */
.mahjong-tile {
    width: clamp(36px, 8vmin, 56px);
    height: clamp(50px, 11vmin, 78px);
    font-size: clamp(1.4rem, 3vmin, 2.2rem);
}

.player-area.bottom .hand-area {
    gap: clamp(1px, 0.4vmin, 4px);
    padding-bottom: max(8px, env(safe-area-inset-bottom));
}

.action-bar {
    bottom: max(16px, env(safe-area-inset-bottom));
}

/* 小屏横屏 */
@media (max-height: 500px) and (orientation: landscape) {
    .game-table {
        grid-template-rows: 70px 1fr 110px;
        grid-template-columns: 70px 1fr 70px;
    }
}
```

#### F2. PWA 化

新增 `manifest.json`：

```json
{
    "name": "万能麻将",
    "short_name": "麻将",
    "start_url": ".",
    "display": "standalone",
    "background_color": "#1a3a1a",
    "theme_color": "#1a3a1a",
    "icons": [{ "src": "icon-192.png", "sizes": "192x192" }]
}
```

新增 `sw.js`（离线缓存静态资源）：

```javascript
const CACHE_NAME = 'mahjong-v1';
const urlsToCache = ['/', '/index.html', '/css/main.css', '/css/game.css', ...];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(urlsToCache))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
```

`index.html` 头部增加：

```html
<link rel="manifest" href="manifest.json">
<meta name="theme-color" content="#1a3a1a">
<meta name="apple-mobile-web-app-capable" content="yes">
```

---

### 模块 G：视觉升级（Week 5-6）

#### G1. SVG 牌面纹理

用脚本生成 34 种基本牌 + 1 种背面的 SVG（data URI 内联到 CSS）：

```css
.mahjong-tile[data-suit="wan"][data-value="1"] {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 50 70'%3E%3Crect x='1' y='1' width='48' height='68' rx='4' fill='%23fdfbf7' stroke='%23b8a878'/%3E%3Ctext x='25' y='42' text-anchor='middle' font-size='22' fill='%23c41e3a'%3E一%3C/text%3E%3Ctext x='25' y='58' text-anchor='middle' font-size='10' fill='%23c41e3a'%3E万%3C/text%3E%3C/svg%3E");
    background-size: cover;
}
/* ... 33 more */
```

保留 Unicode 作为 `textContent` fallback（`background-image` 覆盖在文字层上方）。

#### G2. CSS 主题系统重构

```css
/* css/themes.css 重写 */
:root {
    --bg-primary: #1a3a1a;
    --bg-secondary: #2d5a2d;
    --bg-card: #3d6b3d;
    --accent-h: 45; --accent-s: 60%; --accent-l: 55%;
    --accent: hsl(var(--accent-h), var(--accent-s), var(--accent-l));
    --accent-light: hsl(var(--accent-h), var(--accent-s), calc(var(--accent-l) + 15%));
    --accent-dark: hsl(var(--accent-h), var(--accent-s), calc(var(--accent-l) - 15%));
}

[data-theme="dark-blue"] {
    --bg-primary: #0a1a2a;
    --bg-secondary: #1a3a5a;
    --bg-card: #2a4a6a;
    --accent-h: 210;
}

[data-theme="wood"] {
    --bg-primary: #3a2a1a;
    --bg-secondary: #5a4a3a;
    --accent-h: 30;
}
```

所有硬编码颜色改为 CSS 变量引用。

---

### 模块 H：商业闭环（Week 7-8）

#### H1. 每日挑战系统

```javascript
// js/data/daily.js（新文件）
const DailyChallenges = {
    generate() {
        const pool = [
            { id: 'win_1', text: '今日 win 1 局', reward: 30, check: (s) => s.todayWins >= 1 },
            { id: 'zi_mo', text: '自摸 1 次', reward: 20, check: (s) => s.todayZiMo >= 1 },
            { id: 'gang', text: '杠牌 2 次', reward: 15, check: (s) => s.todayGang >= 2 },
            { id: 'qing_yi_se', text: '胡出清一色', reward: 50, check: (s) => s.todayQingYiSe },
        ];
        return Utils.shuffle(pool).slice(0, 3);
    },
    getToday() { return Storage.get('daily_challenges') || this.reset(); },
    reset() { const ch = this.generate(); Storage.set('daily_challenges', { date: new Date().toDateString(), challenges: ch }); return ch; }
};
```

主菜单显示今日任务进度条。

#### H2. 对局分享卡片

使用 `html2canvas` 或原生 Canvas API 生成结算页截图：

```javascript
async function generateShareCard(resultData) {
    const canvas = document.createElement('canvas');
    canvas.width = 800; canvas.height = 450;
    const ctx = canvas.getContext('2d');
    // 绘制背景、牌桌纹理、分数、排名
    ctx.fillStyle = '#1a3a1a'; ctx.fillRect(0, 0, 800, 450);
    ctx.fillStyle = '#d4a843'; ctx.font = 'bold 48px sans-serif';
    ctx.fillText(resultData.isWin ? '胜利!' : '对局结束', 320, 80);
    // ... 绘制玩家分数条
    return canvas.toDataURL('image/png');
}
```

浏览器调用 `navigator.share({ files: [file] })` 或下载图片。

#### H3. 新手引导浮层

```javascript
const Tutorial = {
    steps: [
        { target: '#hand-bottom', text: '这是你的手牌，点击选中，再次点击打出', position: 'top' },
        { target: '#hud-shanten', text: '向听数 = 距离听牌还差几张有效牌', position: 'bottom' },
        { target: '#btn-peng', text: '有人打出你能碰的牌时，按钮会亮起', position: 'left' },
    ],
    start() { this.showStep(0); },
    showStep(i) {
        const s = this.steps[i];
        const el = document.querySelector(s.target);
        // 高亮 el，显示气泡文字，底部「下一步」按钮
    }
};
```

首次进入游戏自动触发，`Storage.set('tutorial_seen', true)` 标记已看过。

---

## 五、可执行任务清单

### Week 1：根基重建（稳定性+性能）

| # | 任务 | 文件 | 工时 | 验收标准 |
|---|------|------|------|---------|
| 1.1 | 实现 CancelToken + 改造 Utils.sleep | `helpers.js` | 2h | `destroy()` 后旧 sleep 立即 reject |
| 1.2 | 引擎接入 CancelToken | `engine.js` | 3h | 快速重开 50 次零报错 |
| 1.3 | Timer 防失效闭包 | `engine.js` | 1h | destroy 后 timer 不触发 |
| 1.4 | getState 深拷贝 | `engine.js` | 1h | 外部修改返回对象不影响引擎 |
| 1.5 | 修复四川缺门规则 | `engine.js` | 2h | 四川模式不可碰/杠缺门花色 |
| 1.6 | checkActions 返回多动作 | `engine.js` | 3h | AI 可拒绝胡后选择碰 |
| 1.7 | rules.js 胡牌 LRU 缓存 | `rules.js` | 2h | 同手牌第二次 canWin < 1ms |
| 1.8 | ai-utils 向听数缓存 | `ai-utils.js` | 2h | AI 决策时间减少 50% |
| 1.9 | 增量 DOM 渲染 | 新建 `renderer.js` | 4h | Moto G 不掉帧 |
| 1.10 | main.js 拆分（第一批）| `main.js` + 新文件 | 4h | 原有功能无回归 |

### Week 2：网络+架构

| # | 任务 | 文件 | 工时 | 验收标准 |
|---|------|------|------|---------|
| 2.1 | 修复远程 claim 动作 | `main.js` | 2h | P2P 模式下客户端可碰/杠/胡 |
| 2.2 | 信令服务器加固 | `signaling-server.js` | 3h | 渗透测试通过（类型注入/CSRF/DoS）|
| 2.3 | P2P SSE 竞态修复 | `p2p.js` | 2h | 断网重连 10 次无异常 |
| 2.4 | main.js 拆分（第二批）| 新文件 | 4h | 所有游戏逻辑迁出 main.js |
| 2.5 | 规则测试补全 | `rules-test-node.js` | 3h | 覆盖负向测试+多动作交互 |
| 2.6 | 引擎单元测试 | 新建 `engine-test.js` | 4h | 覆盖 start→deal→discard→hu 完整流程 |

### Week 3-4：信息+交互

| # | 任务 | 文件 | 工时 | 验收标准 |
|---|------|------|------|---------|
| 3.1 | HUD 信息面板 | `hud.js` + `index.html` | 4h | 实时显示向听/听牌/dora/缺门 |
| 3.2 | 番数明细弹窗 | `main.js` | 2h | 胡牌展示每项番来源 |
| 3.3 | 新手引导 | 新建 `tutorial.js` | 4h | 首次进入有 3 步引导 |
| 3.4 | 操作按钮位置优化 | `game.css` | 3h | iPhone 底部安全区避让 |
| 3.5 | 四川缺门选择强化 | `components.js` | 2h | 选缺门时高亮三花色+张数 |
| 3.6 | 键盘可用性校验 | `main.js` | 1h | S 键不可绕过禁用状态 |

### Week 5-6：视觉+PWA

| # | 任务 | 文件 | 工时 | 验收标准 |
|---|------|------|------|---------|
| 4.1 | SVG 牌面生成 | 新建 `assets/tiles.css` | 6h | 34 种牌有纹理，总 CSS < 50KB |
| 4.2 | CSS 主题重构 | `themes.css` + 全局 | 4h | 4 种主题无颜色冲突 |
| 4.3 | 响应式牌尺寸 | `game.css` | 3h | iPhone SE 完整显示 13 张手牌 |
| 4.4 | PWA manifest + SW | 新建 `manifest.json`, `sw.js` | 2h | Lighthouse PWA 评分 > 90 |
| 4.5 | 胡牌/杠牌光轨特效 | `animations.css` | 3h | 胡牌时有扫光动画 |
| 4.6 | 暗杠视觉区分 | `components.js` | 2h | 暗杠背面与普通背牌不同 |

### Week 7-8：商业闭环

| # | 任务 | 文件 | 工时 | 验收标准 |
|---|------|------|------|---------|
| 5.1 | 每日挑战系统 | 新建 `daily.js` | 4h | 每天 3 个任务，完成后有 toast 反馈 |
| 5.2 | 对局分享卡片 | 新建 `share.js` | 4h | 生成 PNG，可用 navigator.share 发送 |
| 5.3 | 回放深度链接 | `replay.js` + `main.js` | 2h | URL `#replay=id&step=12` 可直达 |
| 5.4 | 数据导出/导入 | `stats.js` + UI | 2h | JSON 备份与恢复 |
| 5.5 | 音效缓存 | `audio-manager.js` | 2h | audioCache 实际生效 |
| 5.6 | 七对判断修复 | `rules.js` | 1h | 4 张相同牌不能算 2 对 |

---

## 六、关键页面/模块优化点

### 主菜单

| 优化点 | 现状 | 目标 |
|--------|------|------|
| 每日任务入口 | 无 | 菜单右上角显示今日进度（如 1/3） |
| 继续上局 | 无 | 意外刷新/退出后可恢复当前对局（engine 状态 snapshot 存 Storage） |
| 帮助入口 | 无 | 底部工具栏增加「？」按钮，弹出规则速查 |
| 玩家头像 | 无 | 增加 8 个 emoji 头像可选 |

### 游戏界面

| 优化点 | 现状 | 目标 |
|--------|------|------|
| 信息面板 | 无 | 左下角 HUD：向听数 + 听牌列表 + dora 指示器 |
| 操作反馈 | 简单 toast | 吃/碰/杠时牌面有飞入动画，胡牌全屏彩虹光效 |
| 双击确认 | 无 | 设置中开启「双击出牌」防误触 |
| 滑动出牌 | 无 | 移动端支持向上滑动出牌 |
| 流局展示 | 直接跳转 | 展示四家最终手牌对比，标注听牌/未听牌 |

### 结算页

| 优化点 | 现状 | 目标 |
|--------|------|------|
| 分数趋势 | 无 | 折线图展示每局得分变化 |
| 分享卡片 | 无 | 一键生成 PNG 分享图 |
| MVP 统计 | 无 | 本局最高番、最多杠、最快听牌 |
| 精彩瞬间 | 无 | 高番牌型自动截图保存 |

### 网络大厅

| 优化点 | 现状 | 目标 |
|--------|------|------|
| 连接方式 | 手动输入 IP | 局域网自动发现（可选 mDNS） |
| 房间状态 | 无 | 房间列表显示「等待中/游戏中/已满」 |
| 断线重连 | 无 | 掉线后 5 分钟内可重连回座位 |
| 密码房 | 无 | 创建房间时可设 4 位数字密码 |

---

## 七、必要代码实现思路

### 7.1 引擎状态快照恢复（防刷新丢失）

```javascript
// engine.js
serialize() {
    return JSON.stringify({
        config: this.config,
        state: this.state,
        round: this.round,
        currentWind: this.currentWind,
        currentPlayerIndex: this.currentPlayerIndex,
        deckCount: this.deckCount,
        discardPile: this.discardPile,
        lastDiscard: this.lastDiscard,
        doraIndicators: this.doraIndicators,
        players: this.players.map(p => p.toJSON(true)),
        gameHistory: this.gameHistory,
        matchHistory: this.matchHistory,
    });
}

static async deserialize(json) {
    const data = JSON.parse(json);
    const engine = new MahjongEngine(data.config);
    // 重建玩家、牌堆、状态...
    return engine;
}
```

`main.js` 中每回合结束 `Storage.set('game_snapshot', engine.serialize())`，页面加载时检查是否有 snapshot 并提示恢复。

### 7.2 引擎单元测试框架（零依赖）

```javascript
// test/engine-test.js
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

async function testFullGame() {
    const engine = new MahjongEngine({ mahjongType: 'guangdong', playerCount: 4, maxRounds: 1, speed: 'instant' });
    engine.initPlayers([
        { name: 'P1', isAI: false },
        { name: 'AI1', isAI: true },
        { name: 'AI2', isAI: true },
        { name: 'AI3', isAI: true }
    ]);

    let ended = false;
    engine.on('gameEnd', () => { ended = true; });
    engine.on('turnStart', async (data) => {
        if (data.index === 0 && !ended) {
            await engine.playerDraw();
            const tile = engine.players[0].hand[0];
            if (tile) await engine.playerDiscard(tile.id);
        }
    });

    await engine.start();
    // 等待游戏结束（由于 turnStart 中人类玩家自动打牌，AI 自动操作，最终会结束）
    // 需要轮询或额外事件来判断
}

testFullGame().then(() => console.log('✅ engine test pass')).catch(e => console.error('❌', e));
```

### 7.3 主题切换无刷新

```javascript
function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    // 将当前选择持久化
    Stats.saveSettings({ ...Stats.getSettings(), tableTheme: themeName });
}
```

CSS 中所有颜色使用 `var(--xxx)`，切换 `data-theme` 属性即可即时生效。

### 7.4 安全区适配（iPhone X+）

```css
/* 全局安全区变量 */
:root {
    --safe-top: env(safe-area-inset-top, 0px);
    --safe-bottom: env(safe-area-inset-bottom, 0px);
    --safe-left: env(safe-area-inset-left, 0px);
    --safe-right: env(safe-area-inset-right, 0px);
}

#app {
    padding-top: var(--safe-top);
    padding-bottom: var(--safe-bottom);
}
```

### 7.5 音频缓存实现

```javascript
// audio-manager.js
const audioCache = new Map();

function getBuffer(type, fn) {
    const key = type + '|' + fn.toString().length; // 简单签名
    if (audioCache.has(key)) return audioCache.get(key);
    const buffer = fn();
    audioCache.set(key, buffer);
    return buffer;
}

SFX.chi = () => {
    const buffer = getBuffer('chi', () => createChiSound());
    playBuffer(buffer);
};
```

---

## 八、风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| main.js 拆分引入回归 | 高 | 每拆分一个模块就跑一遍 rules + stats + ai 测试；保留原代码注释 1 周后再删 |
| CSS 主题重构导致视觉错乱 | 中 | 使用 Puppeteer 截图对比（视觉回归测试）|
| 引擎状态机改动引入新 bug | 高 | 增加 engine-test.js 覆盖完整游戏流程；每次改动后跑 100 局自动对战 |
| SVG 牌面增大首包体积 | 低 | SVG 内联 CSS 约 40KB，gzip 后 < 12KB；可接受 |
| PWA Service Worker 缓存策略错误 | 中 | SW 使用「cache-then-network」策略，确保更新后用户能拿到最新版本 |

---

## 九、总结：立即开始的 3 件事

1. **今天**：在 `helpers.js` 增加 `CancelToken`，在 `engine.js` 的 `destroy()`、`aiTurn()`、`dealTiles()` 中接入——**消灭最危险的竞态崩溃**。
2. **本周**：修复四川麻将 `checkQueYiMenComplete` 和 `checkActions` 的缺门过滤——**核心规则正确性是底线**。
3. **本周**：在 `rules.js` 增加 `winCache` LRU 缓存——**立竿见影的性能提升**。

这三件事互不依赖，可并行执行，且每一项都有明确的验收标准。完成后项目将从「能运行但脆弱的原型」升级为「规则正确、不崩溃、可迭代」的可靠基础。
