# WebSpeak

**让 TeamSpeak 自然地进入浏览器。** 自托管的 TeamSpeak 3 / TeamSpeak 6 网页客户端与语音网关。

用户无需安装桌面客户端，打开网页即可加入语音频道；部署者仍然掌控目标服务器、访问策略和数据。

## 能力

| 能力 | 说明 |
| --- | --- |
| TeamSpeak 3 / 6 | 自动探测目标服务器协议，同时支持 IPv4 与 IPv6 目标。 |
| 实时语音 | Opus 编码。WebRTC 低延迟传输为主路径，另有 WebSocket 兼容传输。 |
| 频道与成员 | 浏览频道树、查看实时成员状态、切换频道、按权限调度成员。 |
| 屏幕共享 | 浏览器之间以及浏览器与 TeamSpeak 6 原生客户端之间经 WebRTC 端到端直传，网关只转发协商信令。 |
| 音频控制 | 麦克风与扬声器选择、成员独立音量、VOX、麦克风测试、浏览器端 GTCRN 降噪。 |
| 消息与互动 | 频道消息、服务器消息、私聊、戳一戳与耳语。 |
| 桌面端伴奏 | 选择带音频的窗口或标签页，把声音分享给当前频道。 |
| 身份与访问 | 身份保持、TeamSpeak 3 身份导入与导出、访客自定义目标。 |
| 管理控制台 | 目标、访问策略、WebRTC、会话、审计日志、诊断与备份。 |

## 部署

三种方式，任选其一。

### Docker Compose（推荐）

```bash
git clone --depth 1 https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak.git
cd WebSpeak-client-for-TeamSpeak
docker compose pull
docker compose up -d
```

启动后访问 `http://<你的主机>:3040`。数据保存在 `webspeak-data` volume 中；升级用 `docker compose pull && docker compose up -d`。

不要执行 `docker compose down -v`，否则会删除数据库和管理员设置。

### 发布包

从 [Releases](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/latest) 下载对应平台的包，解压后运行 `start-webspeak.cmd`（Windows）或 `start-webspeak.sh`（Linux）。发布包自带 Node.js 运行时和生产依赖，无需另行安装环境。

下载 `SHA256SUMS.txt` 可校验附件完整性。

### 源码运行

需要 Node.js 22.22.2 或更高版本，以及用于构建 `@discordjs/opus` 的 Python、Make 和 C/C++ 编译工具：

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

## 首次配置

1. 打开 `http://<你的主机>:3040/admin`。
2. 在服务日志中找到一次性设置令牌（`Admin setup token: ws-setup-…`），用它登录并立即设置新密码。令牌在你设置密码后失效。
3. 在「服务器」页配置 TeamSpeak 目标和访问方式，例如 `voice.example.com#9987`。
4. 公网使用请配置 HTTPS —— 麦克风、屏幕采集等媒体能力通常要求安全来源。

启用 WebRTC 时，需在防火墙放行控制台显示的 UDP 端口范围（默认 `40000–41999`）。

## 运行要求

| 项目 | 要求 |
| --- | --- |
| Node.js | 22.22.2 及以上 |
| 浏览器 | 支持 WebRTC 的现代浏览器（Chrome、Edge 等） |
| Web 端口 | `3040/tcp`，公网建议经 HTTPS 反向代理 |
| TeamSpeak | 网关主机须能访问目标服务器，默认语音端口 `9987` |
| WebRTC | 默认 `40000–41999/udp`；修改端口范围前先关闭 WebRTC |
| 屏幕共享 | 跨网直连需放行 UDP `3478`（内置 STUN）；对称 NAT 无 IPv6 时无直连路径 |
| 会话上限 | 单实例最多 100 个活动网页会话 |

## 安全边界

同源校验（`Origin` 必须与 `Host` 一致，语音 WebSocket upgrade 同样校验）只能防跨源请求，**不能防 DNS rebinding**。网关应只在受信网络内暴露，公网入口交给受控的反向代理并与网关分处不同主机；不要把 `3040/tcp` 直接暴露给不可信网络。

同机回环反代默认被信任（`WEBSPEAK_TRUST_PROXY=0` 可显式关闭）；反代位于其它机器或容器网段时，用 `WEBSPEAK_TRUSTED_PROXIES` 声明其 IP/CIDR。转发头只采信已声明或回环代理所发的值。

使用反向代理时，HTTP 与 WebSocket 两个 location 都必须保留公网 Host（nginx 默认会改写为上游地址），否则语音连接会以 `1008 ORIGIN_REJECTED` 被拒。

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `WEBSPEAK_DATA_DIR` | 持久化数据目录，默认项目内 `data/`，Docker 使用 `/data` |
| `WEBSPEAK_PORT` | HTTP 端口，默认 `3040` |
| `WEBSPEAK_LOG_LEVEL` | 设为 `debug` 恢复详细日志 |
| `WEBSPEAK_SDK_DEBUG` | 设为 `1` 打开 TeamSpeak SDK 协议日志（可能含凭据，默认关闭） |
| `WEBSPEAK_TRUST_PROXY` | 设为 `0` 关闭回环反代信任 |
| `WEBSPEAK_TRUSTED_PROXIES` | 逗号分隔的受信代理 IP/CIDR，覆盖上一项 |
| `WEBSPEAK_STUN_PORT` | 内置 STUN 端口，默认 `3478`，设为 `0` 关闭 |
| `WEBSPEAK_SCREEN_SHARE_ICE_SERVERS` | 覆盖屏幕共享 ICE 服务器列表（JSON 数组或逗号分隔 URL） |

## 文档

- [简体中文完整文档](docs/README.zh-CN.md)
- [English documentation](docs/README.en.md)
- [设计系统](docs/DESIGN.md)
- [更新日志](CHANGELOG.md)

## 许可证

本项目以 [GNU Affero General Public License v3.0 only](LICENSE) 发布。你可以使用、研究、修改和再分发；如果修改后的版本通过网络向用户提供服务，需按 AGPL-3.0 向这些用户提供对应源代码。

WebSpeak 基于 [EchoSixHIYA/WebSpeak-client-for-TeamSpeak](https://github.com/EchoSixHIYA/WebSpeak-client-for-TeamSpeak) 二次开发，本项目为独立维护的自托管裁剪版本。
