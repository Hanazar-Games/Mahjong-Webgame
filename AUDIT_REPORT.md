# 万能麻将 — 端到端代码审计报告（完整版）

**审计日期**: 2026-05-22  
**审计范围**: 前端 JS (8,294 行) + CSS (4,152 行) + HTML (608 行) + 后端 Node.js (318 行) + 测试文件 (8 个) + 文档  
**审计轮次**: 第一轮（全模块广度扫描）+ 第二轮（audio/stats/player/components/main.js-mid 深度扫描）  

---

## 执行摘要

| 严重程度 | 数量 | 核心类别 |
|---------|------|---------|
| 🔴 **Critical** | 28 | 安全漏洞、竞态崩溃、核心逻辑错误、数据完整性破坏、序列化陷阱 |
| 🟠 **High** | 32 | 性能瓶颈、架构缺陷、无障碍违规、测试失效、内存泄漏 |
| 🟡 **Medium** | 28 | 边界条件、状态管理瑕疵、可维护性、音频/动画缺陷 |
| 🟢 **Low** | 18 | 代码风格、文档不一致、冗余代码、硬编码魔法数字 |
| **合计** | **106** | — |

**最危险的 10 个问题**:
1. **C1** 信令服务器 `/send` 任意消息类型注入（可伪造 SDP 劫持连接）
2. **C4** 引擎 `destroy()` 不取消异步操作 → 快速重开/退出必崩
3. **C7** 网络对战远程 claim（吃碰杠胡）被错误拒绝 → P2P 完全不可用
4. **C8** 四川麻将缺门规则实现错误（副露不检查 + 可碰缺门花色）
5. **C13-C17** `components.js` + `main.js` 多处 XSS（player.name、achievement、replay 数据未转义）
6. **C20** `player.js` `toJSON()` 与 `JSON.stringify` 冲突 → 序列化行为随嵌套方式突变
7. **C21** `stats.js` 数据迁移只补 4 个字段 → 其余缺失字段产生 NaN，统计系统永久损坏
8. **C22** `stats.js` `Storage.set()` 失败被静默忽略 → 数据丢失无感知
9. **C15** `rules.js` 胡牌判断无记忆化 → AI 单次弃牌 340+ 次指数级递归
10. **C25** `components.js` 拖拽强制同步布局 + 粒子未批处理 → 低端机掉帧/卡顿

---

## 🔴 Critical（28项）

### C1. 信令服务器：任意消息类型注入（Msg Type Injection）

| 属性 | 内容 |
|------|------|
| **位置** | `server/signaling-server.js:242-258` |
| **影响** | 攻击者可向房间内广播任意类型消息（`sdp-offer`, `gameStart`, `playerJoined` 等），劫持 WebRTC 连接、伪造游戏开始、踢人 |
| **复现** | `curl -X POST http://server:8081/room/XXXX/send -d '{"playerId":"validId","type":"sdp-offer","data":{"sdp":"malicious","targetId":"victim"}}'` |
| **根因** | `broadcast(roomId, { type: body.type || 'message', ... })` 对 `body.type` 无任何 allowlist 校验 |
| **修复** | `const ALLOWED_TYPES = ['message','sdp-offer','sdp-answer','ice-candidate','playerJoined','playerLeft','gameStart']; if (!ALLOWED_TYPES.includes(body.type)) return 403;` |
| **优先级** | P0 |

---

### C2. 信令服务器：CORS 通配符

| 属性 | 内容 |
|------|------|
| **位置** | `server/signaling-server.js:25, 97` |
| **影响** | 任意恶意网站可通过浏览器向信令服务器发起跨域请求，CSRF 创建房间、加入房间、广播消息 |
| **根因** | `Access-Control-Allow-Origin: *` 对所有响应设置 |
| **修复** | 移除通配符；若必须跨域，校验 `Origin` 为局域网 IP 段；或要求 Token |
| **优先级** | P0 |

---

### C3. 信令服务器：请求体无大小限制（DoS）

| 属性 | 内容 |
|------|------|
| **位置** | `server/signaling-server.js:30-40` |
| **影响** | 攻击者发送超大请求体耗尽服务器内存，导致所有房间崩溃 |
| **根因** | `req.on('data', chunk => body += chunk)` 无长度上限；字符串拼接 O(n²) |
| **修复** | 增加 `let length=0; req.on('data', chunk=>{ length+=chunk.length; if(length>65536){req.destroy();reject(new Error('Body too large'));return;} body+=chunk; })` |
| **优先级** | P0 |

---

### C4. 引擎：destroy() 不取消异步操作（竞态崩溃）

