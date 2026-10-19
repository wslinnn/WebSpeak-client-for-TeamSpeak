# WebSpeak Client for TeamSpeak — 工作区指引

自托管 Node.js 网关，把浏览器用户接入 TeamSpeak 3/6；每个浏览器会话对应一个独立 TS 客户端。TeamSpeak 协议 SDK 以构建产物形式 vendored 在仓库内（`vendor/teamspeak-client/`）。

**定位与约束（做取舍时先读）**：这是上游的裁剪 fork，供自用；性能优先（延迟、通话质量、资源占用），**服务器上行仅 3Mbps** 是决定性约束——带宽相关的方案按 09 号报告 §1 的容量模型评估。已删除：加速中继、Android 端、DemoView、访客计数、皮肤系统（2026-10-18 下架，勿从 upstream 合并回归）。

## 主题文档（动手前按主题先读）

改造报告原文在 `D:\develop\project\tsweb\reports\`（09 性能/安全四阶段、12 二轮优化、13 体检、14 拆分、24 @layer 化、26 important 锁单源、27 一次性大重构战役）。

- **`.agents/notes/voice.md`** — 语音链路专册：多轨 RTP 透传架构、werift 关键机制、播放链路三层坑、诊断基建（/_rtp-lab、playback-debug、RTP_DEBUG）、TS 语音字节形态、语音复测清单。**改 `src/server/` 语音相关（voice-bridge / webrtc-audio / rtp-lab / opus-*）或 `web/src/voice/` 前必读。**
- **`.agents/notes/history.md`** — 改造批次史与 commit 索引、实施坑细节、遗留疑难、全部待复测清单。考古「为什么是现在这样」、核对复测状态、新里程碑落地后更新。
- **`.agents/notes/decisions.md`** — 会话回归不变量（会话恢复/收藏/切服/移动端布局/浮层/存储键/工作区动效的硬规则）、已评估否决项（勿重新立项）、条件重开项触发器、待拍板项。**改上述区域或立项评估前必读。**
- **`docs/DESIGN.md`** — 前端设计系统：`--wsd-*` 令牌表、层阶梯契约、样式文件分工、主题通道（html.dark）。

新踩的坑：一句话红线补进下方「踩坑红线」，细节与复盘记入对应主题文档。

## 结构

- `src/` — 后端（Express + ws + TeamSpeak SDK + Opus + werift + SQLite）：`server/` 网关核心，`shared/` 前后端共享的线上协议类型与运行时校验，`admin/` `security/` `persistence/`
- `vendor/teamspeak-client/` — vendored 的 `@echosixhiya/teamspeak-client` 构建产物（MIT）；升级步骤见 `VENDOR.md`
- `web/` — React 19 + Vite 前端（前端依赖独立安装，`web/package-lock.json`）：
  - `web/src/voice/` — 语音核心（framework-free，ESLint zone 禁反向依赖 UI）：`session-controller.ts` 门面 + 八个纯移动拆分模块（audio-preferences / chat-send / connection-lifecycle / audio-output / microphone / audio-devices / session-model / error-messages），133 节点门面测试只打公共契约
  - `web/src/web-client/` — 控制器层（chat-controller / channel-tree / members-controller / audio-controls 等页面自有控制器）
  - `web/src/components/web-client/` — 展示组件（返回 JSX 的装配 hook 也住这层）；`components/admin/` 管理台展示
  - `web/src/styles/` — 产品 CSS：`web-client/` 十个职责文件（tokens/base/ui/join/chrome/room/dialogs/menus/night/mobile，文件头注释即分工表），`admin/` 五个职责文件（base-auth/shell-dark/settings/theme-overrides/layout）；`web-client.css` 是 manifest，顶部 `@layer` 声明即覆盖契约
  - `web/src/i18n/` — 双语（zh 基准 363 键 + en 覆盖），`web-client/` 与 `admin/` 各一套
  - `web/src/views/` `services/` `hooks/` `app/` — 路由页 / 浏览器服务 / hooks / 应用壳
- `docs/` — 用户文档（README 中英双语）、DESIGN.md、历史改造计划；`scripts/` — 测试发现、Docker 健康检查、冒烟网关编排

## 命令

环境准备（vendored SDK 无需构建；原生 Opus 需要预编译）：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm rebuild @discordjs/opus --foreground-scripts --no-audit --no-fund
npm --prefix web ci --no-audit --no-fund
```

