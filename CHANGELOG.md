# Changelog

## [1.0.11] - 2026-07-24

### Fixed
- 修复手机竖屏回放中左右玩家姓名、分数与牌面整体旋转，造成文字重叠和局面难以辨认的问题。
- Service Worker 缓存升级到 `mahjong-v12`，确保客户端及时取得本次界面与音频体验修复。

### Improved
- 首屏加载遮罩在初始化完成后快速退场，不再为纯本地资源强制等待 1.8 秒，并补充加载状态语义。
- 设置中的 BGM/SFX 文案改为直观中文，音效音量调整完成后会即时试听当前响度。

### Tests
- Playwright 回归由 36 项扩展到 39 项，新增首屏退场、音效音量试听和手机竖屏回放可读性覆盖。
- 规则、统计/成就、AI 向听、回放数据、引擎与完整浏览器回归继续作为发布门禁。

## 历史公告

### [1.0.10] - 2026-07-23

#### Fixed
- 修复摸牌动画结束后动画类不清理，导致摸到的牌持续覆盖悬停和选中反馈；台湾麻将 17 张手牌在小屏及边缘选中状态下保留完整安全区。
- 修复拖拽出牌后回合指引仍显示旧选牌内容，以及跳过自摸或暗杠后指引和可见倒计时没有恢复的问题。
- 修复取消多选暗杠弹窗后杠按钮被禁用、无法重新选择的问题。
- 修复联机访客状态同步后当前回合高亮和操作指引不更新，以及跳过暗杠后在房主确认前错误重新启用手牌的问题。
- 修复摸牌和打牌事件未向 SFX 传递具体牌对象，导致按花色设计的音色全部退化为默认音色的问题。
- Service Worker 缓存升级到 `mahjong-v11`，确保客户端及时取得本次交互、布局和音频修复。

#### Improved
- 牌桌加入支持 `aria-live` 的实时回合指引，覆盖摸牌、选牌、等待玩家、响应动作和等待房主确认等状态；选牌后会显示具体牌名。
- 没有可用动作时自动收起吃、碰、杠、胡、过按钮，减少手机牌桌遮挡；动作出现时同步恢复视觉与可访问状态。
- 动作栏只展示当前可用动作并避开本家姓名、向听数和手牌区域，减少桌面与手机横屏中的无效按钮和信息遮挡。
- 向听数并入本家信息条，移除容易与动作栏、姓名和手牌争抢空间的绝对定位浮标。
- 手机 15–18 张手牌按牌数分别计算叠放间距，普通 14 张与台湾 17 张均无需隐性横向滚动。

#### Tests
- Playwright 回归由 27 项扩展到 36 项，新增发布元数据、完整合成音频、花色 SFX 参数、拖拽提示、跳过动作、暗杠取消和联机权威状态同步覆盖。
- Playwright 服务器改为隔离启动并支持 `PLAYWRIGHT_PORT` 覆盖，避免测试端口被其他项目占用时静默测试错误网站。
- 继续覆盖桌面、笔记本、手机横竖屏六档牌桌与回放视口，并验证动画清理、手牌边缘安全区、动作栏显隐和无页面滚动。
- 规则、统计/成就、AI 向听、回放数据和引擎测试继续全部通过。

### [1.0.9] - 2026-07-22

#### Fixed
- 修复手机竖屏本家 14 张手牌需要横向滚动、台湾麻将 17 张手牌被裁切，以及 1280×720 笔记本窗口存在隐性横滚的问题；低高度横屏同步收紧牌宽并保留完整可操作牌列。
- 修复对局 Toast 覆盖本家手牌、向听数和底部触控区的问题，提示改到牌桌中央信息区显示。
- 修复设置滑块防抖保存失败后控件、内存设置与实际音量互相不一致，以及 range 的 change/input 事件重复写入存储的问题；BGM 风格与自动补足音量改为一次原子保存。
- 修复有效 JSON 中的异常设置可把音量传成 `NaN`、无效枚举进入界面，以及损坏统计数组导致战绩/成就逻辑抛错的问题；音频 API 也会独立拒绝非有限音量。
- 修复空回放或字段损坏的回放继续显示上一条回放的牌桌、时间轴、分数与步骤计数，以及损坏回放集合阻断应用启动的问题。
- 修复联机访客收不到最终结算、结算与胜负音效始终把 0 号位当成本地玩家，以及结算奖励缺少麻将类型名称的问题；终局数据只接受可信房主并校验玩家位置和分数。
- 修复手机自定义、联机、回放、成就和战绩页标题被旧 flex 规则与返回按钮遮挡，以及零场战绩显示内部 `-999999` 哨兵值的问题。
- Service Worker 缓存升级到 `mahjong-v10`，确保客户端及时取得本次布局、联机、回放、设置和音频修复。

#### Improved
- 自定义麻将类型的 Unicode 牌面加入高对比浅色牌坯，在深色主题和手机屏幕上更容易辨认。
- 回放读取会限制到最近 30 条并过滤非对象记录；空数据状态会统一清理桌面和禁用播放控件。
- 设置读取统一归一化玩家名、枚举、局数、布尔值和 0–100 音量，避免旧数据或手工修改污染运行时状态。

#### Tests
- Playwright 回归由 22 项扩展到 27 项，新增损坏设置/回放、滑块保存失败回滚、联机访客本地化结算和台湾 17 张手机手牌覆盖。
- 牌桌六档视口新增本家手牌横向包含与隐性滚动断言；继续输出桌面、手机横竖屏牌桌与回放截图做视觉复核。
- 统计单元回归新增设置和统计数据归一化、零场最高净胜展示验证，并继续通过规则、AI、回放和引擎全套测试。

### [1.0.8] - 2026-07-19

#### Fixed
- 修复玩家手牌只能鼠标点击、无法通过键盘选择和打出的问题；非玩家回合会同步移出 Tab 顺序并更新禁用语义。
- 修复吃牌、杠牌选项和通用胡牌弹窗缺少对话框语义、焦点管理与 Esc 关闭能力的问题；关闭后会恢复原触发控件焦点。
- 修复回放播放器重新打开后倍速按钮保留旧显示、自动播放到最终步骤仍多等待一个节拍，以及玩家名在动作详情中被重复 HTML 转义的问题。
- 修复统计持久化失败后结算逻辑继续访问空结果并抛出二次异常的问题。
- 修复房间名、玩家名等安全文本传入 Toast 前被重复转义，导致界面显示 `&lt;` 等实体的问题。
- 修复音效音量为 0 或静音时仍创建 Web Audio 节点并排程延迟音效的问题；静音时会立即清理已排程 SFX。
- 修复手机设置滑块实际触控高度仅约 4px、文本框与下拉框不足 44px，以及回放进度条难以触控的问题。
- Service Worker 缓存升级到 `mahjong-v9`，确保客户端及时取得本次交互、音频与样式修复。

#### Improved
- 音频主输出加入动态压缩限幅，降低多个合成音与和弦同时播放时的削波失真。
- 牌型选择项改为原生按钮，玩家牌补充可访问名称、键盘激活和明确的可用状态。
- 重新收紧低高度横屏回放中央弃牌区，保留更大的进度条触控区域同时避免四家手牌侵入。

#### Tests
- Playwright 回归扩展到 22 项，新增玩家手牌键盘出牌、通用弹窗、牌型选择器、零音量 SFX、统计保存失败、移动端触控尺寸及回放重开/终点行为。
- 继续覆盖桌面、笔记本、手机横竖屏六档牌桌与四档回放视口，并输出关键截图供视觉复核。

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