| 属性 | 内容 |
|------|------|
| **位置** | `js/core/engine.js:1151-1166` |
| **影响** | 玩家快速「退出→重新开始」时，旧的 `Utils.sleep()` 和 AI 轮次仍执行，访问已清空的 `this.players`，抛出 `TypeError: Cannot read properties of undefined` |
| **复现** | 游戏进行中 → 快速点击菜单 → 重新开始 → 控制台报错 |
| **根因** | `destroy()` 只清 timer 和属性，不取消 `aiTurn()` / `dealTiles()` 中大量的 `await Utils.sleep(...)` |
| **修复** | 引入 `CancelToken`：`destroy()` 调用 `this._token.cancel()`；所有 sleep 传入 token 并 catch CANCELLED |
| **优先级** | P0 |

---

### C5. 引擎：Timer 闭包捕获失效状态

| 属性 | 内容 |
|------|------|
| **位置** | `js/core/engine.js:1088-1111` |
| **影响** | `startTimer()` 的 `setTimeout` 回调闭包捕获了 `playerIndex`，引擎销毁后 `this.players` 已空，timer 到期访问 `hand[0]` 崩溃 |
| **根因** | `destroy()` 调用 `stopTimer()`，但如果 `startTimer()` 在 `destroy()` 之后被某处调用，新 timer 仍会在引擎已销毁后触发 |
| **修复** | Timer 回调开头检查 `this.state === 'destroyed'` 或 `this._token.isCancelled` |
| **优先级** | P0 |

---

### C6. 引擎：getState() 返回可变引用

| 属性 | 内容 |
|------|------|
| **位置** | `js/core/engine.js:1134-1146` |
| **影响** | 外部代码可直接修改引擎内部状态（config、discardPile），导致不可预期的数据污染 |
| **根因** | `getState()` 返回 `this.config`（对象引用）、`this.discardPile`（数组引用），未深拷贝 |
| **修复** | `return { config: Utils.deepClone(this.config), discardPile: [...this.discardPile], ... }` |
| **优先级** | P0 |

---

### C7. 主程序：网络对战远程 claim 动作被错误拒绝

| 属性 | 内容 |
|------|------|
| **位置** | `js/main.js:2799-2802` |
| **影响** | **网络对战功能完全不可用**——远程玩家无法吃、碰、杠、胡 |
| **复现** | 建立 P2P 对战 → 主机打出一张牌 → 客户端点击「碰」→ 被 `console.warn('Remote action from non-current player ignored')` 拒绝 |
| **根因** | `handleRemotePlayerAction` 错误地要求 `currentPlayerIndex === playerIdx`，而 claim 动作本就发生在他人回合 |
| **修复** | 区分「回合动作」（draw/discard）和「claim 动作」（chi/peng/gang/hu）：claim 仅校验 `pendingAction` 匹配 |
| **优先级** | P0 |

---

### C8. 四川麻将：缺门规则实现错误

| 属性 | 内容 |
|------|------|
| **位置** | `js/core/engine.js:228-231`, `js/core/engine.js:434-460` |
| **影响** | ① 玩家可对缺门花色执行吃/碰/杠；② 胡牌时仅检查手牌、不检查副露 |
| **根因** | `checkQueYiMenComplete` 只检查 `player.hand`；`checkActions` 的 chi/peng/gang 无 queYiMen 过滤 |
| **修复** | `checkQueYiMenComplete` 改为检查 hand+melds；`checkActions` 中 `if (tile.suit === player.queYiMen) return null` |
| **优先级** | P0 |

---

### C9. P2P：SSE 异步拒绝未捕获

| 属性 | 内容 |
|------|------|
| **位置** | `js/network/p2p.js:119-126`, `js/network/p2p.js:162-225` |
| **影响** | 收到畸形信令时 `_handleSignal` 内 async 函数抛出异常，成为 Unhandled Promise Rejection，客户端崩溃 |
| **根因** | `_handleSignal` 是 async，但在 `sse.onmessage` 中直接调用而不 await 或 .catch() |
| **修复** | `this.sse.onmessage = (e) => { this._handleSignal(JSON.parse(e.data)).catch(err => { console.error('Signal error:', err); this.emit('error', err); }); }` |
| **优先级** | P0 |

---

### C10. P2P：DataChannel 消息无验证

| 属性 | 内容 |
|------|------|
| **位置** | `js/network/p2p.js:258-262` |
| **影响** | 恶意 peer 可发送任意 JSON 对象，若下游 UI 使用 `innerHTML` 渲染字段，直接形成 XSS |
| **根因** | `channel.onmessage` 只做 `JSON.parse` 后直接 `emit('data', ...)`，无 schema 校验 |
| **修复** | 增加消息 schema 白名单；UI 渲染前对文本字段做 `escapeHtml` |
| **优先级** | P0 |

---

### C11. P2P：并发 SSE 连接竞态