- 全量验证（提交/合并前必须全绿）：`npm run verify` = `lint` + `test` + `build` + `web:ci`；web 侧 `ci` = ESLint + **stylelint**（声明纪律：z-index 只准 `--ws-z-*` 变量、transition 禁 all 与布局属性）+ Vitest + `tsc -b && vite build`。
- 跑单个测试文件：`node --import tsx --test <路径>`；`npm test` 通过 `scripts/run-tests.mjs` 自动发现所有 `*.test.{ts,mjs}`，新增测试文件无需登记清单。
- 开发调试：`npm run dev`（后端，端口 3040）、`npm run web:dev`（前端 Vite）。
- 冒烟门禁：`npm run smoke`（Playwright 三视口 375/768/1280，单 worker 全串行 ~30s；`scripts/smoke-server.mjs` 一次性网关编排，端口 3041，`reuseExistingServer:false`——起服前清端口）。

## 架构边界与不变量

- 线上协议类型放 `src/shared/`（含运行时解析器），前后端共用；改协议字段必须同步两端类型与测试。
- 网关默认端口 3040（`src/constants.ts` `APP_PORT`，`WEBSPEAK_PORT` 覆写）；仅当 `certs/cert.pem` + `certs/key.pem` 存在才启用 HTTPS；会话上限 100（`MAX_ACTIVE_SESSIONS`）、单对端（IPv6 /64）并发 10（`MAX_SESSIONS_PER_PEER`，超限关闭码 4006）。
- 语音/会话/目录代码受大量生命周期不变量约束（会话 generation、陈旧回调失效、资源释放顺序、所有权归属）——**改动前先读 CLAUDE.md 对应章节**，这是本仓库最易出错的部分；语音链路另读 `.agents/notes/voice.md`。
- 组件测试跑 jsdom（`web/vitest.config.ts` `environment: "jsdom"`）；依赖时钟/预算的测试必须钉死时钟而非在替身里推进。
- SQLite schema 版本在 `src/persistence/database.ts`（当前 v12：v10 移除中继配置列，v11 将 `webrtc_enabled` 一次性置 1——WebRTC 是本 fork 的主语音路径，v12 删除管理端邀请表）；schema 迁移与结构性重构分开提交。
- 语音路径禁止逐帧持久日志；音频计数走内存诊断快照。

## 前端约定

