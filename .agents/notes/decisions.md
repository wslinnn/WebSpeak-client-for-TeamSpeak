# 决策记录：不变量 / 否决项 / 重开项（改相关区域或立项前必读）

> 拆分自根 AGENTS.md。触发场景：改会话恢复/收藏/切服/移动端布局/浮层/存储相关代码，或立项评估新方案时。

## 会话回归不变量（勿回退）

- 自动恢复有终态拒绝（封禁/密码错/昵称占用/身份冲突）即清意图；显式加入导航（URL 带 server/tsHost/target 等）优先于自动恢复。
- 头像交付=无账本的 URL 快照（2026-10-14 URL 化改造，终结三轮推送漏发返工）：视图（重）附着一律走 attachAvatars（snapshot() 全集 + retryFailedDownloads + 下载排期），**禁止引入「谁已见过哪些字节」的记账状态**——推送字节+视图记账是已被证伪的模型；字节经 `GET /avatars/:aid?v=<内容hash>` 由浏览器 HTTP 缓存吸收（404 不入前端状态，保持首字母回落）。URL 稳定性是缓存命中的前提：aid 是 HMAC capability（URL 即凭证、无时效），勿加时效签名或把签名放进 query；缓存只存正项，failure 记 view-local absent/error。loader 语义有单测、resume 接线有集成测试、端点响应头有独立测试钉住。
- 音频处理默认（2026-10-14 拍板）：增加延迟的处理默认关——回声消除默认关（外放用户自行开启防回声）、自动增益默认关，降噪默认开；三开关在桌面音频坞麦克风面板与移动音频设置，经约束重配+偏好持久化（touched 门控），勿静默回退默认值。
- 上行链形态（2026-10-14 重构）：单层增益 + R/G 模式（raw 直连/处理混音，replaceTrack 切换）——细则与红线（单增益、麦测试增益门控、stopCapture 边界、accompaniment target 稳定身份）钉在 voice.md 回归不变量节。
- 语音内切换不同服务器=显式离开（内部断开 1000 → 网关 teardown，不进 detached 池），同目标换频道走 switchChannel。
- 收藏密码只存在于 IndexedDB 收藏记录（切服/回填顺带携带，上游不存密码的模型不采纳）。
- fixed 模式免密直进的唯一密码权威是网关服务端注入（`policy.serverPassword`），客户端不得把本地表单密码上送覆盖。
- 清除本地数据按 `webspeak:*` 前缀清扫而非枚举清单（新增 storage 键必须带此前缀）。
- 移动端页签切换依赖 ≤740 固定底部导航（.mobile-nav 的 display:grid+fixed 是覆盖顶层 display:none 的唯一规则，动它必须真机验证页签可达）。
- 收藏列表桌面=壳层最左列图标 rail（成员侧边栏左侧）、移动=壳层直属顶部 chips（voice-banners 之后的 .app-shell 子元素，channels/more 页签也常驻；≤740 workspace 为 flex 弹性高度，勿改回固定 calc）；列表只显示收藏——连接即收藏、取消收藏即从列表移除，无「最近」概念（2026-10-10 拍板废除，勿回退）；记住服务器密码常开（连接成功即写入收藏记录，无勾选框）。
- 模态框只经按钮/Esc 关闭、不响应 backdrop 点击。
- 多根子组件的元素不带父作用域属性，父 scoped 样式必须 :deep()（自持样式+Teleport 是更优解，ServerContextMenu 即范本）。
- 带 backdrop-filter/transform 的元素会成为 fixed 后代的包含块，fixed 浮层不得挂其子树内；Teleport 目标用 .web-client 根而非 body（皮肤选择器 .ws-skin-root [data-ws-part=…] 与 z 阶梯变量都挂在 .web-client 上）。
- 配置弹窗=全量配置面，两端必须一致（2026-10-13 拍板「PC 对齐移动端，不做删减」）：平台差异只允许用快捷面承载（音频坞悬停面板），禁止用 viewport 门控在弹窗里删项；新配置项两端同加。
- pointerdown 激活即卸载的浮层（下拉选项），必须吞掉手势尾随 click（一次性捕获守卫）——菜单卸载后合成 click 会落在新暴露的元素上（实案：更多面板切语言误触退出按钮断连）；danger 动作必须与浮层覆盖区空间隔离（更多面板分隔线）。
- 下拉浮层钳制必须四边含裁剪祖先（LanguageSwitcher placeDropdown 模式）：overflow-y 非 visible 时 overflow-x 计算值连带非 visible（CSS 规范）——只钳垂直会从水平方向溢出（实案：登录卡片）；视口钳制管不了 overflow 祖先，实施前先收集 overflow≠visible 的容器，边界取祖先∩视口最紧者。
- 工作区四栏布局（2026-10-13 拍板，报告 16）：≥981 走 `86/304/1fr/聊天列` 四栏，配色一律走 `--wsd-*` token 层——日间默认值在 00-tokens.css 基础层、夜间整块翻转挂 builtin.dark 属性选择器（皮肤选择器就是日/夜开关）；旧 `--ws-*`/`--surface-*` 并存服务未迁移区域，新代码勿混用两套。ChatPanel 按 ≥981 断点双实例渲染（桌面 shell 子元素/窄屏 workspace 原位）——移动端聊天视图的 CSS 依赖面板在 workspace 内的位置，勿把窄屏实例也搬去 shell；聊天折叠持久化键 `webspeak:chat-collapsed`。皮肤/语言切换器在暗色下保持亮面是 skin-pack 测试钉住的刻意设计。新布局规则集中在 `19-workspace-relayout.css` 单分片；跨组件选择器必须整链 `:deep()`（子组件内部元素不带父作用域属性）。

