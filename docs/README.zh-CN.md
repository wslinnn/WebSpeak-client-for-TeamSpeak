# WebSpeak · 简体中文

[返回项目首页](../README.md) · [English](./README.en.md)

WebSpeak 是一个可自行部署的 TeamSpeak 3 / TeamSpeak 6 网页客户端与语音网关。用户无需安装桌面客户端即可从浏览器加入频道，管理员可以在控制台管理目标服务器、访问方式和运行状态。

## 在线 Demo

暂未提供公共在线 Demo。请按下文部署方案自行搭建实例试用。

## 特性

| 能力 | 说明 |
| --- | --- |
| TeamSpeak 兼容 | 支持 TeamSpeak 3 与 TeamSpeak 6，并自动探测目标服务器协议。 |
| IPv6 目标 | 默认支持 IPv6 字面量目标和域名解析出的 IPv6 地址。 |
| 实时语音 | Opus 编码。WebRTC 低延迟传输为主路径，另有 WebSocket 兼容传输。 |
| 频道与成员 | 浏览频道树、查看实时成员状态、切换频道，并按权限调度成员。 |
| 音频控制 | 麦克风与扬声器选择、成员独立音量、VOX、麦克风测试、麦克风增益与回声消除。 |
| 浏览器端降噪 | 可开关的 GTCRN 降噪在浏览器采集端处理，不增加服务器端音频处理压力。 |
| 消息与互动 | 频道消息、服务器消息、私聊、戳一戳与耳语目标。 |
| 桌面端伴奏 | 在桌面浏览器选择带音频的窗口或标签页，将声音分享给当前频道。 |
| 跨端屏幕共享 | 浏览器之间以及浏览器与 TeamSpeak 6 原生客户端之间经 WebRTC 端到端直传，网关只转发协商信令。 |
| 身份与访问 | 身份保持、TeamSpeak 3 身份导入/转换/校验/导出、访客自定义目标。 |
| 管理控制台 | 目标、访问策略、WebRTC、会话、审计日志、诊断与备份。 |
| 界面与部署 | 中文与 English 界面、响应式桌面/移动布局、日间/夜间主题；支持 Docker 与发布包自托管。 |

## 界面截图

以下截图展示中文界面的欢迎页、语音工作区、音量控制和成员操作菜单。

### 欢迎页

<p align="center"><img src="./screenshots/webspeak-zh-home.png" alt="WebSpeak 中文欢迎页" width="100%" /></p>

### 语音工作区

<p align="center"><img src="./screenshots/webspeak-zh.png" alt="WebSpeak 中文语音工作区" width="100%" /></p>

### 音量控制

<p align="center"><img src="./screenshots/webspeak-zh-audio.png" alt="WebSpeak 中文音量控制" width="100%" /></p>

### 成员菜单

<p align="center"><img src="./screenshots/webspeak-zh-menu.png" alt="WebSpeak 中文成员菜单" width="100%" /></p>

## 高级功能

高级功能均为可选项。配置入口在管理员控制台的「服务器」页，保存后对新连接生效。

### WebRTC 低延迟语音

WebRTC 将浏览器语音切换到实时媒体通道，也支持桌面端伴奏。媒体服务由当前 WebSpeak 网关直接提供，不需要另设媒体服务器。

1. 登录 `/admin`，打开「服务器」页的高级参数。
2. 关闭 WebRTC 时可设置 UDP 起止端口，默认范围为 `40000–41999`。
3. 在 WebSpeak 主机的安全组和防火墙中放行整个 UDP 范围。
4. 勾选「启用 WebRTC」并保存，用户重新进入后即可协商。

WebRTC 启用后端口范围会锁定。要修改端口，先关闭 WebRTC 并保存，再修改端口并同步防火墙规则。公网使用还需要 HTTPS。

### 反向代理 / TCP 隧道下的语音

在管理后台的 WebRTC 高级参数中可设置：

