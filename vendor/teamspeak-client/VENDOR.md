# Vendored: @echosixhiya/teamspeak-client

本目录是 TeamSpeak 客户端协议 SDK 的**构建产物 vendoring**，目的：消灭构建期对 GitHub 上游仓库的网络依赖（供应链单点），`npm ci` 即可离线完成安装。

- 上游：https://github.com/EchoSixHIYA/teamspeak-js
- 构建来源：https://github.com/wslinnn/teamspeak-js（上游 fork）commit `1f1f90f7dbbeacfb5ce566690192df7096cc0ffd`＝上游 `56d426d24852c39439f7bfe1d5850b574a1b0811`（v0.2.4）＋ 一处本地修复
- 内容：fork `dist/` 构建产物 + LICENSE（MIT）+ 上游 README；`package.json` 仅保留运行所需字段
- vendoring 日期：2026-10-09；fork 补丁重构建日期：2026-10-11

## 构建来源相对上游的偏离（1f1f90f）

`dist/` 基于 fork commit `1f1f90f` 构建，相对上游 `56d426d` 仅一处修复（`src/client.ts` 的 `notifycliententerview` 自我识别逻辑）：

- 原行为：任何 clientEnter 通知的昵称若等于「本端昵称 + 纯数字后缀」即被当作自己，采纳其 clid 并改写出向包头部的 clientID。当服务器上存在另一个昵称为「本端昵称+数字」的客户端（重名自动改名产生，或多端同昵称场景）时，本端会劫持对方的 clid，此后所有出向包（含 ACK）在服务端无法归属，服务端以 COMMAND 包重发超时踢掉连接。
- 新行为：自我识别以 `initserver` 下发的 clid 为准（昵称匹配仅在 clid 尚未从 `aclid` 获得的握手窗口内作为兜底）；自己的 clientEnter 同时跟踪服务端改名后的昵称。
- 修复已含 fork 的回归测试（`src/client.test.ts`）；待上游吸收后可回到未修改的上游构建产物。

## 升级方式

1. 把根 `package.json` 的 `@echosixhiya/teamspeak-client` 临时改回 git 依赖（新 commit），跑 `npm run prepare:sdk` 等价流程（克隆→构建→取 `dist/`），或直接从对应仓库的 Release 产物取 `dist/`；若走 fork 补丁构建，则从 fork 源码构建；
2. 覆盖本目录 `dist/`，更新 `package.json` 的 `version` 与本文件的 commit 记录；
3. 跑 `npm run verify` 确认协议相关测试全绿。

`dist/` 中的 `.map` 文件保留：用于调试时定位 SDK 内部堆栈。
