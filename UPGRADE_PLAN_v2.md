# 万能麻将 — 产品+设计+工程升级方案 v2（可直接落地）

> 角色：资深产品 + 设计 + 工程负责人  
> 范围：功能正确性 · 稳定性 · 性能 · 可维护性 · 信息架构 · 视觉质量 · 交互流畅度 · 移动端体验 · 商业完成度  
> 状态：基于审计报告 106 项问题 + 上一轮已修复 15 项后的剩余缺口

---

## 一、核心问题诊断（10个致命/严重级）

| # | 问题 | 用户感知 | 工程根因 | 优先级 |
|---|------|---------|---------|--------|
| P1 | **网络对战完全不可用** | 联机时点「碰」没反应 | `main.js:2799` 错误拒绝远程 claim 动作 | P0 |
| P2 | **main.js 3000行上帝文件** | 任何UI改动都牵一发动全身 | 所有屏幕逻辑、事件绑定、渲染、网络处理全塞一个文件 | P0 |
| P3 | **全量DOM重建** | 低端机掉帧、操作不跟手 | 每摸一张牌 `innerHTML = ''` 清空重建手牌 | P0 |
| P4 | **无游戏内信息辅助** | 新手不知道「为什么还没胡」「该打哪张」 | 零向听数/听牌张/dora/缺门提示 | P1 |
| P5 | **无移动端原生体验** | iPhone按钮被Home条挡、无法添加到主屏 | 无PWA、无安全区适配、无响应式断点 | P1 |
| P6 | **主题系统廉价感** | 4个主题只是换色相，像滤镜 | CSS仅覆盖4个变量，无纹理/材质/光影 | P1 |
| P7 | **测试体系形同虚设** | 每改一行都怕踩雷 | mock测试自己、无断言、覆盖率<5% | P1 |
| P8 | **checkActions单动作限制** | Expert AI偶尔「发呆」不碰该碰的牌 | 胡和碰互斥，AI拒绝胡后失去碰杠机会 | P2 |
| P9 | **无教程/引导/番数透明** | 新用户首次流失率极高 | 零 onboarding，胡了不知道什么番型 | P2 |
| P10 | **无留存闭环** | 玩完一盘不想回来 | 无每日挑战/分享/排行榜 | P2 |

---

## 二、设计方向

### 2.1 产品定位升级

```
从「能玩的麻将模拟器」
→ 「随时随地、规则精准、视觉沉浸的国民级浏览器麻将」
```

### 2.2 设计原则（9维度）

| 维度 | 原则 | 量化指标 |
|------|------|---------|
| **功能正确性** | 规则即法律 | 14种麻将核心规则100%符合地方标准 |
| **稳定性** | 崩溃率<0.1% | 快速重开/退出/切换模式50次零报错 |
| **性能** | 低端机可玩 | AI回合<50ms，全程55fps+ |
| **可维护性** | 模块化、可测试 | main.js拆为6+模块，核心逻辑单元测试>70% |
| **信息架构** | 降低认知门槛 | 游戏内实时显示向听数、听牌张、dora、缺门进度 |
| **视觉** | 质感优先于炫技 | CSS主题系统扩展为HSL+纹理，牌面增加立体阴影 |
| **交互** | 反馈<100ms | 点击→选中→打出全流程触觉/视觉/声音三重反馈 |
| **移动端** | 触控原生体验 | 滑动出牌、底部安全区避让、PWA全屏、响应式牌尺寸 |
| **商业** | 留存>拉新 | 每日挑战+等级+成就+分享卡片形成闭环 |

### 2.3 视觉设计系统（可直接执行的规范）

