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
- 工作区四栏布局（2026-10-13 拍板，报告 16）：≥981 走 `86/304/1fr/聊天列` 四栏，配色一律走 `--wsd-*` token 层——日间默认值在 00-tokens.css 基础层、夜间整块翻转挂 builtin.dark 属性选择器（皮肤选择器就是日/夜开关）；旧 `--ws-*`/`--surface-*` 并存服务未迁移区域，新代码勿混用两套。ChatPanel 按 ≥981 断点双实例渲染（桌面 shell 子元素/窄屏 workspace 原位）——移动端聊天视图的 CSS 依赖面板在 workspace 内的位置，勿把窄屏实例也搬去 shell；聊天折叠持久化键 `webspeak:chat-collapsed`。皮肤/语言切换器在暗色下保持亮面是 skin-pack 测试钉住的刻意设计（2026-10-14 已推翻，见「rail 动作位」条：现走 token 随主题）。新布局规则集中在 `19-workspace-relayout.css` 单分片；跨组件选择器必须整链 `:deep()`（子组件内部元素不带父作用域属性）。

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

- 屏幕共享信令内容校验（报告 21 S4，2026-10-17 评估后暂不实施）：授权与对端定向已有，剩余暴露是「授权发布者让观看端浏览器向其发布者指定地址发 STUN」——观看端本就与发布者做 ICE 连通性检查（P2P 语义），浏览器侧无放大风险；网关侧 SDP candidate 改写成本中等且有破坏 ICE 语义之险。触发器：屏共需要支持跨信任域观看（如公开直播形态）时重评。
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

## 工作区 KAAK 对齐二轮不变量（2026-10-13 拍板并实施，`b5d403a…064ffc8`，跳过项补批 `7885065…62cd062`；细节见 history.md / 报告 17）

- **颜色权威**：四栏工作区（≥981）一律 `--wsd-*`。内置皮肤（`skins/builtin/*/skin.css`）**不得再高特异性改写已迁移选择器**（app-shell/工作区/频道面板/聊天/右键菜单/滚动条等）——皮肤样式运行时后置注入，同属性必压过 scoped 分片（`:where()` 降特异性无效：打平后仍按注入序由皮肤胜出）。迁移新元素 = 双皮肤删规则 + `20-night-surfaces.css` 补**全宽度**夜间组（皮肤规则同时服务 <981 布局，夜间组必须全宽度、勿并入 19）；滚动条颜色/宽度在 00-tokens.css 收敛。
- **聊天=降噪流**：无气泡、自己消息左对齐（不右反转）、作者 11px/600 muted、时间 10px、正文 13px/1.55——改回气泡/右对齐属回归。
- **频道树**：单击选中（hover 面）+ 双击/回车加入（选中行尾 10px 绿色 hint，i18n 键 `doubleClickToJoin`）；单击不再直接切频道。
- **rail 动作位**：退出断电钮在语音坞头部（25px 红圆钮、`channelName` prop）；皮肤/语言切换器是 rail 58×58 瓦片（组件 `tile` 变体；下拉 fixed 定位贴瓦片右侧——rail 是 overflow 裁剪容器，绝对定位会被裁）。~~下拉面板亮面是 skin-pack 测试钉住的刻意设计，勿改暗~~（**2026-10-14 推翻**：用户报夜间下拉配色问题，两组件已全量 `--wsd-*` token 化——日间 fallback 值保 admin 环境观感、其 `[data-theme]` 前缀块继续管 admin 暗态；客户端夜间随页面暗色，skin-pack 测试断言改为钉 token 引用）。
- **room bar**：≥981 顶栏左段=频道 glyph+频道名+在线数（46px 高）；breadcrumbs 与「语音动态」heading 走 `v-if="!chatColumnActive"`（窄屏/旧布局保留，`voice.activity-heading` 部件仍在模板内，勿删文档登记）。性能触发器 32px 圆形钮，传输状态在 title。
- **部件形态**：服务器瓦片 58px/2px 透明描边，active=2px 绿描边+左缘 4×34 标，悬停只变表面色；舞台磁贴 1.82:1 宽卡平贴舞台色、头像 104px、说话态半透明绿环+116px 脉冲环（1.08s）。**全局 `prefers-reduced-motion { animation:none !important }`（04-room.css）是当初否决 KAAK 双环无限动画的豁免前提，勿删**。
- **音频设置**：只对齐排印与容器（32px 标题/14px 标签/660px 内层卡/40px radius 12 select/加深遮罩），两端配置项与自由流布局不动。
- TS host banner 图暂不做（CSP img-src 仅 self/blob，外链需网关代理，价值低；重开则走网关代理）。
- **跳过项结局**（2026-10-13 重评估并落地，`7885065…62cd062`，细节见 history.md）：舞台列恢复 `minmax(280px,1fr)`（含折叠态），981-1009px 带内聊天列下限降到 280（参考实现 961-1200 档同值）以免四条轨道最小宽超视口；频道折叠改常驻 branch + `grid-template-rows` 1fr↔0fr 过渡；磁贴进出场走 `voice-member` TransitionGroup；拖拽落点改行级 outline 绿环 + 无状态底色行 16% 绿底。骨架 `min-height:560px` **不复刻**：KAAK 自身以 `@media (max-height:620px)` 把它归零（skin.css:552 vs 2209），矮窗必然命中降级、规则恒不生效——照抄只增死规则、去掉降级则矮窗裁底；其 ≤620 压缩档其余项（rail 内边距/身份牌小名/下拉 bottom 定位）对应元素我方无此形态。**保留现状（重评估后不动）**：空态（voice-empty/chat-empty 是我方横排图标+标题信息条，报告自注「可保留我方居中」）、消息组间距（1-4px 级差异）、`@media(hover:none)` 磁贴动作钮（该钮 ≥981 本就不渲染，纯 CSS 补不了；触屏场景走长按右键菜单）、频道折叠钮行尾 24×24 形态（单击选中/双击加入手势下的既定布局）。
- **动效归属**（2026-10-13）：频道折叠过渡依赖 `.member-channel-branch` 常驻挂载（改回 v-if 即失去过渡；折叠态靠 `visibility:hidden` 屏蔽交互与无障碍树）；磁贴过渡类（`voice-member-*`）在 04-room 与 19 各一份——19 那份用于压过该断点磁贴卡自有的属性过渡，勿只留一份；拖拽落点环用 `outline`（current/selected 规则带 `box-shadow:none`，inset 环会被吃掉）。