- **公网媒体地址**：WebSpeak 网关可被 UDP 访问的 IP 或域名，不含协议、路径或端口。留空时按 `Origin`、`X-Forwarded-Host`、`Host` 推断。反代域名不一定是媒体地址。
- **启用 IPv6 候选**：默认关闭；开启后保留 IPv4，同时收集 IPv6。需确保 IPv6 路由及 UDP 防火墙放行。
- **语音 STUN 服务**：可设置 `stun:turn.teamspeak.com:3478`，浏览器和网关使用同一服务发现公网映射。留空时网关仍使用内置 STUN，浏览器不配置 STUN。当前字段仅支持 IPv4 可达的 UDP STUN 域名或地址，不接受 IPv6 字面量、TURN 或凭据。

保存后重新连接。网页和 WebSocket 经反代可达，不代表媒体 UDP 可达；STUN 仅发现地址，不中继音频。只有 TCP 隧道而无可用 UDP/IPv6 路径时，语音会保持在兼容传输。

### 屏幕共享的 ICE 候选

屏幕共享媒体始终走浏览器之间的直连，WebSpeak 只转发协商信令。网关自带 STUN 服务（UDP `3478`，`WEBSPEAK_STUN_PORT` 可改端口、设为 `0` 关闭）：设置了「公网媒体地址」时，屏幕共享默认优先使用 `stun:<公网媒体地址>:3478` 发现公网候选，TeamSpeak 官方 STUN 仅作后备。跨网直连需要防火墙放行 UDP `3478`。

STUN 无法穿透对称 NAT（含运营商 CGNAT）：两端都处于此类网络且无 IPv6 时没有直连路径，属网络条件限制。

若部署者要完全自定义候选列表（含外部 TURN），可在启动 WebSpeak 前设置 `WEBSPEAK_SCREEN_SHARE_ICE_SERVERS`，值为 JSON 数组或逗号分隔的 URL：

```json
[{"urls":"stun:turn.teamspeak.com:3478"},{"urls":"turns:turn.example.com:5349","username":"<username>","credential":"<credential>"}]
```

配置 TURN 后，媒体可能经过该外部 TURN 服务，但不会经过 WebSpeak 网关；未配置时只使用直连和 STUN。

### 跨端屏幕共享

浏览器用户与 TeamSpeak 6 原生客户端可以互相发现、发起和观看屏幕共享。页面提供直播状态、观众人数、播放器音量、全屏和退出控制，也可在共享设置窗口中选择分辨率与帧率档位，并查看 WebRTC 统计。协商失败时会透出实际尝试的发现服务、候选计数与首帧证明，便于定位跨网问题。

### 依赖与归属