| 属性 | 内容 |
|------|------|
| **位置** | `js/network/p2p.js:98-138` |
| **影响** | 重连时可能同时存在多个 SSE 连接，`onopen` 回调可能设置错误的 `connected` 状态 |
| **根因** | `_startSSE()` 先 `close()` 旧连接再创建新连接，但旧连接的异步回调仍可能在后续执行 |
| **修复** | 使用 `this.sseGeneration` 计数器，回调中检查 `if (gen !== this._sseGen) return` |
| **优先级** | P0 |

---

### C12. P2P：leaveRoom 重连定时器竞态

| 属性 | 内容 |
|------|------|
| **位置** | `js/network/p2p.js:341-366` |
| **影响** | 离开房间后，旧 SSE 的 `onerror` 仍可能触发重连定时器，向 `/room/null/events` 发起无效请求，无限报错循环 |
| **根因** | `leaveRoom()` 在 `this.roomId = null` 前，旧 SSE 的 onerror 已排了一个 `setTimeout` |
| **修复** | `leaveRoom()` 开头 `clearTimeout(this.sseReconnectTimer)`；重连回调中 `if (!this.roomId) return` |
| **优先级** | P0 |

---

### C13. 主程序：XSS via `desc.icon` in `innerHTML`

| 属性 | 内容 |
|------|------|
| **位置** | `js/main.js:2141` |
| **影响** | 回放描述中的 icon 字符串直接插入 `innerHTML`，回放数据被篡改或网络注入恶意 icon 时可执行任意脚本 |
| **根因** | `detailEl.innerHTML = \`${desc.icon} <strong>${Utils.escapeHtml(desc.text)}</strong>\`` — icon 未转义 |
| **修复** | 使用 `textContent` + `appendChild` 替代 `innerHTML` |
| **优先级** | P0 |

---

### C14. 主程序：键盘 skip 绕过可用性校验

| 属性 | 内容 |
|------|------|
| **位置** | `js/main.js:2957-2961` |
| **影响** | 玩家可在无法「过」的回合按 `S` 键触发 skip，破坏游戏状态机 |
| **根因** | `chi/peng/gang/hu` 快捷键都校验了按钮 `disabled` 状态，`skip` 没有 |
| **修复** | `case 's': case 'S': if (!document.getElementById('btn-skip').disabled) handleAction('skip'); break;` |
| **优先级** | P0 |

---

### C15. 规则系统：胡牌判断无记忆化（指数级性能）

| 属性 | 内容 |
|------|------|
| **位置** | `js/core/rules.js:94-196` |
| **影响** | 复杂手牌胡牌判断耗时指数增长；AI 单次弃牌决策触发 340+ 次 `canWin` |
| **根因** | 递归回溯每次新建数组，无 memoization |
| **修复** | 增加 LRU 缓存：`const winCache = new Map()`，key 为手牌签名字符串 |
| **优先级** | P0 |

---

### C16. 规则系统：七对判断允许「四张 = 两对」

| 属性 | 内容 |
|------|------|
| **位置** | `js/core/rules.js:242-251` |
| **影响** | 手牌有 4 张相同牌时判定为「2 对」，但标准规则要求 7 个**不同**的对子 |
| **根因** | `pairCount += counts[key] / 2` 允许 4 张拆成两对 |
| **修复** | `const pairs = Object.values(counts).filter(c => c >= 2).length; return pairs === 7 && tiles.length === 14;` |
| **优先级** | P0 |

---

### C17. 规则系统：`canWin` 贪心回溯可能漏解

| 属性 | 内容 |
|------|------|
| **位置** | `js/core/rules.js:129-196` |
| **影响** | 某些特殊牌型中，先选刻子可能导致后续无法成顺子，而先选顺子可以完成 |
| **根因** | `tryFormMelds` 先尝试刻子再尝试顺子，一旦某分支失败就返回 false，不回溯 |
| **修复** | 刻子分支失败时继续尝试顺子分支；或增加 memoization 缓存已失败的牌型签名 |
| **优先级** | P1 |

---

### C18. 引擎：`checkActions` 单一动作限制

| 属性 | 内容 |
|------|------|
| **位置** | `js/core/engine.js:434-460` |
| **影响** | 某玩家同时拥有「胡」和「碰」时，系统只返回「胡」。AI 拒绝胡后，该玩家失去碰/杠/吃机会 |
| **根因** | `checkActions` 按 `hu > gang > peng > chi` 顺序 `return` 第一个可用动作 |
| **修复** | `checkActions` 返回数组；`waitForActions` 中 AI 对数组逐项决策 |
| **优先级** | P0 |

---

### C19. components.js：多处 innerHTML XSS