## 已评估否决项（勿重新立项）

- **重写 TeamSpeak SDK**：无必要，性能热点全在网关层；fork 源码 + 更新 vendor 为兜底方案。
- **接入阿里云 ESA 等 CDN**：语音走 WebRTC UDP 直连不经 CDN，对延迟与 3Mbps 出流量无益，仅在跨地域首屏慢或源站暴露需求时再议。
- **Opus DTX**：只省 <200ms 语间停顿的码率——更长的静默已被 pacer 停表覆盖，CPU 无收益，且 DTX/PLC 切换有噪声风险、FEC 覆盖在 DTX 期下降（2026-10-09 基准数据后拍板；重开条件见下）。
- **前端 shallowRef 目录状态**：阶段 1 delta 化已消灭全量替换触发源，剩余为事件级原位 patch，shallowRef 需手动 triggerRef 改写十余处 mutation 点，回归风险大于收益。
- **昵称冲突客户端自动重试**：TS 服务端自带重名改名/拒绝处理，客户端加后缀重试是画蛇添足（2026-10-10 拍板）。
- **管理端邀请功能**：fixed 模式下裸站点 URL 即可免密进入，无门禁语义的可撤销/过期链接是装饰品，实际价值仅频道深链——`?channel=` 参数已原生覆盖；且密码不下发浏览器才保得住撤销语义（2026-10-10 拍板删除，schema 12 已 DROP `managed_invites`）。若将来需要真正的访问控制，重开方向是「必须持邀请才能加入」的门禁模式，而非装饰性邀请链接。
- **自动「最近连接」列表**：2026-10-10 拍板废除——记住密码常开后，无凭据的自动记录只造成 rail 内点击行为不一致与列表噪声，勿以任何形式重新引入。
- **皮肤包上 CDN**：2026-10-11 拍板不做——包已瘦身至 1.45MB 且版本化 URL+immutable 让重试近零流量，家用上行 3-5 秒可下完；CDN 引入 CORS 配置与国内可用性问题，性价比不划算。若网关带宽仍成瓶颈，接入选点已明确：getBundledSkinPackageUrl 加 base 前缀 + 网关回落 + CDN 端 CORS，只覆盖内置皮肤、管理员上传皮肤留网关。
- **皮肤插件平台（上游 v2 layout/v3 open-skin/v4 wasm 插件）**：评估后不采纳——上游自述安全审查未完成、wskin 从纯 CSS 变可携带 wasm 违背 fork 初衷、2MB 二进制入库；KAAK 只吸收交互模式；其二轮评审否决项：KAAK 说话双环无限动画（耗电无 reduced-motion 豁免）、五段移动布局（牺牲专注性，收益由报告 12 P1「正在说话」聚合条以更小代价拿到）。

## 条件重开项及触发器

- 头像换新检测（cacheKey 失效）：成员换头像后旧图残留到网关重启/LRU 淘汰。URL 化后检测路径已明确且廉价——`fileTransferInitDownload` 一次命令往返返回 size/mtime，按 uid 比对元数据即可发现变化（重下→内容 hash 翻新→新 URL 增量推送，浏览器自动拉新）；等真实场景反馈再立项。
- 更强上行降噪模型（DeepFilterNet/DTLN 等，形态参考本机 tsweb/Newt-Desktop 的模型选择+强度记忆）：CPU 换音质，契合「最佳音质」优先级；当前 RNNoise 够用时不动。
- T10 Opus-over-WS：诊断 `voiceTransports.compatRatio` 持续 >5%。
- Opus DTX：实测 WebRTC 出向码率在语音活跃期逼近 3Mbps 上限时。
- worker_threads：100 会话上限内不需要——基准 100 会话×4 说话人编解码地板 ≈1.3 核。
- 前端 shallowRef：性能面板实测到渲染开销时。
- iOS 音频行为真机定级（volume/mute/输出路由，决定 P0 与否）。
- 入会前设备选择完整版（现仅对话框复用入口）。
- B-9 groupId 设备配对。
- AGC 移动端开关。
- 移动端代码整体删除：自研安卓端稳定上架后；此前只做引导页+逃生口，勿删移动端代码。

## 待拍板

- 上游式「复制服务器/频道链接」（?server=&channel=）是否补回（默认不做，做则放 more 面板守住 header 图标数）。
