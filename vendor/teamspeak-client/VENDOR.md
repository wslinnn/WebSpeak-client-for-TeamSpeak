# Vendored: @echosixhiya/teamspeak-client

本目录是 TeamSpeak 客户端协议 SDK 的**构建产物 vendoring**，目的：消灭构建期对 GitHub 上游仓库的网络依赖（供应链单点），`npm ci` 即可离线完成安装。

- 上游：https://github.com/EchoSixHIYA/teamspeak-js
- 来源 commit：`56d426d24852c39439f7bfe1d5850b574a1b0811`（对应上游发布 v0.2.4）
- 内容：上游 `dist/` 构建产物（未修改）+ LICENSE（MIT）+ 上游 README；`package.json` 仅保留运行所需字段
- vendoring 日期：2026-10-09

## 升级方式

1. 把根 `package.json` 的 `@echosixhiya/teamspeak-client` 临时改回 git 依赖（新 commit），跑 `npm run prepare:sdk` 等价流程（克隆→构建→取 `dist/`），或直接从上游 Release 产物取 `dist/`；
2. 覆盖本目录 `dist/`，更新 `package.json` 的 `version` 与本文件的 commit 记录；
3. 跑 `npm run verify` 确认协议相关测试全绿。

`dist/` 中的 `.map` 文件保留：用于调试时定位 SDK 内部堆栈。