| 属性 | 内容 |
|------|------|
| **位置** | `js/ui/components.js:160-164` (`player.name`), `js/ui/components.js:227` (`createModal` content), `js/ui/components.js:262-271` (achievement fields), `js/ui/components.js:285-294` (replay fields), `js/ui/components.js:309-315` (room.name) |
| **影响** | 用户输入的 player.name、网络房间的 room.name、成就数据等直接注入 innerHTML，XSS 攻击面极大 |
| **根因** | 模板字符串直接拼接未转义数据到 innerHTML |
| **修复** | 全部改为 `textContent` 或 `document.createTextNode`；`createModal` 提供安全默认模式 |
| **优先级** | P0 |

---

### C20. player.js：`toJSON()` 与 `JSON.stringify` 冲突

| 属性 | 内容 |
|------|------|
| **位置** | `js/core/player.js:96-116` |
| **影响** | `JSON.stringify` 调用 `toJSON` 时会传入**属性键名**作为第一个参数，而非 `true`/`false`。<br>• `JSON.stringify(player)` → `toJSON('')` → `''` falsy → `includeHand=false`（幸运）<br>• `JSON.stringify({a: player})` → `toJSON('a')` → `'a'` truthy → `includeHand=true`<br>• `JSON.stringify([player])` → `toJSON('0')` → truthy → `includeHand=true` |
| **根因** | 方法命名为 `toJSON`，这是 JavaScript 的内建序列化钩子 |
| **修复** | 重命名为 `serialize(includeHand)`，或正确实现 `toJSON(key)` 签名：`toJSON(key) { const includeHand = typeof key === 'boolean' ? key : false; ... }` |
| **优先级** | P0 |

---

### C21. stats.js：数据迁移不完整 → NaN 级联污染

| 属性 | 内容 |
|------|------|
| **位置** | `js/data/stats.js:44-49`, `js/data/stats.js:117`, `js/data/stats.js:137`, `js/data/stats.js:139`, `js/data/stats.js:143`, `js/data/stats.js:147-149` |
| **影响** | 旧数据迁移只补了 4 个字段，其余缺失字段在 `recordGame` 中执行 `undefined++` → `NaN`、`undefined > 200` → `false`（bestGame 永远无法更新）、`undefined += netScore` → `NaN`。统计系统一旦污染，永久损坏 |
| **复现** | 清除 localStorage 中部分字段 → 刷新页面 → 打一局 → 检查 stats，多个字段为 NaN |
| **根因** | `getStats()` 的 migration 只 patch 4 个字段，未使用深合并确保所有 DEFAULT_STATS 字段存在 |
| **修复** | `stats = { ...DEFAULT_STATS, ...saved, ...patches }` — 确保所有缺省字段都被填充；或显式遍历 DEFAULT_STATS 补全缺失键 |
| **优先级** | P0 |

---

### C22. stats.js：Storage.set() 失败被静默忽略

| 属性 | 内容 |
|------|------|
| **位置** | `js/data/stats.js:53-55`, `js/data/storage.js:21-28` |
| **影响** | `localStorage` 配额超限时 `Storage.set()` 返回 `false` 但 `saveStats()` 不检查返回值；`recordGame()` 已将 stats 对象在内存中修改，调用者以为已持久化，刷新页面后数据丢失 |
| **根因** | 调用链：`recordGame → saveStats → Storage.set → catch → 返回 false`，但没有任何一层检查返回值或抛异常 |
| **修复** | `Storage.set` 失败时抛异常；`saveStats` 用 try/catch 包裹并 toast 提示用户；或改用 IndexedDB |
| **优先级** | P0 |

---

### C23. stats.js：`recordGame` 接收 null 会崩溃

| 属性 | 内容 |
|------|------|
| **位置** | `js/data/stats.js:115` |
| **影响** | `recordGame(null)` → `result.isWin` 抛出 `TypeError: Cannot read properties of null` |
| **根因** | 函数入口无参数校验 |
| **修复** | `if (!result || typeof result !== 'object') return null;` |
| **优先级** | P0 |

---

### C24. components.js：拖拽强制同步布局（性能灾难）

| 属性 | 内容 |
|------|------|
| **位置** | `js/ui/components.js:107-111`, `js/ui/components.js:119-120` |
| **影响** | 拖拽过程中每次 `mousemove`/`touchmove` 都读取 `offsetWidth` 并设置 `style.left`，强制浏览器在事件循环中同步计算布局。低端机拖拽时帧率暴跌至 <15fps |
| **根因** | `clone.style.left = (clientX - clone.offsetWidth / 2) + 'px'` 在 handler 中读布局再写样式 |
| **修复** | 在 `startDrag` 时缓存 `cloneWidth = clone.offsetWidth`，move handler 中只写不读 |
| **优先级** | P0 |

---

