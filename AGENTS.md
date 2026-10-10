# WebSpeak Client for TeamSpeak — 工作区指引

自托管 Node.js 网关，把浏览器用户接入 TeamSpeak 3/6；每个浏览器会话对应一个独立 TS 客户端。TeamSpeak 协议 SDK 以构建产物形式 vendored 在仓库内（`vendor/teamspeak-client/`）。

**定位与约束（做取舍时先读）**：这是上游的裁剪 fork，供自用；性能优先（延迟、通话质量、资源占用），**服务器上行仅 3Mbps** 是决定性约束——带宽相关的方案按 09 号报告 §1 的容量模型评估。已删除：加速中继、Android、DemoView、访客计数。09 号报告 §8 的保留项连带义务已在阶段 1 全部落地（2026-10-09）：头像出频道树 + 跨会话 LRU 缓存、目录广播 delta 化（快照仅连接/重连时全量一次）、B1 立体声伴奏解码、皮肤下载限流、屏幕共享名册去头像；T1–T9 性能项同批完成。

## 结构

- `src/` — 后端（Express + ws + TeamSpeak SDK + Opus + werift + SQLite）：`server/` 网关核心，`shared/` 前后端共享的线上协议类型与运行时校验，`admin/` `security/` `persistence/`
- `vendor/teamspeak-client/` — vendored 的 `@echosixhiya/teamspeak-client` 构建产物（MIT）；升级步骤见 `VENDOR.md`
- `web/` — Vue 3 + Vite 前端：`src/voice/` 音频链路、`views/` `composables/` `services/`、`i18n/` 五语言、`skins/`；前端依赖独立安装（`web/package-lock.json`）
- `docs/` — 多语言 README、皮肤开发指南；`scripts/` — 测试发现、Docker 健康检查

## 命令