## 工作区 KAAK 对齐三轮不变量（2026-10-13 实测差距批次，`4104772…5c37189`；定位证据见报告 18）

- **磁贴**：`aspect-ratio: 1.82` 必须与 19 的注释并存（二轮曾丢失规则只留注释——改磁贴几何先查这条）；卡上说话波形标（`::after` 四根 accent 条，speaking 时 .72s 伸缩）与 mic 状态角标（`voice.member.mic-status`，25×25 透明底右上）勿删。名字保持常驻，chip 形态与 hover 隐藏已评估不做。
- **坞头部四列 grid**（点/频道名/语音状态 28px/断电 28px）：语音状态触发器经 AudioDock `status` 插槽从顶栏移入（顶栏实例 ≥741 隐藏、≤740 移动端保留原样）；坞内形态=透明圆钮 + `::before` 波形条，面板向上弹出（min(360px, 100vw-108px)）；断电钮 power 字形，hover #ff8498/#3a292b。
- **坞动作区**：行 1 = 共享绿条（右端内嵌共享设置齿轮）+ 伴奏钮；行 2 = 语音设置标签 + 静噪快开 + mic + 输出（28×23 透明小钮，静音/关=红字+斜杠线）。**共享入口唯一化**：发起/停止/设置都在坞内绿条，自己磁贴无共享动作（`voice.member.stop-share` 部件已退役）、他人卡保留观看钮。
- **服务器头部两行制**：名称行（名称 + ≡ 切换下拉）+ meta 行（类型 tag「TeamSpeak」+ 在线/离开 + 搜索折叠钮 27px）；「已连接」胶囊与 serverConnected 键已删。搜索框 ≥981 折叠（输入中保持展开）、<981 常驻；≡ 下拉 Teleport 到应用根——频道面板 overflow hidden 会裁剪 fixed 后代，勿改回面板内绝对定位。
- **聊天列结构**：外层 50px 标题行（页签名 + 折叠钮，`voice.chat.title-row`，≥981 专属、窄屏隐藏）→ tabs（底边框）→ heading（kicker 隐藏、h2 14px、counter 10px、图标 accent）→ 消息流（行无宽度上限、meta 间距 2px、gap 17）→ composer 常规流（margin-top 8px）。空态无图标块、左上 11px（28px 上边距；四轮从居中改定，KAAK 即左上）。
- **频道面板滚动结构（≥981）**：面板 flex 列 + overflow hidden，**滚动收敛到频道树**——面板级弹出层（语音状态面板、悬停音量面板）因此能越过面板绘制在舞台上（KAAK 同构）；勿改回面板整体滚动（会重新裁剪弹出层；拖拽自动滚动也依赖树自身滚动）。
- 成员行自我标识 = 昵称 + 绿「你」标；欢迎卡 = 图标式（无左条）。分组头折叠、磁贴名字 chip 化：已评估不做（2026-10-13）。

## 2026-10-14 拍板（下架 / 移动首页 / 文案口径 / 审计批次）