### C25. components.js：粒子/彩带未批处理 + 无 prefers-reduced-motion

| 属性 | 内容 |
|------|------|
| **位置** | `js/ui/components.js:487-493` (particles), `js/ui/components.js:457-524` (confetti), `js/ui/components.js:529-548` (screenShake) |
| **影响** | ① `createParticles` 逐个 `appendChild` 到 container，每次触发重排；② 无 `prefers-reduced-motion` 检查，前庭障碍用户无法关闭动画；③ `screenShake` 在 `#app` 根节点上操作，强制整棵 DOM 树每帧重合成 |
| **修复** | ① 使用 `DocumentFragment` 批量插入；② 全局检查 `window.matchMedia('(prefers-reduced-motion: reduce)').matches` 时跳过动画；③ screenShake 改为在轻量 overlay 上操作 |
| **优先级** | P1 |

---

### C26. audio-manager.js：音频节点永不 disconnect → 内存泄漏

| 属性 | 内容 |
|------|------|
| **位置** | `js/audio/audio-manager.js:55-99, 104-146, 151-193, 198-224, 229-265, 586-617` |
| **影响** | 每发一个音效就创建 Oscillator + Gain 节点，`.start()` / `.stop()` 后从不 `.disconnect()`。长游戏 session（千次音效）后音频图节点无限增长，浏览器音频进程内存暴涨 |
| **根因** | 所有 synthesizer 函数缺少 `onended` 回调来断开节点连接 |
| **修复** | `osc.onended = () => { osc.disconnect(); envelope.disconnect(); };` |
| **优先级** | P0 |

---

### C27. audio-manager.js：BGM 可「复活」+ 已调度音符 stop 后继续播放

| 属性 | 内容 |
|------|------|
| **位置** | `js/audio/audio-manager.js:546-572` (resurrection), `js/audio/audio-manager.js:619-625` (scheduled notes) |
| **影响** | ① `startBgm()` 调用 `stopBgm()` 后若旧 `scheduleNext` 回调已在事件队列中，会看到 `bgmPlaying=true` 并重新启动旧循环，导致两个 BGM 同时播放；② `stopBgm()` 只清 timer，不停止已用 `.start(time)` 调度到未来的音符 |
| **修复** | ① 使用 `bgmGeneration` 计数器，回调中校验 generation；② 维护 `bgmOscillators` 数组，`stopBgm()` 时遍历调用 `.stop()` |
| **优先级** | P1 |

---

### C28. main.js：ReplayPlayer 事件监听器无限泄漏

| 属性 | 内容 |
|------|------|
| **位置** | `js/main.js:1625-1662` (bind), `js/main.js:1619-1623` (destroy) |
| **影响** | 每次打开回放都新建 `ReplayPlayer` 实例并绑定 8 个事件监听器到固定 DOM 元素，`destroy()` 从不移除它们。反复打开 10 次回放后，点击播放按钮触发 10 次播放 |
| **根因** | `_bindEvents()` 使用匿名箭头函数，`destroy()` 未保存引用无法 `removeEventListener` |
| **修复** | ① 将监听器保存为实例方法（`this._boundOnPlay = () => ...`），`destroy()` 中统一移除；② 或改用 `AbortController` |
| **优先级** | P0 |

---

## 🟠 High（32项）

### H1. 信令服务器：Room B 的 start 可被 Room A 的 host 触发
| **位置** | `server/signaling-server.js:260-275` | **修复** | 增加 `p.roomId === roomId` 校验 |

### H2. 信令服务器：`/leave` 全局删除玩家不校验房间
| **位置** | `server/signaling-server.js:277-296` | **修复** | `if (p && p.roomId !== roomId) return 403` |

### H3. 信令服务器：500 响应泄露内部错误详情
| **位置** | `server/signaling-server.js:299-302` | **修复** | 移除 `detail: e.message` |

### H4. 信令服务器：无速率限制
| **位置** | 全局 | **修复** | 引入 per-IP 限速 |

### H5. 信令服务器：SSE 连接覆盖导致 DoS
| **位置** | `server/signaling-server.js:189` | **修复** | 拒绝同一 playerId 的第二个 SSE 连接 |

### H6. P2P：STUN 服务器泄露隐私
| **位置** | `js/network/p2p.js:231-233` | **修复** | 局域网游戏移除 `iceServers` 或仅使用空配置 |

### H7. P2P：URL 参数未编码
| **位置** | `js/network/p2p.js:108` | **修复** | `encodeURIComponent(this.playerId)` |

### H8. P2P：WebRTC 状态未校验
| **位置** | `js/network/p2p.js:278-294` | **修复** | `setRemoteDescription` / `addIceCandidate` 前检查 `pc.signalingState !== 'closed'` |

