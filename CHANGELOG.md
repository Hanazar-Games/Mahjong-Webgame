# Changelog

## [1.0.4] - 2026-07-05

### Fixed
- 修复对局牌桌被旧绝对定位和 3D transform 规则共同覆盖，导致玩家区域挤到边缘、底部手牌出屏、右侧玩家压住本家区域的严重布局问题。
- 重新约束桌面和移动端的牌桌 grid、玩家手牌、弃牌区和动作按钮安全区，避免宽屏下大面积空桌和控件互相覆盖。
- Service Worker 缓存升级到 `mahjong-v5`，确保新的牌桌布局覆盖旧缓存。

## 历史公告

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