- **ILLUSIA 皮肤整体下架勿复活**（`17bf4bb`）：前端目录条目、内置包地址、静态资源、docs/examples、十个语言包键全删；后端 `BUILTIN_SKIN_IDS` 保留该 ID 作冻结保护（防上传/删除复活），前端 `RETIRED_BUNDLED_SKIN_IDS` 继续拒绝目录项与启用判断。旧访客本地已装副本按普通社区皮肤自然保留，未装则回退日/夜间；皮肤开发文档示例改中性 community.my-art。
- **移动首页（≤740）入口层级**（`1eaabb4`）：语言/皮肤切换器**常驻 header 行**（高频优先，用户中途纠偏）；网关徽标与品牌副标题隐藏；下载/管理收进「更多」面板——`header-links` 单份 DOM 桌面内联、移动端 `.open` 时定位为面板（--ws-z-menu/menu-mask 阶梯），新部件 `home.header-more` 已登记皮肤文档。
- **文案口径（`a759b12`）**：自述一律加「第三方/非官方」限定，**不用「社区」二字**；「官方」仅允许指代 TeamSpeak 官方客户端/官网（正当指代）；官方桌面客户端与第三方安卓客户端的描述必须写**「直连 TeamSpeak 服务器」**，不得写「接入本站」（事实错误：它们不经本站）。
- **报告 19 落档** `reports/19-前端视觉对齐全面审查与拍板.md`：三区并行审计 30 余条发现 + 四项拍板（首页整面迁绿、管理台统一绿、mint 族并入 --wsd-accent、≤740 移动首页入口）。批次①根令牌换绿+分档收尾 ②浮层 token 化+夜间接管 ③工作区打磨 ④首页/管理台迁绿 **用户已预告 compact 后放行实施**——按 ①→④ 顺序推进，每步测试后一个 commit；动手前先读报告 19 全文（含 P1-P3 明细与 KAAK 行号参照），勿重报否决项。
- 首页「设备设置」按钮压到 36px 紧凑高度（`348d118`，`c8d5faa` 修复生效性），勿回 42px 字段几何。
- **fixed 模式安全审查结论（2026-10-14，勿重复立项）**：fixed 模式已是「后端权威」形态，无需修改——①public-config 对 fixed 恒返回空 target（getPublicConfig 注释即此设计）；②join-ticket 端点目标恒取 policy.defaultTarget，fixed 分支只读 body.serverPassword、body.target 被完全无视（伪造请求也无法让网关连别的服务器）；③前端帧里的 target 字段是空占位（前端拿不到真实地址），非泄漏；④密码重试有按目标退避（serverPasswordGuard）。协议里空 target 字段属卫生级瑕疵，清 it 需动两端+校验+测试、零安全收益，留待协议版本变更时顺手处理。
- **直播中胶囊 = 红底白字开关**（`364c03e`，局部推翻六轮「透明底」与三轮「他人卡保留观看钮」）：他人卡胶囊即观看 toggle（点击观看/观看中再点停，viewing 态调灰），自卡纯状态不可点（停止共享仍唯一在坞内绿条）；底色 `--wsd-danger` 主题红+白字白呼吸点，min-height 26px/字号 11px，位置卡内顶部居中；卡底观看钮与 card-actions/card-button/start-actions 样式已退役，`voice.member.share-actions` 部件注销，`voice.member.live-indicator` 移出皮肤可选淡出清单（交互控件不可被皮肤淡出）。勿给胶囊换绿（绿色语义已被在线/说话占用）。
- **频道树滚动容器底部留白**（`9930664`）：`.member-tree` padding-bottom 10px 是末行贴边裁切的修复，勿删；再遇「末行被裁」类问题先查滚动容器呼吸空间，不起 margin 假设。
- **移动首页 header 单行模型**（`2042eb4`+`b054b6b`+`c8d5faa`，真浏览器实测后确立）：≤740 行序=品牌（flex 0 1 auto 可收缩）→ 皮肤/语言（margin-left:auto 贴右）→ 更多钮，`flex-wrap: nowrap`——18-artwork「品牌/工具行各占一行」的旧承诺已废弃勿恢复；皮肤/语言下拉位置由 `services/dropdown-place.ts` 统一钳制（tile=固定贴瓦片、inline=视口+裁剪祖先钳制），勿在组件里重写定位。**特异性教训**：07 号分片的部件钩子规则（0,2,0）会被 09/18 号同特异性后导入规则压掉（设备设置 36px 曾整条失效、被 ≤420 flex-basis 120px 在列向容器里变成 120px 高）——跨分片覆写要么升直接子级选择器（0,3,0），要么落 web-client-mobile.css（最后导入）。

## 工作区 KAAK 对齐四轮不变量（2026-10-13 真机截图实测修正拍板，`4fbf123…012e15b`；取证与细节见 history.md）