### H9. 引擎：`matchHistory` 无内存上限
| **位置** | `js/core/engine.js:34, 962-972` | **修复** | `matchHistory` 设置上限（如 50 局） |

### H10. 引擎：`endRound` 中 `sleep(1500)` 不可取消
| **位置** | `js/core/engine.js:995` | **修复** | `await Utils.sleep(1500, this._token)` |

### H11. 引擎：`handleFlower` 无限循环风险
| **位置** | `js/core/engine.js:237-258` | **修复** | `while (this.deck.length > 0 && player.hand.some(t => t.isFlower))` |

### H12. 引擎：圈风计算不符合标准规则
| **位置** | `js/core/engine.js:988` | **修复** | `this.currentWind = (this.round - 1) % 4` |

### H13. 主程序：全量 DOM 重建
| **位置** | `js/main.js:605-665` | **修复** | 引入 keyed diff 增量渲染 |

### H14. 主程序：`initTouchGestures` 事件监听器泄漏
| **位置** | `js/main.js:2971, 2976, 2988` | **修复** | 保存命名函数引用，或只在首次初始化时绑定 |

### H15. 主程序：`applyRemoteState` 直接篡改引擎属性
| **位置** | `js/main.js:2871-2877` | **修复** | 引擎提供 `loadState(snapshot)` 方法 |

### H16. 主程序：Falsy-ID 陷阱
| **位置** | `js/main.js:2003, 2082, 2097, 2113, 2034` | **修复** | 统一使用 `t.id ?? t` |

### H17. 音频：`playNoise` 每次新建 AudioBuffer
| **位置** | `js/audio/audio-manager.js:119-126` | **修复** | 利用 `audioCache` 按 duration 缓存 buffer |

### H18. 音频：BGM `setTimeout` 节拍漂移
| **位置** | `js/audio/audio-manager.js:558, 565-568` | **修复** | 使用 `AudioContext.currentTime` 精确调度，不用 setTimeout |

### H19. 音频：`audioCache` 声明未使用
| **位置** | `js/audio/audio-manager.js:21-22` | **修复** | 移除声明或实现缓存逻辑 |

### H20. 音频：音量突变爆音
| **位置** | `js/audio/audio-manager.js:629-642` | **修复** | `masterGain.gain.setTargetAtTime(muted?0:1, audioCtx.currentTime, 0.01)` |

### H21. AI：单次弃牌 340+ 次向听数计算
| **位置** | `js/ai/ai-utils.js` | **修复** | `calculateStandardShanten` 增加 LRU 缓存 |

### H22. 测试：`replay-data-test.js` 测试的是 mock 而非真实源码
| **位置** | `test/replay-data-test.js:41-71` | **修复** | 调用真实 `Replay.createReplayData` |

### H23. 测试：`ai-test.html` 大量无断言「测试」
| **位置** | `test/ai-test.html:80-92, 104-112` | **修复** | 每个 test 增加期望值比较 |

### H24. 测试：`stats-test.js` 弱断言隐藏 bug
| **位置** | `test/stats-test.js:68, 163, 175` | **修复** | 使用精确值断言 |

### H25. CSS：4152 行严重重复与覆盖
| **位置** | `css/main.css` + `css/game.css` + `css/ui-overhaul.css` | **修复** | 合并去重，使用 CSS 变量统一管理 |

### H26. HTML：无障碍全面缺失
| **位置** | `index.html` 全局 | **修复** | 添加 label-for、ARIA、移除 `user-scalable=no`、增加 `<noscript>` |

### H27. components.js：modal 无 ARIA 与焦点管理
| **位置** | `js/ui/components.js:212-253` | **修复** | 增加 `role="dialog" aria-modal="true"`、Escape 关闭、焦点trap |

### H28. components.js：showWinEffect 未检查 #app 存在
| **位置** | `js/ui/components.js:362-396` | **修复** | `const app = document.getElementById('app'); if (!app) return;` |

### H29. player.js：`removeFromHand` 重复 ID 导致错误删除
| **位置** | `js/core/player.js:58-68` | **修复** | 使用计数器方式：先统计各 ID 出现次数，再按次数移除 |

### H30. player.js：`addScore` 字符串拼接污染
| **位置** | `js/core/player.js:70-73` | **修复** | `if (typeof delta !== 'number') throw new TypeError('delta must be number'); this.score += delta;` |

### H31. player.js：`reset()` 不重置 `queYiMen` 和 `isDealer`
| **位置** | `js/core/player.js:25-33` | **修复** | `this.queYiMen = null; this.isDealer = false;` |

### H32. main.js：回放播放器 O(n²) 重建
| **位置** | `js/main.js:1860-1892` | **修复** | `goToStep` 改为增量应用：从 currentStep 到 targetStep 只 apply 差异步 |

