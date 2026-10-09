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

- 五个语言包（i18n）必须实现同一组翻译键；用户可见错误要按错误类型区分。
- 文档级页面样式必须由 `html[data-ws-route]` 门控（路由加载后 CSS 常驻）；保留 `data-ws-part` 皮肤钩子与既有 `:deep` 选择器的顺序和特异性。
- 模板/CSS 格式化改动与行为改动分开；包裹 Vue 标签时保留内联空白文本节点。
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
- 已评估否决项（勿重新立项）：重写 TeamSpeak SDK（无必要，性能热点全在网关层；fork 源码 + 更新 vendor 为兜底方案）；接入阿里云 ESA 等 CDN（语音走 WebRTC UDP 直连不经 CDN，对延迟与 3Mbps 出流量无益，仅在跨地域首屏慢或源站暴露需求时再议）。
- 活跃改造计划见 `D:\develop\project\tsweb\reports\`（09 号报告头部有执行状态）。阶段 0/1/2 已完成；**剩余 = 阶段 3 条件触发项**：T10 Opus-over-WS（PCM 回退会话占比 >5% 时）、前端 shallowRef、Opus DTX 深调、基准脚本（04 §8 基线表）。