- **绿双色分档**：填充类控件（共享绿条/伴奏钮/静噪快开/发送钮/chat-reopen/滑杆拇指与轨道）一律 `--wsd-accent-fill(-hover)`（日间 #69c000/#7ad50a = KAAK 亮绿，夜间与 accent 同值）；小号文字/图标/指示点保持 `--wsd-accent`（日间 #4f9e0c 深绿保白底可读）——勿把文字类消费点迁到 fill，也勿把填充类改回 accent。
- **磁贴状态图标一律透明底**（2026-10-13 六轮拍板，**推翻四轮 chip 片方案**）：mic 角标、说话波形标、直播中胶囊都不带背景/边框/投影——底片在任何主题下都是一处需配色协调的补丁，透明+主题化前景色（角标=text-muted、律动/胶囊=accent、胶囊呼吸点=currentColor）天然适配任意皮肤；KAAK 的深底片（#111216d9）不复刻，`--wsd-chip-*` 令牌已删勿复用。磁贴上的**操作钮**（观看/停止共享/移动端更多）保留表面底色——交互件需要可供性，不在此列。**角标选择器必须是 `.voice-card > .voice-mic-status`（直接子级前缀）**：04 号的状态行通用规则 `.voice-card > span`（0,2,1）会压过裸类规则（0,2,0），五轮破案教训。
- **聊天列=舞台色**：≥981 聊天列背景 `--wsd-bg`（KAAK 明度关系：聊天与舞台同色、成员面板独立一档、rail 最深）；与舞台间 1px 分隔线保留。
- **成员行右列叠放**：≥981 行为 grid 三列（22px / minmax(0,1fr) / auto），状态旗标与音量滑杆同格叠放——默认旗标、hover/focus-within 交叉淡入滑杆；触屏（hover:none）滑杆常驻旗标让位。行 min-height 29px、头像缩进与频道名对齐（padding-left 20px）勿动。
- **头部两行制分隔线在 meta 行下**（KAAK divider 位于名称行+meta 行整体之后），勿移回名称行下。

## 2026-10-17 拍板（样式统一节奏 / 浮层 token 口径 / 远端候选策略 / 重连限流语义）

- **浮层 token 口径 = 皮肤可染面**：同类浮层（switcher 下拉/右键菜单/dock 悬浮卡/性能面板）未来统一为 `.ws-popup` 配方时，底/边挂 `--surface-*`+`--skin-border`（自定义皮肤可染），不挂固定的 `--wsd-*`——与 16/15 号分片的 dock/性能面板现状一致。**组件样式迁移（报告 22 §2.2 批 1-3）整体暂缓未开工**，批次表与红线仍然有效，开工时按此口径执行。
- **WebRTC 远端候选地址策略（S1 落地，勿"收紧"）**：`webrtc-config.ts isAcceptableRemoteIceCandidate` 只拒环回/本网 0/链路本地（含云 metadata 169.254.169.254）/组播/保留段/非 IP 主机名（mDNS）/IPv4-mapped 与 ::dotted 变体；**RFC1918/CGNAT/公网单播/ULA 有意保留**——自托管 LAN 部署里合法浏览器的 host 候选就是私网地址，一并拒绝会让整条 WebRTC 路径静默退化到 WS 兼容传输。拦在 werift `iceFilterCandidatePair`（建对即拒、零出站包），rtp-lab 同钩子；`webrtc-config.test` 钉住全表。入站 STUN 反射已随 `iceFilterStunResponse` 关闭（清账批，只对带 MESSAGE-INTEGRITY 的请求回签名响应）。
- **批次 4 语义口径（2026-10-17 落地，勿无意回改）**：S2——请求派生的 WebRTC 公共 host 只在 `trustProxy` 时采信转发头、且永不为它做 DNS 解析（管理员 publicHost 例外）；S3——单对端（IPv6 聚 /64）并发会话上限 10，超限关闭码 **4006 PEER_SESSION_LIMIT**，前端按终态处理（不烧重连预算）；S5——皮肤包/预览按字节令牌桶（满桶首下载恒放行是合法首次下载的保障，304 零计费），参数 24MiB/4MiB 桶 + 8MiB/分回填；F8——播放侧说话指示轮询 350ms 是边沿延迟与 getStats 频率的既定折中；F9——语言包按语言各自成 chunk，切换语言时保留旧包渲染到新包就绪（不闪键名）；L5——resume 票 attach 失败回落同连接重建而非 4001；S4 屏共信令内容校验评估后列条件重开（见下）。
- **重连限流语义（F5 落地）**：429 不消耗 1/2/4 秒重连预算（独立上限 3 次，超限回落普通预算防无限重试），延迟取网关 `Retry-After`（加入票 429 现已带该头与 `retryAfterMs`）；浏览器侧重连延迟加 ±20% 抖动——群体重连共享限流键（同 NAT、反代漏设 TRUST_PROXY）不再同拍互踩。