---

## 🟡 Medium（28项）

### M1. 引擎：`executeChi/executePeng/executeGang` AI 弃牌后无状态回滚
| **位置** | `js/core/engine.js:550-697` | **修复** | AI 无牌可打时随机选一张强制打出，不跳过回合 |

### M2. 引擎：`removeFromDiscardPile` 按 ID 匹配但可能移除错误牌
| **位置** | `js/core/engine.js:814-820` | **修复** | 直接传入 index 移除 |

### M3. 引擎：`playerDiscard` 恢复 timer 但回合玩家可能已变
| **位置** | `js/core/engine.js:328-356` | **修复** | 无效弃牌后不自动恢复 timer |

### M4. 引擎：`buildAIContext` 暴露 `selfIndex` 为 player.id
| **位置** | `js/core/engine.js:807` | **修复** | `selfIndex: forPlayer.position` 或 `selfId: forPlayer.id` |

### M5. 规则系统：`isThirteenOrphans` 使用 `createTile` 构造 required set
| **位置** | `js/core/rules.js:256-280` | **修复** | 使用字符串 key 数组 |

### M6. 规则系统：`canChi` 返回结果含 discard tile 对象
| **位置** | `js/core/rules.js:301-327` | **修复** | 返回 ID 引用或深拷贝 |

### M7. 规则系统：番数表默认值逻辑矛盾
| **位置** | `js/core/rules.js:12-36` | **修复** | 默认表中 0 改为保底值，或增加安全网 |

### M8. 规则系统：`calculateFan` 中 `context.gangCount` 乘以 `gang` 番数
| **位置** | `js/core/rules.js:512-518` | **修复** | context 中区分 mingGang/anGang/jiaGang |

### M9. 主程序：网络大厅就绪人数显示 `N/N`
| **位置** | `js/main.js:2507-2509` | **修复** | `\`${players.length}/${room.maxPlayers} 人\`` |

### M10. 主程序：`_removeFromHand` 可能返回 undefined
| **位置** | `js/main.js:2021-2023, 2031-2035` | **修复** | `const obj = _removeFromHand(p, tileId); if (!obj) return;` |

### M11. 主程序：回放播放器 `this.players` 长度假设
| **位置** | `js/main.js:2066` | **修复** | `const count = this.players?.length || 4` |

### M12. 回放系统：`createReplayData` 的 `lastSaved !== engine.round` 判断不严谨
| **位置** | `js/data/replay.js:51-52` | **修复** | 增加 `|| engine.gameHistory.length > 0` |

### M13. 统计系统：`addExp` 无输入校验 + 超大 amount 卡死
| **位置** | `js/data/stats.js:64, 72, 81-86` | **修复** | `if (typeof amount !== 'number' || amount < 0 || amount > 1e6) throw new Error('Invalid exp amount')` |

### M14. 统计系统：`bestGame` / `mostBombs` 等字段 undefined 比较陷阱
| **位置** | `js/data/stats.js:139, 143` | **修复** | `if (bestGame === undefined || netScore > bestGame)` |

### M15. 统计系统：成就 `big_win` 边界含混（>= 200 vs > 200）
| **位置** | `js/data/stats.js:205, 214` | **修复** | 统一为 `>` 或修改描述为「达到 200」 |

### M16. 统计系统：`all_types` 进度计算潜在除零
| **位置** | `js/data/stats.js:237` | **修复** | `Math.min(10, Math.max(1, totalTypes))` |

### M17. 统计系统：历史记录 50 条上限无测试
| **位置** | `js/data/stats.js` | **修复** | 增加测试覆盖 |

### M18. 音频：BGM `zen` 模式音符越界
| **位置** | `js/audio/audio-manager.js:534-543` | **修复** | `MINOR_PENTATONIC` 改为 6 音阶或修正 pattern |

### M19. 音频：`audioCtx` zombie 状态阻止恢复
| **位置** | `js/audio/audio-manager.js:24-26` | **修复** | `if (audioCtx && audioCtx.state !== 'closed') return;` |

### M20. 音频：`isPlaying` 与实际音频状态不同步
| **位置** | `js/audio/audio-manager.js:667` | **修复** | `get isPlaying() { return bgmPlaying && audioCtx?.state === 'running'; }` |

### M21. P2P：`_sendSignal` 无超时且静默吞错
| **位置** | `js/network/p2p.js:296-303` | **修复** | 使用 `AbortController` + 5 秒超时 |

### M22. P2P：`leaveRoom` 重复清理
| **位置** | `js/network/p2p.js:341-348` | **修复** | 移除 `this.peers.clear()` |

### M23. P2P：`ondatachannel` 可覆盖旧通道
| **位置** | `js/network/p2p.js:245-247` | **修复** | 覆盖前 `const old = this.channels.get(playerId); if (old) old.close()` |