- WebRTC 使用 [werift](https://github.com/shinyoshiaki/werift-webrtc) `0.24.4`，上游采用 MIT 许可证。
- TeamSpeak 协议使用 `@honeybbq/teamspeak` 1.0.0-beta.26 的构建产物，已 vendor 进仓库 `vendor/teamspeak/`（MIT），升级步骤见该目录的 `VENDOR.md`。
- 降噪使用 [@sapphi-red/web-noise-suppressor](https://github.com/sapphi-red/web-noise-suppressor) 的 GTCRN 模型（MIT）。

## 更新日志

完整记录见 [CHANGELOG.md](../CHANGELOG.md)。

| 版本 | 日期 | 摘要 |
| --- | --- | --- |
| [v0.3.0](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.3.0) | 2026-11-18 | 本仓库首个正式版本。语音链路重构（混音总线、编码器对齐官方、静音时间线、出站积压定容）；屏幕共享引入内置 STUN 与跨网诊断；安全基线（一次性设置令牌、安全响应头、限流、反代信任）；管理台与前端迁移 React 19 并 UI 原语化。移出加速中继、Android 客户端、DemoView、访客计数与皮肤系统。 |

## 部署方案

| 方案 | 适用场景 | 环境 |
| --- | --- | --- |
| Docker Compose（推荐） | 长期运行、升级简单、数据持久化 | Docker Engine + Docker Compose |
| 发布包 | 不安装 Node.js 和构建依赖 | Windows x64 或 Linux x64/ARM64 |
| 源码运行 | 开发、调试和二次开发 | Node.js 22.22.2+、Git 和本地编译工具 |

### Docker Compose（推荐）

```bash
git clone --depth 1 https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak.git
cd WebSpeak-client-for-TeamSpeak
docker compose pull
docker compose up -d
```

启动后访问 `http://<你的主机>:3040`。使用反向代理时将上游指向该地址：同机回环反代默认即被信任（`WEBSPEAK_TRUST_PROXY=0` 可显式关闭）；反代在其它机器或容器网段时用 `WEBSPEAK_TRUSTED_PROXIES` 声明其地址。启用 WebRTC 时放行控制台显示的 UDP 端口范围。数据保存在 `webspeak-data` volume 中。

```bash
docker compose ps
docker compose logs -f webspeak
```

升级：

```bash
git pull --ff-only
docker compose pull
docker compose up -d
```

不要执行 `docker compose down -v`，否则会删除数据库和管理员设置。

### 发布包

从 [Releases](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/latest) 下载与系统和架构匹配的 `windows-x64.zip`、`linux-x64.tar.gz` 或 `linux-arm64.tar.gz`，解压后运行对应启动脚本。发布包自带 Node.js 运行时和生产依赖。Docker 镜像支持 amd64/arm64。

### 源码运行

```bash
git clone https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak.git
cd WebSpeak-client-for-TeamSpeak
npm ci --ignore-scripts
npm rebuild @discordjs/opus --foreground-scripts
npm --prefix web ci
npm --prefix web run build
npm run build
npm start
```

构建 `@discordjs/opus` 需要 Python、Make 和 C/C++ 编译工具。

### 首次配置

1. 打开 `http://<你的主机>:3040/admin`。
2. 从服务日志读取首次启动打印的一次性设置令牌（`Admin setup token: ws-setup-…`），用它登录 `/admin` 并立即设置至少 12 位的新密码；令牌在设置新密码后失效。
3. 在「服务器」页配置 TeamSpeak 目标和访问方式，例如 `voice.example.com#9987`。
4. 公网使用时配置 HTTPS；启用 WebRTC 时放行控制台显示的 UDP 范围。

### 常见问题

- **刷新或断网后提示被 TeamSpeak 服务器封禁**：这是 TeamSpeak 服务器反洪水保护对高频重连的临时封禁，通常几分钟自动解除。WebSpeak 会在断开后 60 秒内保留会话——刷新或网络恢复时直接回到原房间，TeamSpeak 侧零重连；主动断开立即下线。
- **日志里的客户端 IP 都是 127.0.0.1**：网关只采信「已声明/回环代理」发来的转发头。出现此现象多是因为显式设置了 `WEBSPEAK_TRUST_PROXY=0`，或反代未发送 `X-Forwarded-For`（nginx：`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`）。反代在另一台机器或容器网段时，用 `WEBSPEAK_TRUSTED_PROXIES=10.0.0.5,172.16.0.0/12` 声明其 IP/CIDR。
- **刷新后如何回到房间**：断开后 60 秒内重开页面会自动恢复原房间，无需重填密码；点击「断开」则立即下线并清除恢复信息。
- **屏幕共享只有同一局域网可见**：确认已设置「公网媒体地址」并放行 UDP `3478`；对称 NAT 且无 IPv6 时没有直连路径，需要配置外部 TURN。

## 要求和注意事项

| 项目 | 要求或注意事项 |
| --- | --- |
| 浏览器 | 建议使用最新版 Chrome、Edge 或其他支持 WebRTC 的现代浏览器。麦克风和窗口音频通常要求 HTTPS。 |
| TeamSpeak 网络 | WebSpeak 主机必须能够访问目标 TeamSpeak；默认语音端口为 `9987`。 |
| Web 服务网络 | 服务使用 `3040/TCP`，公网建议通过 HTTPS 反向代理提供网页和 WebSocket。 |
| IPv6 | IPv6 字面量写为 `[2001:db8::1]#9987`。主机/容器需要可路由 IPv6、启用 IPv6 的操作系统和 Node.js，以及相应防火墙放行。 |
| WebRTC | 默认使用 `40000–41999/UDP`，启用后需放行整个范围；修改范围前先关闭 WebRTC。 |
| 屏幕共享 | 跨网直连需放行 UDP `3478`。 |
| 身份保持 | 同一浏览器身份同时只能保持一条活动连接；并行连接请关闭第二条的身份保持或使用其他浏览器配置文件。 |
| 伴奏 | 仅桌面端提供且要求 WebRTC；选择窗口或标签页时还要勾选共享音频。 |
| 数据 | Docker 数据在 `webspeak-data` volume；发布包和源码运行数据在 `data/`。升级前建议备份。 |
| 会话上限 | 单实例最多允许 100 个活动网页会话。 |
| 部署安全边界 | 同源校验（`Origin` 必须与 `Host` 一致，语音 WebSocket upgrade 同样校验）只能防跨源请求，**不能防 DNS rebinding**。网关只应在受信网络内暴露（防火墙/ACL、内网或 VPN），公网入口交给自己控制的反向代理并与网关分处不同主机；不要把 `3040/TCP` 直接暴露给不可信网络。**反代注意**：HTTP 与 WebSocket 两个 location 都必须保留公网 Host——nginx 默认的 `proxy_pass` 会把 Host 改写成上游地址，需要显式 `proxy_set_header Host $host;`（以及 `Upgrade`/`Connection` 头），否则语音连接会以 1008 `ORIGIN_REJECTED` 被拒。 |
| 浏览器存储与密码 | 记住服务器密码是常开的本机行为：open 模式写入 IndexedDB 的收藏记录，fixed 模式写入 `localStorage` 的独立键——两者都是**明文**，作用域仅限本设备与本源，可由「清除本地数据」整体抹掉。页面侧靠 CSP 收窄 XSS 面，但这不等于浏览器存储加密，公共/共享电脑上请勿依赖密码记忆。 |
| 管理口令哈希 | 管理员口令用 scrypt（`N=2^15, r=8, p=1`，每次约 32 MiB）存储，参数随凭据行一起保存，日后提高成本不会让旧口令失效。内存充裕的部署可自行提高 `src/security/admin-password.ts` 的 `N` 并同步提高 `maxmem`。 |

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `WEBSPEAK_DATA_DIR` | 持久化数据目录，默认项目内 `data/`，Docker 使用 `/data` |
| `WEBSPEAK_PORT` | HTTP 端口，默认 `3040` |
| `WEBSPEAK_LOG_LEVEL` | 设为 `debug` 恢复详细日志 |
| `WEBSPEAK_SDK_DEBUG` | 设为 `1` 打开 TeamSpeak SDK 协议日志（可能含凭据，默认关闭） |
| `WEBSPEAK_TRUST_PROXY` | 设为 `0` 关闭回环反代信任（默认开启） |
| `WEBSPEAK_TRUSTED_PROXIES` | 逗号分隔的受信代理 IP/CIDR，覆盖上一项 |
| `WEBSPEAK_STUN_PORT` | 内置 STUN 端口，默认 `3478`，设为 `0` 关闭 |
| `WEBSPEAK_SCREEN_SHARE_ICE_SERVERS` | 覆盖屏幕共享 ICE 服务器列表 |
| `WEBSPEAK_RTP_DEBUG` | 打开 RTP 实验室诊断（排查语音用） |
