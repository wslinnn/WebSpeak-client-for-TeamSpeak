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
- 皮肤开发遵循 `docs/SKIN_DEVELOPMENT.md` 与 `.agents/skills/webspeak-skin-development` 技能。

## 其他注意事项

- Node.js ≥ 22.5（CI 用 22.22.2）；后端 TypeScript strict + NodeNext + ES2022。
- Git 远端：`origin` = wslinnn 仓库（默认推送目标），`upstream` = EchoSixHIYA 上游仓库。
- SQLite schema 版本在 `src/persistence/database.ts`（当前 v11：v10 移除中继配置列，v11 将 `webrtc_enabled` 一次性置 1——WebRTC 是本 fork 的主语音路径，管理员事后关闭仍持久生效）；schema 迁移与结构性重构分开提交。
- 阶段 1 性能基线（改这些区域前先理解）：目录广播必须是 delta（`session-events.ts` 的 publishDelta），全量 `channelList` 只在连接/重连后发一次；头像按 uid 走 `memberAvatar` 消息 + `avatar-cache.ts` 共享 LRU（128 条），不在频道树/成员里内联；网关两个 Opus 编码器经 `createVoiceEncoder()` 钉参（24kbps + VOIP + FEC/期望丢包 10%）；WebRTC pacer 空闲 200ms 停表、入帧即恢复（禁止逐帧门控）。
- 阶段 2 安全基线（2026-10-09 落地）：首启无默认口令，`admin-service.ts` 生成一次性 setup token 只打印到日志，登录后强制改密；`WEBSPEAK_TRUST_PROXY=1` 声明反代（`server/client-ip.ts` 统一解析：转信头仅在此时采信，IPv4-mapped 归一化为 IPv4，IPv6 按 /64 聚合限流键）；安全响应头全局中间件（CSP `default-src 'self'`——`style-src 'unsafe-inline'` 是皮肤 `<style>` 注入与 Vue 样式绑定所需，勿"修复"；HSTS 仅 HTTPS 响应）；WS 控制消息令牌桶（`command-rate-limit.ts`，30 突发/20 每秒，限流回执 1 秒合并一条）；TS 服务器密码错误按目标计数退避（`server-password-guard.ts`，join 端点仅对用户自带密码的请求检查，invite/托管密码不受影响）；fixed 模式不向普通用户返回真实 target；转义收敛 `security/ts-escaping.ts`（含 \t\f\v）。
- 运维开关：`WEBSPEAK_LOG_LEVEL=debug` 恢复文件 debug 日志；`WEBSPEAK_SDK_DEBUG=1` 打开 SDK 协议日志（默认关，协议报文可能内嵌凭据）；`WEBSPEAK_TRUST_PROXY=1` 反代部署必设。
- 本仓库是上游的裁剪 fork：已删除加速中继、Android、DemoView、访客计数；不要从 upstream 合并会重新引入这些功能的改动。
- `data/`、`config.json`、`*.pem`/`*.key`、`.env*` 为本地私有内容，禁止入库。
- 需要真实 TeamSpeak 服务器或浏览器媒体设备的测试，须单独记录环境与结果；不得用 mock 编解码器冒充真实音频验证。
- 活跃改造计划见 `D:\develop\project\tsweb\reports\`（09/10 号报告头部有执行状态）。阶段 0/1/2/3 与 UI/UX 修复轮（10 号报告，2026-10-10 落地：皮肤切换/层级阶梯/成员交互/加入页/设备链/i18n 对齐/文档清扫，commit `919a22a…876d758`）已完成；**无剩余排期项**。条件重开项及触发器：T10 Opus-over-WS（诊断 `voiceTransports.compatRatio` 持续 >5%）、Opus DTX（实测 WebRTC 出向码率在语音活跃期逼近 3Mbps 上限时）、worker_threads（100 会话上限内不需要——基准 100 会话×4 说话人编解码地板 ≈1.3 核）、前端 shallowRef（性能面板实测到渲染开销时）、iOS 音频行为真机定级（volume/mute/输出路由，决定 P0 与否）、成员音量拖拽体系收敛（删 HTML5 DnD 统一 pointer，10 号报告 §4.3 方案 c）、入会前设备选择完整版（现仅对话框复用入口）、B-9 groupId 设备配对、AGC 移动端开关。
- 已评估否决项（勿重新立项）：重写 TeamSpeak SDK（无必要，性能热点全在网关层；fork 源码 + 更新 vendor 为兜底方案）；接入阿里云 ESA 等 CDN（语音走 WebRTC UDP 直连不经 CDN，对延迟与 3Mbps 出流量无益，仅在跨地域首屏慢或源站暴露需求时再议）；Opus DTX（只省 <200ms 语间停顿的码率——更长的静默已被 pacer 停表覆盖，CPU 无收益，且 DTX/PLC 切换有噪声风险、FEC 覆盖在 DTX 期下降，2026-10-09 基准数据后拍板）；前端 shallowRef 目录状态（阶段 1 delta 化已消灭全量替换触发源，剩余为事件级原位 patch，shallowRef 需手动 triggerRef 改写十余处 mutation 点，回归风险大于收益）；昵称冲突客户端自动重试（TS 服务端自带重名改名/拒绝处理，客户端加后缀重试是画蛇添足，2026-10-10 拍板）。
