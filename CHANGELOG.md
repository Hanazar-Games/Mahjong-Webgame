# Changelog

## [1.0.8] - 2026-07-19

### Fixed
- 修复玩家手牌只能鼠标点击、无法通过键盘选择和打出的问题；非玩家回合会同步移出 Tab 顺序并更新禁用语义。
- 修复吃牌、杠牌选项和通用胡牌弹窗缺少对话框语义、焦点管理与 Esc 关闭能力的问题；关闭后会恢复原触发控件焦点。
- 修复回放播放器重新打开后倍速按钮保留旧显示、自动播放到最终步骤仍多等待一个节拍，以及玩家名在动作详情中被重复 HTML 转义的问题。
- 修复统计持久化失败后结算逻辑继续访问空结果并抛出二次异常的问题。
- 修复房间名、玩家名等安全文本传入 Toast 前被重复转义，导致界面显示 `&lt;` 等实体的问题。
- 修复音效音量为 0 或静音时仍创建 Web Audio 节点并排程延迟音效的问题；静音时会立即清理已排程 SFX。
- 修复手机设置滑块实际触控高度仅约 4px、文本框与下拉框不足 44px，以及回放进度条难以触控的问题。
- Service Worker 缓存升级到 `mahjong-v9`，确保客户端及时取得本次交互、音频与样式修复。

### Improved
- 音频主输出加入动态压缩限幅，降低多个合成音与和弦同时播放时的削波失真。
- 牌型选择项改为原生按钮，玩家牌补充可访问名称、键盘激活和明确的可用状态。
- 重新收紧低高度横屏回放中央弃牌区，保留更大的进度条触控区域同时避免四家手牌侵入。

### Tests
- Playwright 回归扩展到 22 项，新增玩家手牌键盘出牌、通用弹窗、牌型选择器、零音量 SFX、统计保存失败、移动端触控尺寸及回放重开/终点行为。
- 继续覆盖桌面、笔记本、手机横竖屏六档牌桌与四档回放视口，并输出关键截图供视觉复核。

## 历史公告

### [1.0.7] - 2026-07-14

#### Fixed
- 修复回放牌桌未受可用高度约束，导致手机横屏和低高度窗口中牌桌、手牌被页头与控制栏裁切的问题。
- 修复通用麻将牌尺寸后加载并覆盖回放专用尺寸，导致回放手牌与弃牌异常放大、侵入中央弃牌区的问题；重新适配桌面、手机竖屏和两档横屏布局。
- 修复页面切换只更新视觉状态却未统一同步 `App.currentScreen`，导致返回列表、返回菜单后键盘与手势逻辑仍可能认为停留在旧页面的问题。
- 修复非活动页面仍能被键盘 Tab 聚焦的问题，并为全局键盘操作补充清晰焦点环。
- 修复切到后台后 BGM 仍继续排程、长 SFX 仍可能继续播放的问题；页面恢复可见后只恢复此前正在播放的 BGM。
- Service Worker 缓存升级到 `mahjong-v8`，确保客户端及时取得本次界面与音频修复。

#### Improved
- 回放时间轴改为原生键盘可操作按钮，当前步骤增加语义标记；播放、步进、换局和倍速按钮补充动态可访问名称。
- 回放控制在首尾步骤、首尾局和空数据状态下会正确禁用不可执行操作，减少无反馈点击。
- 放大桌面回放牌桌，并为竖屏回放采用方形安全区与紧凑牌张，提升信息密度和可读性。

#### Tests
- 新增带真实牌张状态的回放端到端回归，覆盖桌面、手机竖屏、手机横屏和小屏横屏的溢出、遮挡、键盘操作、控件状态与运行时错误。
- 扩展主流程回归，校验隐藏页面不可见及页面状态同步，并保留关键视口截图用于视觉复核。

### [1.0.6] - 2026-07-13

#### Fixed
- 修复全局 44px 触控最小尺寸覆盖响应式麻将牌尺寸，导致桌面、720p、手机横竖屏出现对家与侧家牌堆裁切的问题。
- 重构 1440×900、1280×720、390×844、375×667、844×390、667×375 六档牌桌安全区；手机竖屏的上下家改为横跨牌桌，侧家 14 张短暂摸牌与动作栏不再压住本家手牌。
- 修复低高度横屏主菜单内容溢出后首个按钮被顶部品牌区遮挡、无法点击的问题。
- 修复游戏内从暂停菜单打开设置时倒计时在后台恢复，以及 Esc 会叠加或关闭错误弹窗的问题；关闭设置后会回到仍暂停的菜单。
- 修复“对手牌显示”在牌局中切换后不能即时刷新，要等下一次引擎事件才生效的问题。
- 修复 SFX/BGM 在音源包络和分轨总线上重复应用用户音量，导致实际响度呈平方衰减的问题。
- 修复关闭音效、停止 BGM 或切换牌局时只清理延迟任务、已排程长音仍继续播放的问题。
- 修复联网房间元数据、回放分数/图标等动态内容未完整归一化或转义的注入风险。
- Service Worker 缓存升级到 `mahjong-v7`，并为离线导航增加首页回退、跳过非 GET 请求。