环境准备（vendored SDK 无需构建；原生 Opus 需要预编译）：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm rebuild @discordjs/opus --foreground-scripts --no-audit --no-fund
npm --prefix web ci --no-audit --no-fund
```

- 全量验证（提交/合并前必须全绿）：`npm run verify` = ESLint + 单测 + 后端 `tsc` 构建 + `web:lint` + `web:build`（含 `vue-tsc --noEmit`）。
- 跑单个测试文件：`node --import tsx --test <路径>`；`npm test` 通过 `scripts/run-tests.mjs` 自动发现所有 `*.test.{ts,mjs}`，新增测试文件无需登记清单。
- 开发调试：`npm run dev`（后端，端口 3040）、`npm run web:dev`（前端 Vite）。

## 架构边界与不变量

- 线上协议类型放 `src/shared/`（含运行时解析器），前后端共用；改协议字段必须同步两端类型与测试。
- 网关默认端口 3040；仅当 `certs/cert.pem` + `certs/key.pem` 存在才启用 HTTPS；会话上限 100 定义在 `src/constants.ts`。
- 语音/会话/目录代码受 CLAUDE.md 中大量生命周期不变量约束（会话 generation、陈旧回调失效、资源释放顺序、所有权归属）——**改动前先读 CLAUDE.md 对应章节**，这是本仓库最易出错的部分。
- Vue 无头测试必须用 Vite 中间件模式并设 `hmr: false, ws: false`；只关 HMR 仍会占用默认 socket 端口，导致并行测试冲突。
- SQLite schema 版本在 `src/persistence/database.ts`；schema 迁移与结构性重构分开提交。
- 语音路径禁止逐帧持久日志；音频计数走内存诊断快照。

## 前端约定

- 五个语言包（i18n）必须实现同一组翻译键（当前五语 326 键完全对齐，de/ru/ja 无英文继承，新增键必须五语同加）；`t()` 的变量替换用双花括号 `{{name}}`，单括号不替换会原样输出；用户可见错误要按错误类型区分。
- 管理台 API 响应经 `admin-responses.ts` 校验器按声明字段投影（未声明的字段被静默丢弃），前端再把聚合响应扁平化进 `useAdminOperations.ts` 的 operations 状态——新增后端诊断/响应字段必须同步三处：校验器声明、扁平化投影、模板消费点；只改校验器会以扁平类型在 vue-tsc 报错，只改模板则拿到 undefined。
- 文档级页面样式必须由 `html[data-ws-route]` 门控（路由加载后 CSS 常驻）；保留 `data-ws-part` 皮肤钩子与既有 `:deep` 选择器的顺序和特异性；新增 `data-ws-part` 必须同步登记 docs/SKIN_DEVELOPMENT.md（skin-pack.test 会扫描）。
- 模板/CSS 格式化改动与行为改动分开；包裹 Vue 标签时保留内联空白文本节点。
- 浮层层级必须取 `--ws-z-*` 阶梯变量（web-client.css 顶部定义，admin.css 同值副本：raised 10 / header 100 / dropdown 200 / menu-mask 300 / menu 310 / modal-mask 400 / toast 500），禁止裸 z-index 数字——header 曾硬编码 z-index:40 压在弹窗遮罩上；`isolation: isolate` 容器内部的 1/2/3 局部小阶梯除外。
- 皮肤命名空间约束：`.ws-skin-root` 的 `data-ws-skin` 是自定义皮肤 CSS 的作用域锚点（内置皮肤样式按 `[data-ws-skin="builtin.*"]` 高特异性命中），皮肤激活后任何 `applyTheme/saveTheme` 都必须传 `preserveCustomSkins: true`，否则属性被刷回内置皮肤、自定义皮肤整体失效且刷新后才恢复——皮肤切换失效 bug 的根因；ILLUSIA/社区皮肤的 CSS 靠动态 `<style>` 注入次序压过基础样式，勿改动注入位置。
- 频道/成员等状态变更命令一律走应答式 `sendCommandAndWait` 并在失败时回滚本地乐观状态（错误对象携带 `code` 供分支处理）——`switchChannel` 曾因 fire-and-forget 导致界面漂移到未进入的频道且无任何提示。
- 皮肤开发遵循 `docs/SKIN_DEVELOPMENT.md` 与 `.agents/skills/webspeak-skin-development` 技能。

## 其他注意事项

- Node.js ≥ 22.5（CI 用 22.22.2）；后端 TypeScript strict + NodeNext + ES2022。
- Git 远端：`origin` = wslinnn 仓库（默认推送目标），`upstream` = EchoSixHIYA 上游仓库。
- 多个 commit 共享同一文件时的拆分手法：先备份各文件终态，逐 commit 剥离后置 hunks，每个中间态过类型检查与定向测试后再提交，全部完成后终态与备份逐字节比对——保证每个中间提交可构建、可 bisect。
- SQLite schema 版本在 `src/persistence/database.ts`（当前 v11：v10 移除中继配置列，v11 将 `webrtc_enabled` 一次性置 1——WebRTC 是本 fork 的主语音路径，管理员事后关闭仍持久生效）；schema 迁移与结构性重构分开提交。
- 阶段 1 性能基线（改这些区域前先理解）：目录广播必须是 delta（`session-events.ts` 的 publishDelta），全量 `channelList` 只在连接/重连后发一次；头像按 uid 走 `memberAvatar` 消息 + `avatar-cache.ts` 共享 LRU（128 条），不在频道树/成员里内联；网关两个 Opus 编码器经 `createVoiceEncoder()` 钉参（24kbps + VOIP + FEC/期望丢包 10%）；WebRTC pacer 空闲 200ms 停表、入帧即恢复（禁止逐帧门控）。
- 阶段 2 安全基线（2026-10-09 落地）：首启无默认口令，`admin-service.ts` 生成一次性 setup token 只打印到日志，登录后强制改密；`WEBSPEAK_TRUST_PROXY=1` 声明反代（`server/client-ip.ts` 统一解析：转信头仅在此时采信，IPv4-mapped 归一化为 IPv4，IPv6 按 /64 聚合限流键）；安全响应头全局中间件（CSP `default-src 'self'`——`style-src 'unsafe-inline'` 是皮肤 `<style>` 注入与 Vue 样式绑定所需，勿"修复"；`img-src`/`font-src`/`media-src` 的 `blob:` 分别是皮肤包资源、皮肤字体、麦克风试听回放的通道，`script-src 'wasm-unsafe-eval'` 是 RNNoise 降噪 WASM，均勿收紧（2026-10-10 曾因缺 `blob:` 拦死皮肤图片/试听回放）；`connect-src 'self'` 是有意的收窄——语音 WS 恒同源且浏览器地板（WebCodecs）已高于 Safari 15.4 的 'self'/ws 匹配修复，勿再放宽 `ws: wss:`，全部由 `security-headers.test.ts` 钉死；HSTS 仅 HTTPS 响应）；WS 控制消息令牌桶（`command-rate-limit.ts`，30 突发/20 每秒，限流回执 1 秒合并一条）；TS 服务器密码错误按目标计数退避（`server-password-guard.ts`，join 端点仅对用户自带密码的请求检查，invite/托管密码不受影响）；fixed 模式不向普通用户返回真实 target；转义收敛 `security/ts-escaping.ts`（含 \t\f\v）。
- 运维开关：`WEBSPEAK_LOG_LEVEL=debug` 恢复文件 debug 日志；`WEBSPEAK_SDK_DEBUG=1` 打开 SDK 协议日志（默认关，协议报文可能内嵌凭据）；`WEBSPEAK_TRUST_PROXY=1` 反代部署必设。
- 本仓库是上游的裁剪 fork：已删除加速中继、Android、DemoView、访客计数；不要从 upstream 合并会重新引入这些功能的改动。
- `data/`、`config.json`、`*.pem`/`*.key`、`.env*` 为本地私有内容，禁止入库。
- 需要真实 TeamSpeak 服务器或浏览器媒体设备的测试，须单独记录环境与结果；不得用 mock 编解码器冒充真实音频验证。
- 活跃改造计划见 `D:\develop\project\tsweb\reports\`（09 号为性能/安全四阶段；12 号二轮优化清单（批次 E/F/G）已全部落地（`c69fdf1…b969149` 共 23 笔，未推送，测试基线 544）：**批次 E = P0×4**（`c69fdf1` 切换失败态残留修复——提取 useVoiceServerSwitch 状态机统一接管 pending/failed/安全计时器，密码码由密码弹窗接管、取消即落失败；`afd6f8d` 断线/音频降级/麦错误/戳一戳四横幅提升到 .app-shell 直下 voice-banners 层，移动页签切换不再隐藏；`e60d6fe` 消息气泡 overflow-wrap:anywhere+pre-wrap；`452fcc1` chatMessages 500 条上限）。**批次 F = P1×11**（`4b5fbc6` 切换横幅带失败原因+表单无效快速失败；`86c8c1e`/`b04da53` 收藏对话框接 useDialogFocus 家规化+添加入口预填表单+收藏行长按编辑+密码保留/重复收藏提示；`52ce0c0` 皮肤加载失败恢复通知+select 先 apply 成功才持久化选择；`02c5dbd` 频道折叠（webspeak:channel-folds:<server> 按服务器记忆，搜索自动展开）；`e5f6a2d` ARIA 包（list/listitem/aria-current/tab/alert/昵称键盘可达）；`6719bb9` reduced-motion 一条全量规则+toast 语义分级；`ee2acfc` 移动聊天页「正在说话」聚合条；`636e848` 切换条芯片完整 label+手机头部恢复频道名；`81527d1` 横屏矮屏压缩断点）。**批次 G = P2×9**（`a934c58` 连续同人消息合并分组；`6439ee2` 成员行 v-memo 隔离说话态重渲染+入场动画去 blur 限首屏 8 行；`e744acf` composer 自动伸缩 textarea+Shift+Enter 换行；`1353bef` 音量滑条 step=5/触屏拇指/成员行 pan-y；`d5b61ce` 切换条芯片收藏角标星+收藏按钮带名 aria；`69e0c66` 弹窗 body 滚动锁（引用计数）；`79d65cf` 麦克风权限徽标（Permissions API，denied 带放行指引）；`e7160f2` more 面板去重分组；`b969149` 拖拽成员时树边缘自动滚动）。实施坑：**downloads.test.ts 的 TTL 缓存用例在满载 verify 下偶发超时抖动，单跑恒绿**；vue/valid-v-memo 规则只追踪一层 v-for，嵌套循环误报已在 eslint.config.js 按文件豁免）。**收藏列表重构与移动端导航恢复已完成（`36c82de…ca74f01` 5 笔，未推送）：`36c82de` 恢复移动端底部导航——eeb647f 换 z-index 令牌时误删 .mobile-nav 的 position:fixed/bottom/display:grid 整段声明，顶层 display:none 失去唯一覆盖，手机进房自 2026-10-09 起被钉死在默认 channels 页签（聊天/语音卡片/更多全部不可达，此前一轮的移动端改进用户实际看不到）；`91ca404` 皮肤失败通知与收藏对话框提升到模板根部——原在 join 页 v-if 分支内，语音房点「添加」要退出后才见弹窗；`b40f1e5` 桌面服务器列表左侧纵向栏（`a475ef8` 起移到壳层最左列、位于成员侧边栏左侧——workspace 内两列方案被取代；≤740 保留顶部 chips——用户拍板）；`ca74f01` 统一右键菜单 ServerContextMenu（切换/编辑/收藏切换/删除最近），rail 行与首页行共用、≤740 呈底部抽屉，removeRecentServer 导出+removeRecentServerEntry 只删最近不触碰收藏——用户拍板；`a475ef8` 收藏域修正——移除「记住服务器密码」单选框改为常开（连接成功即把密码写入收藏，含自动转正收藏；此前切服到无存密码收藏会把标志置 false 致后续密码不再被记住），rail 移到成员侧边栏左侧，ServerContextMenu 多根子组件样式需 :deep()（否则 scoped 选择器全部落空、只剩遮罩可见），六个模态框移除点空白关闭只留按钮/Esc。教训回流：CSS 属性段替换曾误删相邻声明（eeb647f），改样式后先看 diff 按属性数自检；皮肤部件审计只认静态 data-ws-part 字面量，动态 part 用 v-bind 对象表达且全部变体登记文档；全局弹窗/通知必须放模板根部（页面 v-if/v-else 分支之外），进房态与首页态都要可达**。已完成：性能/安全四阶段、UI/UX 修复轮（`ee12fa1…39ce6c5`）、批次一拖拽/戳一戳/自动重连（`483a3f4…a41d8fa`）、批次二标签收藏/下载页/移动引导页（`89f8aaa…4f06532`，已推送）、实测问题止血批次 A（`b909fdc…6f70b29`）、**方案二网关会话保活（`51e1641`）：WS 异常断开转入 detached 池保活 TeamSpeak 会话，宽限期（默认 30s，`10e71f3` 由 60s 收紧）内 resume 令牌经 attachSocket 原闭包重绑实现零 TS 重连，过期由心跳扫除释放**。**批次 C 可观测性已完成（`fca97fd` 回环+XFF 一次性代理告警、`a85e64c` 存储键命名空间守卫测试、`6dc7578` 五语言部署 FAQ——FAQ 不建议改动 TS 服务器侧反洪水阈值，部署者通常无该服务器管理权）**。**邀请功能删除与参数收紧已完成（`4ca47a4` 删管理端邀请功能——schema 12 已 DROP managed_invites，已发邀请链接升级后失效、改发站点地址或 ?channel= 深链；`5dd2366` 删房间内分享按钮；`10e71f3` 删自动恢复 15s 冷却——方案二后恢复零 TS 连接，节流失去保护对象；`088f448` 恢复宽限 60→30s——窗口只需覆盖重载耗时，尾巴只会延长幽灵成员占位）**。**上游 dev UI/UX 学习批次 D 已落地（`c71e97c` 快速连接统一视图 mergeQuickServers+行内星标、`74ce58c` FavoriteServerDialog 移动底部抽屉、`4a5852b` 语音内服务器切换条+保壳横幅、`5db5193` 移动微交互包、`9b2241f` docs；**未推送**；D5 频道树内联成员审计发现本 fork 已具备未做）**。**皮肤插件平台（上游 v2 layout/v3 open-skin/v4 wasm 插件）评估后不采纳**——上游自述安全审查未完成、wskin 从纯 CSS 变可携带 wasm 违背 fork 初衷、2MB 二进制入库；KAAK 只吸收交互模式；其二轮评审否决项：KAAK 说话双环无限动画（耗电无 reduced-motion 豁免）、五段移动布局（牺牲专注性，收益由报告 12 P1「正在说话」聚合条以更小代价拿到）。待用户拍板：上游式「复制服务器/频道链接」（?server=&channel=）是否补回（默认不做，做则放 more 面板守住 header 图标数）。条件重开项及触发器：T10 Opus-over-WS（诊断 `voiceTransports.compatRatio` 持续 >5%）、Opus DTX（实测 WebRTC 出向码率在语音活跃期逼近 3Mbps 上限时）、worker_threads（100 会话上限内不需要——基准 100 会话×4 说话人编解码地板 ≈1.3 核）、前端 shallowRef（性能面板实测到渲染开销时）、iOS 音频行为真机定级（volume/mute/输出路由，决定 P0 与否）、入会前设备选择完整版（现仅对话框复用入口）、B-9 groupId 设备配对、AGC 移动端开关、移动端代码整体删除（自研安卓端稳定上架后；此前只做引导页+逃生口，勿删移动端代码）。
- 会话回归不变量（勿回退）：自动恢复有终态拒绝（封禁/密码错/昵称占用/身份冲突）即清意图；显式加入导航（URL 带 server/tsHost/target 等）优先于自动恢复；语音内切换不同服务器=显式离开（内部断开 1000 → 网关 teardown，不进 detached 池），同目标换频道走 switchChannel；收藏密码只存在于 IndexedDB 收藏记录（切服/回填顺带携带，上游不存密码的模型不采纳）；fixed 模式免密直进的唯一密码权威是网关服务端注入（`policy.serverPassword`），客户端不得把本地表单密码上送覆盖；清除本地数据按 `webspeak:*` 前缀清扫而非枚举清单（新增 storage 键必须带此前缀）；移动端页签切换依赖 ≤740 固定底部导航（.mobile-nav 的 display:grid+fixed 是覆盖顶层 display:none 的唯一规则，动它必须真机验证页签可达）；收藏列表桌面=壳层最左列 rail（成员侧边栏左侧）、移动=顶部 chips，右键菜单与删除最近记录只删最近、绝不触碰收藏；记住服务器密码常开（连接成功即写入收藏记录，无勾选框）；模态框只经按钮/Esc 关闭、不响应 backdrop 点击；多根子组件的元素不带父作用域属性，父 scoped 样式必须 :deep()。
- 已评估否决项（勿重新立项）：重写 TeamSpeak SDK（无必要，性能热点全在网关层；fork 源码 + 更新 vendor 为兜底方案）；接入阿里云 ESA 等 CDN（语音走 WebRTC UDP 直连不经 CDN，对延迟与 3Mbps 出流量无益，仅在跨地域首屏慢或源站暴露需求时再议）；Opus DTX（只省 <200ms 语间停顿的码率——更长的静默已被 pacer 停表覆盖，CPU 无收益，且 DTX/PLC 切换有噪声风险、FEC 覆盖在 DTX 期下降，2026-10-09 基准数据后拍板）；前端 shallowRef 目录状态（阶段 1 delta 化已消灭全量替换触发源，剩余为事件级原位 patch，shallowRef 需手动 triggerRef 改写十余处 mutation 点，回归风险大于收益）；昵称冲突客户端自动重试（TS 服务端自带重名改名/拒绝处理，客户端加后缀重试是画蛇添足，2026-10-10 拍板）；管理端邀请功能（fixed 模式下裸站点 URL 即可免密进入，无门禁语义的可撤销/过期链接是装饰品，实际价值仅频道深链——`?channel=` 参数已原生覆盖；且密码不下发浏览器才保得住撤销语义，2026-10-10 拍板删除，schema 12 已 DROP `managed_invites`。若将来需要真正的访问控制，重开方向是「必须持邀请才能加入」的门禁模式，而非装饰性邀请链接）。