### M24. CSS：`themes.css` 仅覆盖 4 个变量
| **位置** | `css/themes.css:1-33` | **修复** | 每个主题覆盖全部色板变量 |

### M25. CSS：`animations.css` 引用未定义类
| **位置** | `css/animations.css:692-724` | **修复** | 补充或删除引用 |

### M26. CSS：`winRingExpand` 触发布局重排
| **位置** | `css/animations.css:254-267` | **修复** | 改用 `transform: scale()` |

### M27. components.js：拖拽中 DOM 被移除导致监听器泄漏
| **位置** | `js/ui/components.js:76-93, 124-150` | **修复** | 使用 `AbortController` 或全局清理机制 |

### M28. components.js：粒子/confetti 超时保留 DOM 引用
| **位置** | `js/ui/components.js:492-493, 521-522` | **修复** | 游戏退出时遍历清除所有 pending timeouts |

---

## 🟢 Low（18项）

### L1. 主程序：空 JSDoc 死代码
| **位置** | `js/main.js:2278-2280` | **修复** | 删除 |

### L2. 主程序：`Utils.escapeHtml` 与 `textContent` 冗余
| **位置** | `js/main.js:2144` | **修复** | 移除 `escapeHtml` |

### L3. 主程序：远程动作处理重复代码
| **位置** | `js/main.js:2809-2827` | **修复** | 提取 `executeClaimAction(type)` |

### L4. 引擎：`executeHu` 分数计算可能溢出
| **位置** | `js/core/engine.js:880` | **修复** | `Math.min(Number.MAX_SAFE_INTEGER, ...)` |

### L5. 规则系统：`findSequenceIndices` O(n²)
| **位置** | `js/core/rules.js:200-227` | **修复** | 使用哈希表预索引 |

### L6. 规则系统：`removeIndices` 多次 `splice`
| **位置** | `js/core/rules.js:229-236` | **修复** | 使用 `filter` |

### L7. 音频：SFX 重叠无实例跟踪
| **位置** | `js/audio/audio-manager.js:269-503` | **修复** | 可选：同类型 SFX 限制并发数 |

### L8. 音频：BGM 随机旋律非确定性
| **位置** | `js/audio/audio-manager.js` | **修复** | 使用种子随机数生成器 |

### L9. 数据层：无 schema 版本迁移
| **位置** | `js/data/storage.js` | **修复** | 存储对象增加 `_schemaVersion` |

### L10. HTML：无 meta description / OG tags
| **位置** | `index.html:3-12` | **修复** | 增加 SEO meta |

### L11. HTML：脚本同步加载无 defer
| **位置** | `index.html:593-606` | **修复** | 添加 `defer`（注意全局变量顺序） |

### L12. README：架构路径过时
| **位置** | `README.md:100-118` | **修复** | 补充 `ai-utils.js`、`ui-overhaul.css` |

### L13. README：开发计划中未实现项无说明
| **位置** | `README.md:129-132` | **修复** | 标注 `[已搁置]` 或移除 |

### L14. 测试：无负向测试
| **位置** | `test/rules-test-node.js` | **修复** | 增加不可胡牌型测试 |

### L15. 测试：无异步测试框架
| **位置** | 全部 `.html` 测试 | **修复** | 引入 Playwright 或 Puppeteer |

### L16. player.js：`hasTile` 语义与 `discard` 不一致
| **位置** | `js/core/player.js:44-51, 88-90` | **修复** | 统一按 ID 或统一按 suit+value |

### L17. player.js：无 `addFlower` 方法
| **位置** | `js/core/player.js:19` | **修复** | 补充 `addFlower(tile)` 方法 |

### L18. 全局：代码未压缩但无 source map
| **位置** | 全局 | **修复** | 如需生产部署引入 esbuild/rollup |

---

## 修复优先级矩阵

| 优先级 | 问题 ID | 预计工时 | 影响范围 |
|--------|---------|---------|---------|
| **本周（P0）** | C1-C6, C8-C10, C12-C16, C18-C19, C21-C24, C26, C28 | 5-6 天 | 安全、崩溃、核心规则、内存泄漏 |
| **下周（P1）** | C7, C11, C17, C25, C27, H1-H9, H13-H19, H27-H32 | 5-6 天 | 性能、架构、P2P、音频、UX |
| **第3周（P2）** | H10-H12, H20-H26, M1-M28 | 4-5 天 | 边界条件、可维护性、状态管理 |
| **第4周（P3）** | L1-L18 | 2 天 | 代码质量、文档 |

---

*报告整合完毕。建议按 P0 → P1 → P2 → P3 的顺序逐批修复，每修复一批跑一次全量测试。*