#### Improved
- 自定义麻将牌种改为原生键盘可操作按钮，并补充选中状态；设置与暂停弹窗加入焦点循环和触发点恢复。
- 补充游戏菜单、联网表单标签以及联网状态/错误的无障碍名称和实时播报。
- 恢复浏览器双指缩放能力，并为回放进度补充可访问名称。

#### Tests
- 新增 Playwright 端到端回归，覆盖主要入口、设置持久化、暂停设置、对手显示、联网/自定义入口与六种关键视口。
- 扩展 `npm test`，纳入规则、统计、AI 工具、回放数据和引擎共 121 项断言；新增 `npm run test:all` 全量命令。

### [1.0.5] - 2026-07-07

### Fixed
- 继续修复宽屏低高比窗口下左右玩家竖向牌堆过高的问题，改为响应式压缩侧边牌尺寸而不是裁切牌堆。
- 修复当前回合高亮最终覆盖选择器不匹配的问题，确保 `.player-area.current-turn` 能正确高亮玩家信息。
- Service Worker 缓存升级到 `mahjong-v6`，确保侧边牌堆布局修复能刷新到客户端。

### [1.0.4] - 2026-07-05

### Fixed
- 修复对局牌桌被旧绝对定位和 3D transform 规则共同覆盖，导致玩家区域挤到边缘、底部手牌出屏、右侧玩家压住本家区域的严重布局问题。
- 重新约束桌面和移动端的牌桌 grid、玩家手牌、弃牌区和动作按钮安全区，避免宽屏下大面积空桌和控件互相覆盖。
- Service Worker 缓存升级到 `mahjong-v5`，确保新的牌桌布局覆盖旧缓存。

### [1.0.3] - 2026-07-01

### Fixed
- 修复游戏快捷键被隐藏弹窗误判拦截的问题，吃、碰、杠、胡和跳过快捷键恢复可用。
- 修复首次点击时 WebAudio 尚未初始化导致第一声 SFX 可能丢失的问题。
- 修复结算后重新开局时已启用的 BGM 不会恢复播放的问题。
- 修复 BGM/SFX 音量滑块的百分比读数元素 ID 不一致，导致拖动时文字不同步的问题。

### Improved
- BGM 风格从关闭切换到具体风格时，如果音量为 0 会自动提升到 30%，避免用户开启后无声。
- 设置弹窗补充表单标签关联、关闭按钮可访问名称，并改善小屏设置行布局。
- Service Worker 缓存升级到 `mahjong-v4`，确保本次 UI/音频修复能刷新到客户端。

### [1.0.2] - 2026-06-30

### Fixed
- 修复 GitHub Pages/子路径部署时 PWA `start_url`、scope 和 Service Worker 静态缓存使用站点根路径导致的 404。
- 添加显式 SVG favicon，避免浏览器回退请求 `/favicon.ico` 时产生 404。

### [1.0.1] - 2026-06-29

### Fixed
- 联机房主现在会接受等待态下访客发来的吃、碰、杠、胡、跳过动作，避免远程玩家可见按钮但操作无效。
- 动作区的「跳过」按钮会随吃、碰、杠、胡、自摸和暗杠机会一起启用和禁用，键盘 S 快捷键也能稳定工作。
- BGM 设置从“不可播放”修复为默认关闭、手动可开启；音量滑块和风格选择会即时同步播放状态。

### Changed
- 版本号更新到 1.0.1，本次公告成为当前版本公告。

### [1.0.0] - 2026-06-29

### Security
- C8: Validate player ownership in server leave endpoint (403 Forbidden)
- replay-ui: Escape desc.text and desc.icon before innerHTML insertion
- p2p.js: Validate DataChannel messages are plain objects with string type

### Critical Fixes
- C1: P2P remote claim actions distinguish turn vs claim (pendingAction validation)
- C2: Engine start() CANCELLED errors caught silently
- C3: main.js global event listener leaks resolved via architecture split
- C4: Engine destroy() emits beforeDestroy; closures check engine.state
- C5: Result page buttons use addEventListener
- C6: Storage.get() distinguishes missing vs corrupted data
- C7: Stats.recordGame wrapped in try-catch with toast on failure
- C9: SSE heartbeat interval cleared on req.error

### Performance
- CSS contain/layout on game-table, player-area, discard-pile
- will-change: transform on mahjong-tile
- Batch renderDiscardPile/renderPlayerHand in requestAnimationFrame
- Replace force-reflow with double rAF

### Mobile UX
- viewport-fit=cover, maximum-scale=1.0, user-scalable=no
- touch-action: manipulation + 44px min-size
- @media (hover: hover) wrapper for hover effects
- iPhone X+ safe-area-inset-top/bottom
- PWA manifest + Service Worker (offline support)

### Memory Leaks
- setupDrag isListening flag prevents duplicate listeners
- cleanupDrag() called before element removal
- Timer interval cleanup via beforeDestroy event
- closeAllSelectors() resolves pending Promise on game end

### New Features
- Real-time shanten HUD (向听数) above player's hand
- Tenpai winning tiles count when shanten === 0
- Shanten HUD toggle in settings
- 3 new themes: amethyst, ink, sunset
- AI action failure: remove only failed action, retry remaining queue

### Code Quality
- Extract magic numbers to constants (MAX_FLOWERS, MAX_GAME_HISTORY, etc.)
- JSDoc for engine public API methods
- devLog/devWarn gated by NODE_ENV on server
- levelResult validation before return