- 双语（zh 基准 363 键 + en 独立实现）；对齐测试做包含校验（zh 键必须在 en 出现），**新增键必须两语同加**；`t()` 的变量替换用双花括号 `{{name}}`，单括号不替换会原样输出；用户可见错误要按错误类型区分。
- 管理台 API 响应经 `admin-responses.ts` 校验器按声明字段投影（未声明的字段被静默丢弃），前端再把聚合响应扁平化进控制器状态——新增后端诊断/响应字段必须同步三处：校验器声明、扁平化投影、模板消费点；只改校验器会以扁平类型在 tsc 报错，只改模板则拿到 undefined。
- 文档级页面样式必须由 `html[data-ws-route]` 门控（路由加载后 CSS 常驻）；`data-ws-part` 是部件锚点（冒烟测试与部件契约用），新增须保持静态字面量。
- **CSS 架构（2026-10-19 定稿，详见 docs/DESIGN.md）**：`web-client.css` manifest 顶部 `@layer` 声明即覆盖契约——`ws-tokens < ws-base < ws-ui < ws-join < ws-chrome < ws-room < ws-dialogs < ws-menus < ws-night < ws-mobile`。**一个组件族只住一个文件**，同族规则的响应式/暗色变体就近共置（media query 不加特异性）；跨文件覆盖只有层序一条路，**抬特异性跨层无效**。改规则前先读目标文件头分工表。结构由 `web-client-manifest.test.ts` 钉死。
- 浮层层级必须取 `--ws-z-*` 阶梯变量（`web/src/index.css` `:root` 单点定义，admin 与 web-client 共用：raised 10 / header 100 / dropdown 200 / menu-mask 300 / menu 310 / modal-mask 400 / toast 500），禁止裸 z-index 数字；`isolation: isolate` 容器内部的 1/2/3 局部小阶梯除外（stylelint 强制）。
- 颜色一律走命名变量：全局 `--wsd-*` 令牌（`tokens.css` 唯一事实源，日间默认 + `.dark` 覆盖）或组件根语义局部变量（横幅/恒暗 toast 等组件私有调色板）；颜色**使用点**裸 hex 为 0（`declaration-discipline.test.ts` 逐文件断言，豁免仅 custom property 定义行），新色值必须先落成命名变量再消费。落在 accent 填充上的字形走 `--wsd-accent-contrast`（夜间翻墨），哈希色头像首字母/滑杆白盘等非主题填充走 `--wsd-on-fill`（恒白）。
- `!important` 是锁面：每文件数量钉顶（同测试），同一锁面只允许住在一个文件（`cascade-locks.test.ts` 钉单源）；新增锁前确认同族没有更早层的锁（important 跨层按早层胜裁决）。
- 频道/成员等状态变更命令一律走应答式 `sendCommandAndWait` 并在失败时回滚本地乐观状态（错误对象携带 `code` 供分支处理）——`switchChannel` 曾因 fire-and-forget 导致界面漂移到未进入的频道且无任何提示。
- 全局弹窗/通知必须放模板根部（页面分支渲染之外），进房态与首页态都要可达。

## 其他注意事项

- Node.js ≥ 22.5（`.nvmrc` 固定 22；CI 用 22.22.2）；后端 TypeScript strict + NodeNext + ES2022。
- Git 远端：`origin` = wslinnn 仓库（默认推送目标），`upstream` = EchoSixHIYA 上游仓库。
- 多个 commit 共享同一文件时的拆分手法：先备份各文件终态，逐 commit 剥离后置 hunks，每个中间态过类型检查与定向测试后再提交，全部完成后终态与备份逐字节比对——保证每个中间提交可构建、可 bisect。
- 阶段 1 性能基线（改这些区域前先理解）：目录广播必须是 delta（`session-events.ts` 的 publishDelta），全量 `channelList` 只在连接/重连后发一次；头像走 capability URL（`avatar-service.ts` 的 HMAC aid + 内容 hash 版本化，WS 只推 `avatarSnapshot`/`avatarUpdate` 小消息，字节经 `GET /avatars/:aid` 由浏览器 HTTP 缓存吸收——URL 稳定性是缓存命中的前提，勿加时效签名；缓存只存正项、`avatar-cache.ts` 共享 LRU 128 条），不在频道树/成员里内联；网关两个 Opus 编码器经 `createVoiceEncoder()` 钉参（24kbps + VOIP + FEC/期望丢包 10%）；WebRTC pacer 空闲 200ms 停表、入帧即恢复（禁止逐帧门控）。
- 阶段 2 安全基线（2026-10-09 落地）：首启无默认口令，`admin-service.ts` 生成一次性 setup token 只打印到日志，登录后强制改密；`WEBSPEAK_TRUST_PROXY=1` 声明反代（`server/client-ip.ts` 统一解析：转信头仅在此时采信，IPv4-mapped 归一化为 IPv4，IPv6 按 /64 聚合限流键）；安全响应头全局中间件（CSP `default-src 'self'`——`style-src 'unsafe-inline'` 是 sonner 运行时注入的 toast 样式表所需，`script-src 'wasm-unsafe-eval'` 是 RNNoise 降噪 WASM，`media-src blob:` 是麦克风试听回放；`img-src data: blob:` 与 `font-src blob:` 是已下架皮肤时代的遗留通道，收紧须同步 `security-headers.test.ts` 与真机回归、勿顺手"修复"；`connect-src 'self'` 是有意的收窄——语音 WS 恒同源且浏览器地板（WebCodecs）已高于 Safari 15.4 的 'self'/ws 匹配修复，勿再放宽 `ws: wss:`，全部由 `security-headers.test.ts` 钉死；HSTS 仅 HTTPS 响应）；WS 控制消息令牌桶（`command-rate-limit.ts`，30 突发/20 每秒，限流回执 1 秒合并一条）；TS 服务器密码错误按目标计数退避（`server-password-guard.ts`，join 端点仅对用户自带密码的请求检查）；fixed 模式不向普通用户返回真实 target；转义收敛 `security/ts-escaping.ts`（含 \t\f\v）。
- 运维开关：`WEBSPEAK_LOG_LEVEL=debug` 恢复文件 debug 日志；`WEBSPEAK_SDK_DEBUG=1` 打开 SDK 协议日志（默认关，协议报文可能内嵌凭据）；`WEBSPEAK_TRUST_PROXY=1` 反代部署必设。
- `data/`、`config.json`、`*.pem`/`*.key`、`.env*` 为本地私有内容，禁止入库。
- 需要真实 TeamSpeak 服务器或浏览器媒体设备的测试，须单独记录环境与结果；不得用 mock 编解码器冒充真实音频验证。