```css
/* 扩展CSS变量系统 —— 从4变量扩展到12变量 */
:root {
  /* 色彩 */
  --bg-primary: #1a3a1a;
  --bg-secondary: #2d5a2d;
  --bg-panel: rgba(30, 60, 30, 0.92);
  --surface-elevated: rgba(255,255,255,0.06);
  --accent-gold: #d4a843;
  --accent-gold-light: #e8c870;
  --accent-danger: #e74c3c;
  --accent-success: #2ecc71;
  
  /* 文字 */
  --text-primary: #f0e6d2;
  --text-secondary: #c4b896;
  --text-muted: #8a9a7a;
  
  /* 牌桌 */
  --table-felt: radial-gradient(ellipse at center, #2a5a2a 0%, #1a3a1a 100%);
  --table-border: 1px solid rgba(212,168,67,0.15);
  --tile-shadow: 0 2px 4px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3);
  --tile-highlight: 0 0 0 2px var(--accent-gold), 0 0 12px rgba(212,168,67,0.3);
  
  /* 动画 */
  --transition-fast: 0.12s cubic-bezier(0.4, 0, 0.2, 1);
  --transition: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

**牌面质感改造（纯CSS，无需图片资源）**：
```css
.mahjong-tile {
  background: linear-gradient(145deg, #faf8f5 0%, #f0ece6 50%, #e8e4de 100%);
  border: 1px solid #d4cfc7;
  border-radius: 6px;
  box-shadow: 
    inset 0 1px 0 rgba(255,255,255,0.8),
    0 2px 4px rgba(0,0,0,0.3),
    0 1px 2px rgba(0,0,0,0.2);
}
.mahjong-tile::before {
  /* 牌背竹纹 */
  content: '';
  position: absolute;
  inset: 3px;
  background: repeating-linear-gradient(
    90deg,
    transparent,
    transparent 3px,
    rgba(139,90,43,0.08) 3px,
    rgba(139,90,43,0.08) 4px
  );
  border-radius: 3px;
  pointer-events: none;
}
```

---

## 三、优先级路线图（6周落地，比v1更聚焦）

```
Week 1  根基重建    → 拆main.js + DOM差分渲染 + 网络修复
Week 2  规则+引擎   → 多动作决策 + 信息辅助HUD + 测试覆盖
Week 3  视觉重塑   → CSS设计系统 + 牌面质感 + 主题扩展
Week 4  移动端+PWA → 响应式 + 触控优化 + PWA清单 + 安全区
Week 5  新手体验   → 教程模式 + 番数解释 + 出牌建议
Week 6  商业闭环   → 每日挑战 + 分享卡片 + 排行榜骨架
```

---

## 四、具体改造建议（按模块）

### 模块 A：架构拆分（Week 1，最优先）

#### A1. 拆分 main.js（3000行 → 6个模块）

当前 `main.js` 包含：初始化、设置、统计、菜单导航、游戏启动、引擎事件绑定、游戏渲染、玩家输入处理、网络大厅、回放、成就、触摸手势、键盘快捷键。

**目标结构**：
```
js/app/
  ├── app.js          # 入口、全局状态、初始化
  ├── screens.js      # 屏幕切换、路由
  ├── game-renderer.js # 游戏DOM渲染（原renderGameState等）
  ├── game-input.js   # 玩家输入、触摸、键盘
  ├── network-ui.js   # 联机大厅UI
  └── replay-ui.js    # 回放UI
```

**拆分策略（不破坏现有功能）**：
1. 先在 `main.js` 内部用 IIFE 划分区域，提取到独立文件
2. 每个新文件以 `// DEPENDS: App, Utils, UIComponents, ...` 标注依赖
3. `index.html` 按依赖顺序加载
4. 保留 `main.js` 作为兼容层，逐步迁移

**Week 1 可执行的最小拆分**：
```javascript
// js/app/game-renderer.js
const GameRenderer = (function() {
  'use strict';
  
  // 从 main.js 提取：renderGameState, updateDeckCount, 
  // updatePlayerHighlight, renderDiscardPile, renderMelds, renderHand 等
  
  function renderGameState(engine) { /* ... */ }
  function renderHand(player, container, options) { /* ... */ }
  function renderMelds(player, container) { /* ... */ }
  function renderDiscardPile(pile, container) { /* ... */ }
  function updatePlayerHighlight(currentIndex) { /* ... */ }
  function updateDeckCount(count) { /* ... */ }
  
  return { renderGameState, renderHand, renderMelds, 
           renderDiscardPile, updatePlayerHighlight, updateDeckCount };
})();
```

#### A2. 引入 DOM Diff 渲染（消灭全量重建）

**问题**：`renderGameState()` 每次 `innerHTML = ''` 清空重建，13张牌×4玩家=52个DOM元素每轮重建。

**方案**：基于 `data-id` 的增量更新。

```javascript
// js/app/game-renderer.js —— diffRenderHand
function diffRenderHand(tiles, container, options) {
  const existing = new Map();
  container.querySelectorAll('.mahjong-tile').forEach(el => {
    existing.set(el.dataset.id, el);
  });
  
  const newIds = new Set(tiles.map(t => String(t.id)));
  
  // 移除已不存在的
  for (const [id, el] of existing) {
    if (!newIds.has(id)) {
      el.style.transform = 'scale(0)';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 200);
    }
  }
  
  // 添加新增的、移动位置变化的
  tiles.forEach((tile, index) => {
    let el = existing.get(String(tile.id));
    if (!el) {
      el = UIComponents.createTileElement(tile, options);
      el.style.transform = 'scale(0)';
      el.style.opacity = '0';
      container.appendChild(el);
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.25s var(--ease-bounce), opacity 0.2s';
        el.style.transform = 'scale(1)';
        el.style.opacity = '1';
      });
    }
    // 更新位置（排序变化时）
    el.style.order = index;
  });
}
```

**验收标准**：
- Chrome DevTools Performance 录制：AI回合掉帧从 3-5 帧降至 0-1 帧
- 低端安卓机（Moto G7）流畅 playable

---

### 模块 B：信息架构与HUD（Week 2）

#### B1. 游戏内信息面板（降低认知门槛）

当前游戏界面是「信息黑盒」——玩家看不到任何辅助信息。新增 HUD 信息层：

```html
<!-- 嵌入 game-screen，绝对定位浮层 -->
<div class="hud-info-layer">
  <!-- 向听数 -->
  <div class="hud-badge" id="hud-shanten">
    <span class="badge-label">向听</span>
    <span class="badge-value">3</span>
  </div>
  
  <!-- 听牌提示 -->
  <div class="hud-badge ting-badge hidden" id="hud-ting">
    <span class="badge-label">听</span>
    <span class="badge-value">5张</span>
  </div>
  
  <!-- 缺门进度（四川麻将） -->
  <div class="hud-badge que-badge hidden" id="hud-que">
    <span class="badge-label">缺</span>
    <span class="badge-value">条</span>
  </div>
  
  <!-- Dora指示器 -->
  <div class="hud-dora" id="hud-dora">
    <span class="dora-label">宝牌</span>
    <div class="dora-tile" id="dora-tile"></div>
  </div>
</div>
```

**数据流**：
```javascript
// engine.js 在每回合 emit 'playerStateUpdate' 
engine.on('playerStateUpdate', (data) => {
  if (data.playerIndex === 0) {
    HUD.updateShanten(data.shanten);
    HUD.updateTingPai(data.tingPaiCount, data.tingPaiTiles);
    HUD.updateQueYiMen(data.queYiMenSuit, data.queYiMenProgress);
  }
});
```

**实现注意**：向听数计算不可阻塞主线程。使用 `requestIdleCallback` 或 Web Worker（如果计算复杂）。

#### B2. 出牌建议（可选辅助）

```css
/* 最该打的牌边缘发蓝光 */
.mahjong-tile.suggested-discard {
  box-shadow: 0 0 0 2px #4fc3f7, 0 0 12px rgba(79,195,247,0.4);
  animation: suggestPulse 2s ease-in-out infinite;
}
```

**触发条件**：设置中开启「出牌辅助」时，AI计算完成后标记建议弃牌。

---

### 模块 C：引擎规则修复（Week 2）

#### C1. checkActions 返回多动作（修复C18）

当前 `checkActions` 返回单一动作，导致AI在能胡但选择不胡时，失去碰杠机会。

```javascript
// engine.js
function checkActions(player, tile, isNextPlayer) {
  const actions = [];
  
  // 胡（最高优先级）
  const winResult = Rules.canWin([...player.hand, tile], this.ruleConfig);
  if (winResult.canWin && this._checkWinValid(player, winResult)) {
    actions.push({ type: 'hu', priority: 4, winInfo: winResult });
  }
  
  // 杠
  if (Rules.canGang(player.hand, tile, this.ruleConfig)) {
    actions.push({ type: 'gang', priority: 3 });
  }
  
  // 碰（若已可杠，通常不碰；但保留选择权）
  if (Rules.canPeng(player.hand, tile, this.ruleConfig)) {
    actions.push({ type: 'peng', priority: 2 });
  }
  
  // 吃
  if (isNextPlayer && this.ruleConfig.allowChi !== false) {
    const chiOptions = Rules.canChi(player.hand, tile, this.ruleConfig);
    if (chiOptions.length > 0) {
      actions.push({ type: 'chi', priority: 1, options: chiOptions });
    }
  }
  
  return actions.sort((a, b) => b.priority - a.priority);
}
```

**UI改造**：当有多动作可选时，操作栏从4个按钮变为「动作选择浮层」。

#### C2. 网络对战远程 claim 修复（修复C7）

```javascript
// main.js —— handleRemotePlayerAction
function handleRemotePlayerAction(playerIdx, action, data) {
  const engine = App.engine;
  if (!engine) return;
  
  // 区分：回合动作 vs Claim动作
  const turnActions = ['draw', 'discard'];
  const claimActions = ['chi', 'peng', 'gang', 'hu'];
  
  if (turnActions.includes(action)) {
    // 回合动作：必须当前玩家
    if (engine.currentPlayerIndex !== playerIdx) {
      console.warn('Remote turn action from non-current player ignored');
      return;
    }
  } else if (claimActions.includes(action)) {
    // Claim动作：校验 pendingAction 存在且匹配
    if (!engine.pendingAction || engine.pendingAction.playerIndex !== playerIdx) {
      console.warn('Remote claim action without pending action ignored');
      return;
    }
  }
  
  engine.executeAction(playerIdx, action, data);
}
```

---

### 模块 D：视觉系统升级（Week 3）

#### D1. CSS设计系统重构

当前 `main.css` 2078行 + `game.css` 1202行 + `animations.css` + `ui-overhaul.css`，存在大量覆盖和魔法数字。

**改造为原子化CSS+组件CSS**：

```css
/* css/design-system.css —— 设计令牌 */
@import 'tokens.css';      /* CSS变量 */
@import 'utilities.css';   /* 原子类：.flex, .gap-8, .text-gold */
@import 'components.css';  /* 组件：.btn, .card, .modal, .tile */
@import 'screens.css';     /* 屏幕布局：.screen-menu, .screen-game */
```

**关键原子类**：
```css
.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.gap-4 { gap: 4px; }
.gap-8 { gap: 8px; }
.gap-16 { gap: 16px; }
.p-16 { padding: 16px; }
.rounded-lg { border-radius: var(--border-radius); }
.shadow-panel { box-shadow: var(--shadow-lg); }
.bg-panel { background: var(--bg-panel); }
.text-gold { color: var(--accent-gold); }
.text-muted { color: var(--text-muted); }
```

**收益**：
- 减少CSS重复代码 30%+
- 新UI组件开发速度提升（组合原子类即可）
- 主题切换只需覆盖变量，无覆盖战争

#### D2. 牌面质感升级（纯CSS）

```css
/* 当前：扁平Unicode字符 → 目标：立体麻将牌 */

.mahjong-tile {
  --tile-w: 42px;
  --tile-h: 58px;
  width: var(--tile-w);
  height: var(--tile-h);
  background: 
    linear-gradient(145deg, #fdfcfa 0%, #f5f2ed 40%, #ebe7e0 100%);
  border-radius: 6px;
  border: 1px solid #c8c3bb;
  box-shadow:
    /* 顶部高光 */
    inset 0 1px 1px rgba(255,255,255,0.9),
    /* 底部阴影 */
    inset 0 -1px 1px rgba(0,0,0,0.05),
    /* 整体投影 */
    0 2px 3px rgba(0,0,0,0.25),
    0 1px 1px rgba(0,0,0,0.15);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.6rem;
  cursor: pointer;
  transition: transform var(--transition-fast), 
              box-shadow var(--transition-fast);
}

/* 悬停/选中状态 */
.mahjong-tile:hover {
  transform: translateY(-4px) scale(1.05);
  box-shadow:
    inset 0 1px 1px rgba(255,255,255,0.9),
    0 6px 12px rgba(0,0,0,0.25),
    0 0 0 1px rgba(212,168,67,0.3);
}

.mahjong-tile.selected {
  transform: translateY(-12px) scale(1.08);
  box-shadow:
    inset 0 1px 1px rgba(255,255,255,0.9),
    0 8px 20px rgba(0,0,0,0.3),
    0 0 0 2px var(--accent-gold);
}

/* 牌背（对手手牌） */
.mahjong-tile.back {
  background: 
    repeating-linear-gradient(
      45deg,
      #2d5a2d,
      #2d5a2d 4px,
      #367a36 4px,
      #367a36 8px
    );
  border-color: #1a3a1a;
}
.mahjong-tile.back::after {
  content: '🀄';
  font-size: 1rem;
  opacity: 0.3;
}
```

#### D3. 主题系统扩展

当前4个主题只是换色相。扩展为「色相+纹理+光照」三维主题：

```javascript
// themes.js
const THEMES = {
  'classic-green': {
    cssVars: { '--bg-primary': '#1a3a1a', '--accent-gold': '#d4a843' },
    tableBg: 'radial-gradient(ellipse at center, #2d5a2d 0%, #1a3a1a 100%)',
    feltPattern: 'none'
  },
  'dark-blue': {
    cssVars: { '--bg-primary': '#0f1a2e', '--accent-gold': '#6b9ed4' },
    tableBg: 'radial-gradient(ellipse at center, #1a2d4a 0%, #0f1a2e 100%)',
    feltPattern: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.02) 2px, rgba(255,255,255,0.02) 4px)'
  },
  'wood': {
    cssVars: { '--bg-primary': '#2a1f15', '--accent-gold': '#c4a86b' },
    tableBg: 'repeating-linear-gradient(90deg, #3d2b1f 0px, #4a3526 2px, #3d2b1f 4px)',
    feltPattern: 'none'
  },
  'red': {
    cssVars: { '--bg-primary': '#2a1010', '--accent-gold': '#d4a843' },
    tableBg: 'radial-gradient(ellipse at center, #4a1a1a 0%, #2a1010 100%)',
    feltPattern: 'radial-gradient(circle at 20% 50%, rgba(212,50,50,0.1) 0%, transparent 50%)'
  }
};
```

---

### 模块 E：移动端与PWA（Week 4）

#### E1. 响应式断点

```css
/* 小屏手机（<400px宽） */
@media (max-width: 400px) {
  .game-table {
    grid-template-columns: 60px 1fr 60px;
    grid-template-rows: 80px 1fr 140px;
  }
  .mahjong-tile {
    --tile-w: 32px;
    --tile-h: 44px;
    font-size: 1.2rem;
  }
  .player-info {
    font-size: 0.65rem;
    padding: 4px 6px;
  }
}

/* 大屏手机/小平板（400-768px） */
@media (min-width: 401px) and (max-width: 768px) {
  .mahjong-tile {
    --tile-w: 36px;
    --tile-h: 50px;
  }
}

/* 平板横屏（769-1024px） */
@media (min-width: 769px) and (max-width: 1024px) {
  .game-table {
    grid-template-columns: 120px 1fr 120px;
    grid-template-rows: 140px 1fr 200px;
  }
}
```

#### E2. 触控优化

```javascript
// game-input.js —— 滑动出牌
function initTouchGestures() {
  const handArea = document.getElementById('hand-bottom');
  let startY = 0;
  let selectedTile = null;
  
  handArea.addEventListener('touchstart', (e) => {
    const tile = e.target.closest('.mahjong-tile');
    if (!tile) return;
    startY = e.touches[0].clientY;
    selectedTile = tile;
    tile.classList.add('touch-lift');
  }, { passive: true });
  
  handArea.addEventListener('touchmove', (e) => {
    if (!selectedTile) return;
    const dy = startY - e.touches[0].clientY;
    if (dy > 30) {
      selectedTile.style.transform = `translateY(${-Math.min(dy, 80)}px)`;
    }
  }, { passive: true });
  
  handArea.addEventListener('touchend', (e) => {
    if (!selectedTile) return;
    const dy = startY - (e.changedTouches[0]?.clientY || startY);
    if (dy > 60) {
      // 滑动距离足够，执行出牌
      discardTile(selectedTile.dataset.id);
    } else {
      // 距离不够，复位
      selectedTile.style.transform = '';
    }
    selectedTile.classList.remove('touch-lift');
    selectedTile = null;
  });
}
```

#### E3. PWA 配置

```html
<!-- index.html head 内添加 -->
<link rel="manifest" href="manifest.json">
<meta name="theme-color" content="#1a3a1a">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="icons/icon-192.png">
```

```json
// manifest.json
{
  "name": "万能麻将",
  "short_name": "万能麻将",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a3a1a",
  "theme_color": "#1a3a1a",
  "orientation": "landscape",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192" },
    { "src": "icons/icon-512.png", "sizes": "512x512" }
  ]
}
```

**iOS 安全区适配**：
```css
/* 适配刘海屏 */
@supports (padding: max(0px)) {
  .screen {
    padding-left: max(16px, env(safe-area-inset-left));
    padding-right: max(16px, env(safe-area-inset-right));
    padding-bottom: max(16px, env(safe-area-inset-bottom));
  }
  .action-bar {
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }
}
```

---

### 模块 F：新手体验（Week 5）

#### F1. 首次启动引导（3步）

```javascript
// app.js —— 首次启动检测
function init() {
  // ... existing init ...
  
  const hasSeenGuide = Storage.get('hasSeenGuide', false);
  if (!hasSeenGuide) {
    showOnboarding();
  }
}

function showOnboarding() {
  const steps = [
    {
      target: '#hand-bottom',
      text: '点击手牌选中，再次点击打出',
      position: 'top'
    },
    {
      target: '#action-bar',
      text: '对手出牌后，可选择吃、碰、杠、胡',
      position: 'top'
    },
    {
      target: '#hud-shanten',
      text: '向听数=0时即为听牌，再摸一张有效牌即可胡',
      position: 'bottom'
    }
  ];
  
  UIComponents.showTour(steps, () => {
    Storage.set('hasSeenGuide', true);
  });
}
```

#### F2. 胡牌番数解释弹窗

当前胡牌后只显示「+200分」，玩家不知道是什么牌型。

```javascript
// 结算时展示番型分解
function showWinDetails(winInfo) {
  const details = winInfo.fanDetails.map(d => 
    `<div class="fan-row">
      <span class="fan-name">${d.name}</span>
      <span class="fan-value">${d.fan}番</span>
    </div>`
  ).join('');
  
  UIComponents.showModal('胡牌详情', `
    <div class="win-detail-modal">
      <div class="win-hand-preview">${renderMiniHand(winInfo.hand)}</div>
      <div class="fan-breakdown">${details}</div>
      <div class="fan-total">总计: ${winInfo.totalFan}番 × ${winInfo.baseScore} = ${winInfo.score}分</div>
    </div>
  `);
}
```

#### F3. 规则速查（游戏内悬浮）

```html
<div class="rule-cheatsheet hidden" id="rule-cheatsheet">
  <h4>广东麻将 · 规则速查</h4>
  <ul>
    <li>🀄 鸡平胡/推倒胡，无起胡限制</li>
    <li>🌸 花牌补牌，摸到花牌再摸一张</li>
    <li>💥 杠上开花：杠后摸牌自摸，加1番</li>
    <li>🌙 海底捞月：最后一张牌自摸，加1番</li>
  </ul>
</div>
```

---

### 模块 G：商业闭环（Week 6）

#### G1. 每日挑战

```javascript
// js/data/daily-challenge.js
const DailyChallenge = (function() {
  function getTodayChallenge() {
    const seed = getDaySeed(); // 基于日期
    const challenges = [
      { id: 'win_1', name: '今日首胜', desc: '赢得1局对战', reward: 50 },
      { id: 'qing_yi_se', name: '清一色', desc: '胡出1次清一色', reward: 100 },
      { id: 'no_chi', name: '硬碰硬', desc: '不吃牌赢1局', reward: 80 },
      { id: 'zi_mo_3', name: '自摸大师', desc: '单局自摸3次', reward: 120 }
    ];
    return challenges[seed % challenges.length];
  }
  
  function checkProgress(challengeId, gameResult) {
    // ...
  }
  
  return { getTodayChallenge, checkProgress };
})();
```

**UI位置**：主菜单「人机对战」按钮旁显示今日挑战标签。

#### G2. 分享卡片（Canvas生成）

```javascript
function generateShareCard(stats) {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 450;
  const ctx = canvas.getContext('2d');
  
  // 背景
  ctx.fillStyle = '#1a3a1a';
  ctx.fillRect(0, 0, 800, 450);
  
  // 标题
  ctx.fillStyle = '#d4a843';
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText('万能麻将', 60, 80);
  
  // 战绩
  ctx.fillStyle = '#f0e6d2';
  ctx.font = '32px sans-serif';
  ctx.fillText(`今日 ${stats.wins} 胜 ${stats.losses} 负`, 60, 150);
  ctx.fillText(`最高连胜: ${stats.maxStreak}`, 60, 200);
  
  // 二维码区域（占位）
  ctx.fillStyle = '#fff';
  ctx.fillRect(600, 100, 150, 150);
  ctx.fillStyle = '#333';
  ctx.font = '14px sans-serif';
  ctx.fillText('扫码来战', 640, 270);
  
  return canvas.toDataURL('image/png');
}
```

#### G3. 本地排行榜骨架

```javascript
// js/data/leaderboard.js（本地存储版）
const Leaderboard = (function() {
  function addEntry(mahjongType, playerName, score, fan) {
    const key = `leaderboard_${mahjongType}`;
    const list = Storage.get(key, []);
    list.push({ playerName, score, fan, date: new Date().toISOString() });
    list.sort((a, b) => b.score - a.score);
    Storage.set(key, list.slice(0, 50)); // 保留前50
  }
  
  function getTop(mahjongType, n = 10) {
    return Storage.get(`leaderboard_${mahjongType}`, []).slice(0, n);
  }
  
  return { addEntry, getTop };
})();
```

---

## 五、可执行任务清单（按周）

### Week 1：架构重建

- [ ] **W1-1** 创建 `js/app/` 目录，新建 `game-renderer.js`，提取 `renderGameState` 及所有子渲染函数
- [ ] **W1-2** 新建 `game-input.js`，提取玩家输入、触摸手势、键盘事件
- [ ] **W1-3** 新建 `network-ui.js`，提取联机大厅UI逻辑
- [ ] **W1-4** 新建 `screens.js`，提取屏幕切换路由
- [ ] **W1-5** 改造 `renderHand` → `diffRenderHand`，基于 `data-id` 增量更新
- [ ] **W1-6** 修复网络对战远程 claim 被拒绝问题（`main.js:2799`）
- [ ] **W1-7** `index.html` 更新 script 加载顺序，确保无循环依赖
- [ ] **W1-8** 运行全部测试，确保拆分后零回归

### Week 2：规则+信息

- [ ] **W2-1** `engine.js`：`checkActions` 返回多动作数组，优先级排序
- [ ] **W2-2** `engine.js`：AI 多动作决策逻辑（胡>杠>碰>吃，可跳过）
- [ ] **W2-3** UI：动作选择浮层（当有多动作时显示，而非固定4按钮）
- [ ] **W2-4** HUD：向听数 Badge（使用 `AIUtils.calculateShanten`）
- [ ] **W2-5** HUD：听牌提示 Badge（使用 `Rules.analyzeTingPai`）
- [ ] **W2-6** HUD：四川缺门进度指示器
- [ ] **W2-7** HUD：Dora/宝牌指示器
- [ ] **W2-8** 新增 `test/engine-test-node.js`：测试 checkActions 多动作、向听数计算

### Week 3：视觉重塑

- [ ] **W3-1** 新建 `css/design-system.css`，提取所有 CSS 变量到统一文件
- [ ] **W3-2** 新建 `css/utilities.css`，定义 50+ 原子类
- [ ] **W3-3** 重写 `.mahjong-tile` 样式：立体光影、选中动画、牌背纹理
- [ ] **W3-4** 重写 `.game-table` 背景：牌桌毛毡纹理+光影
- [ ] **W3-5** 扩展主题系统：每个主题包含 hue+texture+lighting 三维配置
- [ ] **W3-6** 统一按钮/卡片/弹窗样式，消除视觉不一致
- [ ] **W3-7** 清理 `main.css` 和 `game.css` 中的死代码和重复代码

### Week 4：移动端+PWA

- [ ] **W4-1** 添加 viewport + safe-area CSS，适配刘海屏
- [ ] **W4-2** 添加响应式断点（<400px / 400-768px / 769-1024px / >1024px）
- [ ] **W4-3** 实现滑动出牌手势
- [ ] **W4-4** 实现双击出牌（替代点击两次）
- [ ] **W4-5** 操作按钮底部安全区适配
- [ ] **W4-6** 创建 `manifest.json` + Service Worker 离线缓存
- [ ] **W4-7** 生成 PWA 图标（192px + 512px）
- [ ] **W4-8** 横屏锁定提示（竖屏时显示「请横屏游玩」）

### Week 5：新手体验

- [ ] **W5-1** 首次启动 3 步引导（高亮+浮层）
- [ ] **W5-2** 游戏内规则速查按钮（点击显示当前麻将规则摘要）
- [ ] **W5-3** 胡牌番数分解弹窗（展示每种番型的分数来源）
- [ ] **W5-4** 出牌建议开关（设置中开启，建议牌边缘发蓝光）
- [ ] **W5-5** 听牌时高亮显示所有能和的牌（用半透明覆盖层）

### Week 6：商业闭环

- [ ] **W6-1** `js/data/daily-challenge.js`：每日挑战数据层
- [ ] **W6-2** 主菜单显示今日挑战标签
- [ ] **W6-3** 结算页分享按钮 + Canvas 分享卡片生成
- [ ] **W6-4** `js/data/leaderboard.js`：本地排行榜
- [ ] **W6-5** 战绩页新增「每种麻将最高分」排行榜
- [ ] **W6-6** 成就解锁时的全屏庆祝动画（彩带+音效）

---

## 六、关键页面/模块优化点

### 6.1 主菜单

| 当前问题 | 优化方案 |
|---------|---------|
| 信息层级混乱 | 主按钮放大，次级按钮缩小并放入底部栏 |
| 等级徽章不显眼 | 增加经验条动画，升级时闪光 |
| 无每日目标 | 在「人机对战」旁增加「今日挑战：胡出清一色」标签 |
| 纯emoji头像 | 提供8个可选头像（SVG），存入设置 |

### 6.2 游戏界面

| 当前问题 | 优化方案 |
|---------|---------|
| 玩家信息栏占据过多空间 | 缩小为迷你栏，回合时再展开高亮 |
| 弃牌堆无区分 | 按玩家分区显示弃牌，用颜色边框区分 |
| 动作按钮固定4个 | 动态显示可用动作，禁用变灰 |
| 无动画反馈 | 摸牌飞入、打出滑出、吃碰杠牌面翻转 |
| 牌太小（移动端） | 响应式缩放 + 横向滚动手牌区 |

### 6.3 结算页

| 当前问题 | 优化方案 |
|---------|---------|
| 只有总分 | 番型分解表格 + 手牌展示 |
| 无分享 | 添加「生成战绩卡」按钮 |
| 无继续动力 | 显示「再赢2场升级」进度提示 |

### 6.4 设置页

| 当前问题 | 优化方案 |
|---------|---------|
| 选项过多一页装不下 | 分组折叠面板（玩家/牌局/外观/声音/辅助） |
| 无预览 | 选主题时实时预览牌桌背景 |

---

## 七、必要代码实现思路

### 7.1 DOM Diff 渲染的核心算法

```javascript
/**
 * 增量渲染手牌
 * @param {Tile[]} tiles - 新手牌数组（已排序）
 * @param {HTMLElement} container - 手牌容器
 * @param {Object} options - 渲染选项
 */
function diffRenderHand(tiles, container, options = {}) {
  const existingEls = Array.from(container.children);
  const existingMap = new Map(existingEls.map(el => [el.dataset.id, el]));
  
  // 计算 diff：LCS 或简单按 id 对齐
  const newIds = tiles.map(t => String(t.id));
  const oldIds = existingEls.map(el => el.dataset.id);
  
  // 1. 标记需要移除的
  const toRemove = [];
  for (const el of existingEls) {
    if (!newIds.includes(el.dataset.id)) {
      toRemove.push(el);
    }
  }
  
  // 2. 标记需要添加的
  const toAdd = [];
  for (let i = 0; i < tiles.length; i++) {
    if (!existingMap.has(String(tiles[i].id))) {
      toAdd.push({ index: i, tile: tiles[i] });
    }
  }
  
  // 3. 执行移除（带动画）
  toRemove.forEach(el => {
    el.style.transition = 'all 0.2s ease';
    el.style.transform = 'scale(0) rotate(10deg)';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  });
  
  // 4. 执行添加（带动画）
  toAdd.forEach(({ index, tile }) => {
    const el = UIComponents.createTileElement(tile, options);
    el.style.transform = 'scale(0) translateY(20px)';
    el.style.opacity = '0';
    
    if (index >= container.children.length) {
      container.appendChild(el);
    } else {
      container.insertBefore(el, container.children[index]);
    }
    
    requestAnimationFrame(() => {
      el.style.transition = 'all 0.3s var(--ease-bounce)';
      el.style.transform = '';
      el.style.opacity = '1';
    });
  });
  
  // 5. 更新现有元素的位置（如果排序变化）
  // 使用 Flexbox order 避免重排
  tiles.forEach((tile, index) => {
    const el = existingMap.get(String(tile.id));
    if (el) {
      el.style.order = index;
      // 更新选中状态等
    }
  });
}
```

### 7.2 屏幕路由系统（替代当前硬编码）

```javascript
// js/app/screens.js
const ScreenRouter = (function() {
  const screens = new Map();
  let current = null;
  
  function register(name, { onEnter, onLeave, onUpdate }) {
    screens.set(name, { onEnter, onLeave, onUpdate });
  }
  
  function navigate(name, params = {}) {
    const prev = screens.get(current);
    const next = screens.get(name);
    if (!next) return;
    
    if (prev?.onLeave) prev.onLeave();
    
    // 切换 active class
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(name)?.classList.add('active');
    
    current = name;
    next.onEnter(params);
  }
  
  function update(params) {
    const s = screens.get(current);
    if (s?.onUpdate) s.onUpdate(params);
  }
  
  return { register, navigate, update, get current() { return current; } };
})();

// 注册各屏幕
ScreenRouter.register('main-menu', {
  onEnter() { /* ... */ },
  onLeave() { /* 暂停BGM等 */ }
});

ScreenRouter.register('game-screen', {
  onEnter({ config }) { startGame(config); },
  onLeave() { App.engine?.destroy(); }
});
```

### 7.3 网络对战状态机

当前 P2P 代码是事件驱动的，缺乏状态机，容易出现竞态。

```javascript
// js/network/p2p.js —— 增加状态机
const NetworkState = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  LOBBY: 'lobby',
  READY: 'ready',
  IN_GAME: 'in-game',
  DISCONNECTED: 'disconnected',
  RECONNECTING: 'reconnecting'
};

class P2PNetwork extends Utils.EventEmitter {
  constructor() {
    // ... existing ...
    this._state = NetworkState.IDLE;
    this._stateHistory = []; // 用于调试
  }
  
  get state() { return this._state; }
  
  _setState(newState) {
    const oldState = this._state;
    if (oldState === newState) return;
    
    // 校验状态转换合法性
    const validTransitions = {
      [NetworkState.IDLE]: [NetworkState.CONNECTING],
      [NetworkState.CONNECTING]: [NetworkState.LOBBY, NetworkState.DISCONNECTED],
      [NetworkState.LOBBY]: [NetworkState.READY, NetworkState.DISCONNECTED],
      [NetworkState.READY]: [NetworkState.IN_GAME, NetworkState.LOBBY],
      [NetworkState.IN_GAME]: [NetworkState.LOBBY, NetworkState.DISCONNECTED],
      [NetworkState.DISCONNECTED]: [NetworkState.RECONNECTING, NetworkState.IDLE],
      [NetworkState.RECONNECTING]: [NetworkState.LOBBY, NetworkState.DISCONNECTED]
    };
    
    if (!validTransitions[oldState]?.includes(newState)) {
      console.warn(`Invalid state transition: ${oldState} -> ${newState}`);
      return;
    }
    
    this._state = newState;
    this._stateHistory.push({ from: oldState, to: newState, time: Date.now() });
    this.emit('stateChange', { oldState, newState });
  }
}
```

### 7.4 测试覆盖策略

当前测试只有 rules-test（25项）和 stats-test（52项）。目标：核心逻辑单元测试>70%。

```javascript
// test/engine-test-node.js（新增）
const assert = require('assert');

function testCheckActionsMultiple() {
  const engine = new MahjongEngine({ mahjongType: 'guangdong', playerCount: 4 });
  engine.initPlayers([
    { name: 'P1', isAI: false },
    { name: 'AI1', isAI: true },
    { name: 'AI2', isAI: true },
    { name: 'AI3', isAI: true }
  ]);
  
  const player = engine.players[0];
  // 构造一手可以同时碰和吃的牌
  player.hand = [
    Tiles.createTile('wan', 2), Tiles.createTile('wan', 3),
    Tiles.createTile('wan', 4), Tiles.createTile('wan', 4),
    Tiles.createTile('wan', 4)
  ];
  
  const discardTile = Tiles.createTile('wan', 4);
  const actions = engine.checkActions(player, discardTile, true);
  
  assert(actions.length >= 2, '应同时返回碰和吃');
  assert(actions.some(a => a.type === 'peng'), '应包含碰');
  assert(actions.some(a => a.type === 'chi'), '应包含吃');
  
  console.log('✅ checkActions 多动作测试通过');
}

// test/renderer-test-node.js（新增）
// 使用 jsdom 测试 diffRenderHand
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window;

function testDiffRenderHand() {
  const container = document.createElement('div');
  const tiles = [
    { id: 1, suit: 'wan', value: 1, unicode: '🀇' },
    { id: 2, suit: 'wan', value: 2, unicode: '🀈' }
  ];
  
  GameRenderer.diffRenderHand(tiles, container, {});
  assert.strictEqual(container.children.length, 2);
  
  // 更新：移除1，添加3
  const newTiles = [
    { id: 2, suit: 'wan', value: 2, unicode: '🀈' },
    { id: 3, suit: 'wan', value: 3, unicode: '🀉' }
  ];
  GameRenderer.diffRenderHand(newTiles, container, {});
  
  // 等待动画结束后断言
  setTimeout(() => {
    assert.strictEqual(container.children.length, 2);
    assert(container.querySelector('[data-id="2"]'));
    assert(container.querySelector('[data-id="3"]'));
    console.log('✅ diffRenderHand 测试通过');
  }, 300);
}
```

---

## 八、验收标准

### 功能正确性
- [ ] 14种麻将各随机10局，无规则错误（AI验证+人工抽查）
- [ ] 快速重开/退出/切换模式 50次，console零报错
- [ ] 网络对战完整流程（创建→加入→开局→吃碰杠胡→结算）可通

### 性能
- [ ] Chrome Lighthouse Performance > 80
- [ ] AI回合渲染掉帧 < 1帧（60fps环境下）
- [ ] 首屏加载 < 3秒（3G网络模拟）

### 移动端
- [ ] iPhone Safari：按钮不被Home条遮挡
- [ ] 安卓Chrome：滑动出牌可用
- [ ] PWA：可添加到主屏，离线可启动（至少到主菜单）

### 可维护性
- [ ] main.js < 800行（当前3004行）
- [ ] CSS重复代码减少30%
- [ ] 核心逻辑单元测试覆盖率 > 70%

---

## 附录：与审计报告的映射

| 本方案模块 | 覆盖的审计项 |
|-----------|-------------|
| A1 拆分 main.js | H14（上帝文件）|
| A2 DOM Diff | H14, H19（性能）, C25（强制同步布局）|
| C1 多动作 checkActions | C18（单动作限制）|
| C2 网络修复 | C7（远程claim被拒）|
| B1/B2 HUD信息 | F10（信息黑盒）|
| D1/D2/D3 视觉 | H23（主题残缺）, M20（视觉）|
| E1/E2/E3 移动端 | H24（无PWA）, 多个移动端问题 |
| F1/F2/F3 新手体验 | F16（无教程）|
| G1/G2/G3 商业闭环 | F17（无留存）|
| 测试策略 | H20-H22（测试失效）|
