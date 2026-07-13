# Changelog

## [1.0.6] - 2026-07-13

### Fixed
- 修复全局 44px 触控最小尺寸覆盖响应式麻将牌尺寸，导致桌面、720p、手机横竖屏出现对家与侧家牌堆裁切的问题。
- 重构 1440×900、1280×720、390×844、375×667、844×390、667×375 六档牌桌安全区；手机竖屏的上下家改为横跨牌桌，侧家 14 张短暂摸牌与动作栏不再压住本家手牌。
- 修复低高度横屏主菜单内容溢出后首个按钮被顶部品牌区遮挡、无法点击的问题。
- 修复游戏内从暂停菜单打开设置时倒计时在后台恢复，以及 Esc 会叠加或关闭错误弹窗的问题；关闭设置后会回到仍暂停的菜单。
- 修复“对手牌显示”在牌局中切换后不能即时刷新，要等下一次引擎事件才生效的问题。
- 修复 SFX/BGM 在音源包络和分轨总线上重复应用用户音量，导致实际响度呈平方衰减的问题。
- 修复关闭音效、停止 BGM 或切换牌局时只清理延迟任务、已排程长音仍继续播放的问题。
- 修复联网房间元数据、回放分数/图标等动态内容未完整归一化或转义的注入风险。
- Service Worker 缓存升级到 `mahjong-v7`，并为离线导航增加首页回退、跳过非 GET 请求。

### Improved
- 自定义麻将牌种改为原生键盘可操作按钮，并补充选中状态；设置与暂停弹窗加入焦点循环和触发点恢复。
- 补充游戏菜单、联网表单标签以及联网状态/错误的无障碍名称和实时播报。
- 恢复浏览器双指缩放能力，并为回放进度补充可访问名称。

### Tests
- 新增 Playwright 端到端回归，覆盖主要入口、设置持久化、暂停设置、对手显示、联网/自定义入口与六种关键视口。
- 扩展 `npm test`，纳入规则、统计、AI 工具、回放数据和引擎共 121 项断言；新增 `npm run test:all` 全量命令。

## 历史公告

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
