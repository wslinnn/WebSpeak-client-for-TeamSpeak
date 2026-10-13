# WebSpeak Client for TeamSpeak — 工作区指引

自托管 Node.js 网关，把浏览器用户接入 TeamSpeak 3/6；每个浏览器会话对应一个独立 TS 客户端。TeamSpeak 协议 SDK 以构建产物形式 vendored 在仓库内（`vendor/teamspeak-client/`）。

**定位与约束（做取舍时先读）**：这是上游的裁剪 fork，供自用；性能优先（延迟、通话质量、资源占用），**服务器上行仅 3Mbps** 是决定性约束——带宽相关的方案按 09 号报告 §1 的容量模型评估。已删除：加速中继、Android、DemoView、访客计数——不要从 upstream 合并会重新引入这些功能的改动。

## 主题文档（动手前按主题先读）

改造报告原文在 `D:\develop\project\tsweb\reports\`（09 性能/安全四阶段、12 二轮优化、13 体检、14 拆分）。

- **`.agents/notes/voice.md`** — 语音链路专册：多轨 RTP 透传架构、werift 关键机制、播放链路三层坑、诊断基建（/_rtp-lab、playback-debug、RTP_DEBUG）、TS 语音字节形态、语音复测清单。**改 `src/server/` 语音相关（voice-bridge / webrtc-audio / rtp-lab / opus-*）或 `web/src/voice/` 前必读。**
- **`.agents/notes/history.md`** — 改造批次史与 commit 索引、实施坑细节、遗留疑难、全部待复测清单。考古「为什么是现在这样」、核对复测状态、新里程碑落地后更新。
- **`.agents/notes/decisions.md`** — 会话回归不变量（会话恢复/收藏/切服/移动端布局/浮层/存储键/工作区动效的硬规则）、已评估否决项（勿重新立项）、条件重开项触发器、待拍板项。**改上述区域或立项评估前必读。**

新踩的坑：一句话红线补进下方「踩坑红线」，细节与复盘记入对应主题文档。

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
- 语音/会话/目录代码受 CLAUDE.md 中大量生命周期不变量约束（会话 generation、陈旧回调失效、资源释放顺序、所有权归属）——**改动前先读 CLAUDE.md 对应章节**，这是本仓库最易出错的部分；语音链路另读 `.agents/notes/voice.md`。
- Vue 无头测试必须用 Vite 中间件模式并设 `hmr: false, ws: false`；只关 HMR 仍会占用默认 socket 端口，导致并行测试冲突。
- SQLite schema 版本在 `src/persistence/database.ts`（当前 v11：v10 移除中继配置列，v11 将 `webrtc_enabled` 一次性置 1——WebRTC 是本 fork 的主语音路径，管理员事后关闭仍持久生效）；schema 迁移与结构性重构分开提交。
- 语音路径禁止逐帧持久日志；音频计数走内存诊断快照。

## 前端约定

- 五个语言包（i18n）必须覆盖中文基准键集（当前中文 366 键；en 独立实现、de/ru/ja 以 `...en` 展开再覆盖，对齐测试只做包含校验=zh 键必须在每一语出现，新增键仍须五语同加）；`t()` 的变量替换用双花括号 `{{name}}`，单括号不替换会原样输出；用户可见错误要按错误类型区分。
- 管理台 API 响应经 `admin-responses.ts` 校验器按声明字段投影（未声明的字段被静默丢弃），前端再把聚合响应扁平化进 `useAdminOperations.ts` 的 operations 状态——新增后端诊断/响应字段必须同步三处：校验器声明、扁平化投影、模板消费点；只改校验器会以扁平类型在 vue-tsc 报错，只改模板则拿到 undefined。
- 文档级页面样式必须由 `html[data-ws-route]` 门控（路由加载后 CSS 常驻）；保留 `data-ws-part` 皮肤钩子与既有 `:deep` 选择器的顺序和特异性；新增 `data-ws-part` 必须同步登记 docs/SKIN_DEVELOPMENT.md（skin-pack.test 会扫描）；部件审计只认静态 data-ws-part 字面量，动态 part 用 v-bind 表达且全部变体登记。
- 模板/CSS 格式化改动与行为改动分开；包裹 Vue 标签时保留内联空白文本节点。
- 浮层层级必须取 `--ws-z-*` 阶梯变量（web-client.css 顶部定义，admin.css 同值副本：raised 10 / header 100 / dropdown 200 / menu-mask 300 / menu 310 / modal-mask 400 / toast 500），禁止裸 z-index 数字——header 曾硬编码 z-index:40 压在弹窗遮罩上；`isolation: isolate` 容器内部的 1/2/3 局部小阶梯除外。
- 皮肤命名空间约束：`.ws-skin-root` 的 `data-ws-skin` 是自定义皮肤 CSS 的作用域锚点（内置皮肤样式按 `[data-ws-skin="builtin.*"]` 高特异性命中），皮肤激活后任何 `applyTheme/saveTheme` 都必须传 `preserveCustomSkins: true`，否则属性被刷回内置皮肤、自定义皮肤整体失效且刷新后才恢复——皮肤切换失效 bug 的根因；ILLUSIA/社区皮肤的 CSS 靠动态 `<style>` 注入次序压过基础样式，勿改动注入位置。
- 频道/成员等状态变更命令一律走应答式 `sendCommandAndWait` 并在失败时回滚本地乐观状态（错误对象携带 `code` 供分支处理）——`switchChannel` 曾因 fire-and-forget 导致界面漂移到未进入的频道且无任何提示。
- 皮肤开发遵循 `docs/SKIN_DEVELOPMENT.md` 与 `.agents/skills/webspeak-skin-development` 技能。

## 其他注意事项

- Node.js ≥ 22.5（CI 用 22.22.2）；后端 TypeScript strict + NodeNext + ES2022。
- Git 远端：`origin` = wslinnn 仓库（默认推送目标），`upstream` = EchoSixHIYA 上游仓库。
- 多个 commit 共享同一文件时的拆分手法：先备份各文件终态，逐 commit 剥离后置 hunks，每个中间态过类型检查与定向测试后再提交，全部完成后终态与备份逐字节比对——保证每个中间提交可构建、可 bisect。
- 阶段 1 性能基线（改这些区域前先理解）：目录广播必须是 delta（`session-events.ts` 的 publishDelta），全量 `channelList` 只在连接/重连后发一次；头像走 capability URL（`avatar-service.ts` 的 HMAC aid + 内容 hash 版本化，WS 只推 `avatarSnapshot`/`avatarUpdate` 小消息，字节经 `GET /avatars/:aid` 由浏览器 HTTP 缓存吸收——URL 稳定性是缓存命中的前提，勿加时效签名；缓存只存正项、`avatar-cache.ts` 共享 LRU 128 条），不在频道树/成员里内联；网关两个 Opus 编码器经 `createVoiceEncoder()` 钉参（24kbps + VOIP + FEC/期望丢包 10%）；WebRTC pacer 空闲 200ms 停表、入帧即恢复（禁止逐帧门控）。
- 阶段 2 安全基线（2026-10-09 落地）：首启无默认口令，`admin-service.ts` 生成一次性 setup token 只打印到日志，登录后强制改密；`WEBSPEAK_TRUST_PROXY=1` 声明反代（`server/client-ip.ts` 统一解析：转信头仅在此时采信，IPv4-mapped 归一化为 IPv4，IPv6 按 /64 聚合限流键）；安全响应头全局中间件（CSP `default-src 'self'`——`style-src 'unsafe-inline'` 是皮肤 `<style>` 注入与 Vue 样式绑定所需，勿"修复"；`img-src`/`font-src`/`media-src` 的 `blob:` 分别是皮肤包资源、皮肤字体、麦克风试听回放的通道，`script-src 'wasm-unsafe-eval'` 是 RNNoise 降噪 WASM，均勿收紧（2026-10-10 曾因缺 `blob:` 拦死皮肤图片/试听回放）；`connect-src 'self'` 是有意的收窄——语音 WS 恒同源且浏览器地板（WebCodecs）已高于 Safari 15.4 的 'self'/ws 匹配修复，勿再放宽 `ws: wss:`，全部由 `security-headers.test.ts` 钉死；HSTS 仅 HTTPS 响应）；WS 控制消息令牌桶（`command-rate-limit.ts`，30 突发/20 每秒，限流回执 1 秒合并一条）；TS 服务器密码错误按目标计数退避（`server-password-guard.ts`，join 端点仅对用户自带密码的请求检查，invite/托管密码不受影响）；fixed 模式不向普通用户返回真实 target；转义收敛 `security/ts-escaping.ts`（含 \t\f\v）。
- 运维开关：`WEBSPEAK_LOG_LEVEL=debug` 恢复文件 debug 日志；`WEBSPEAK_SDK_DEBUG=1` 打开 SDK 协议日志（默认关，协议报文可能内嵌凭据）；`WEBSPEAK_TRUST_PROXY=1` 反代部署必设。
- `data/`、`config.json`、`*.pem`/`*.key`、`.env*` 为本地私有内容，禁止入库。
- 需要真实 TeamSpeak 服务器或浏览器媒体设备的测试，须单独记录环境与结果；不得用 mock 编解码器冒充真实音频验证。

## 踩坑红线（一句话版；细节与出处在主题文档）

- 管道尾接 grep/tail 会吃 `npm run verify` 的退出码——判定一律 `> log 2>&1; st=$?` 显式判 st（曾两次带病提交）。
- web-client.css 与 i18n/web-client.ts 是混合行尾（部分 CRLF）：脚本化字符串替换必须按实际行尾匹配；批量 CSS 手术用字符级扫描器、按选择器组整组判断（行级脚本会把 `.a,⏎.b {` 组删成孤儿残片炸 postcss）。
- Git Bash 里 `node -e` 内联脚本带正则转义/中文会碎——批量文本手术一律 Write 临时 .mjs 文件执行，用完删除。
- 凡验证 TTL/超时的测试一律 mock 时钟（t.mock.timers 钉死 Date.now）；测试替身与被测预算共享时钟时，替身改记录、不推进时钟。
- CSS 死类清理对动态类前缀（`mobile-view-` / `language-` / `skin-preview--` / `permission-` 等）豁免；名单随新增动态类维护。
- i18n 键校验勿依赖缩进（en 块尾部空格曾伪报缺键）。
- 改样式后先看 diff、按属性数自检（曾整段误删相邻属性声明）。
- 全局弹窗/通知必须放模板根部（页面 v-if/v-else 分支之外），进房态与首页态都要可达。