## 踩坑红线（一句话版；细节与出处在主题文档）

- 管道尾接 grep/tail 会吃 `npm run verify` 的退出码——判定一律 `> log 2>&1; st=$?` 显式判 st；**shell cwd 会漂（子命令 cd 后不回），跑 verify 前先回仓库根**（web/ 下没有 verify 脚本）；且**先看 st 再提交**，不得把「grep 日志返回 0」当验证通过（曾三次带病提交，最近一次即提交链里 grep 日志成功掩盖了 EXIT=1）。
- Git Bash 里 `node -e` 内联脚本带正则转义/中文会碎——批量文本手术一律 Write 临时 .mjs 文件执行，用完删除；长中文内容一律用 Write/Edit 工具写文件，不用 heredoc（控制台 GBK 会把内容写乱）。
- 凡验证 TTL/超时的测试一律 mock 时钟（t.mock.timers 钉死 Date.now）；测试替身与被测预算共享时钟时，替身改记录、不推进时钟。
- CSS 死类清理对动态类前缀（`mobile-view-` / `language-` / `permission-` 等）豁免；名单随新增动态类维护。
- i18n 键校验勿依赖缩进（en 块尾部空格曾伪报缺键）。
- 改样式后先看 diff、按属性数自检（曾整段误删相邻属性声明）。
- 给已有「直接子级通用规则」的容器加新子元素（如 `.voice-card > span` 状态行），新子元素的类规则必须带容器前缀抬特异性——裸类规则会被 (0,2,1) 压过且 grep 规则文本看不出来（mic 角标错位三轮破案，details 在 decisions/history 五轮）。**同文件内**同特异性后位胜出；跨文件走层序，特异性无效。改完必须真浏览器查计算样式确认生效。
- 判「样式为什么这样渲染」必须真浏览器查计算样式（产物 CSS + 手摆 DOM 探针 + getComputedStyle），规则文本 grep 与部署状态推断都不算数（四轮曾据此误判「部署过期」）。
- 做 CSS 层重排/分片合并必须用**全对**冲突扫描判据（`reports/layer-tools/p4b-scan-all.mjs`：报告 26 原版只记 `spec(早)>spec(晚)` 对，同特异性翻盘不可见）；合并前后做规则多重集对账（零丢失零改写）。
- 临时脚本/探针页用完即删；后台网关（3041）用完即停，`reuseExistingServer:false` 下残留端口会静默吃掉下一次冒烟。
