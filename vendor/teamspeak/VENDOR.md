# Vendored: @honeybbq/teamspeak

本目录是 TeamSpeak 客户端/服务端 SDK 的**构建产物 vendoring**，目的：消灭构建期对 GitHub 上游仓库的网络依赖（供应链单点），`npm ci` 即可离线完成安装。

- 上游（上游的上游，当前基线）：https://github.com/HoneyBBQ/teamspeak-js
- 构建来源：https://github.com/wslinnn/teamspeak-js（本仓库维护者的 fork）commit `2609675` ＝ 上游 main `1.0.0-beta.26` **无本地补丁**
- 内容：fork `dist/` 构建产物 + LICENSE（MIT）+ 上游 README；`package.json` 仅保留运行所需字段
- vendoring 日期：2026-11-05

历史备注：2026-10-09 至 2026-11-03 期间 vendor 的是旧线 `@echosixhiya/teamspeak-client` 0.2.4（EchoSixHIYA 中间上游，fork 构建来源保存在 wslinnn/teamspeak-js 的 `backup/echosix-line-0.2.4` 分支），带三处本地补丁（自我识别 / 私语标志 / RTT 尾字节）。2026-11-05 fork main 对齐到 HoneyBBQ 上游 main 后改为纯净产物：

1. 自我识别：上游 client.ts 已按 `initserver`/`aclid` 处理自我识别（含 aclid 缺失的握手窗口兜底），旧补丁等价已吸收；
2. 直接私语帧格式：上游 `sendWhisper` 直接客户端/频道目标不置 `0x20` 组私语位（有 wire behaviours 实测钉住），旧补丁等价已吸收；
3. RTT 尾字节（旧 fork 出向增强）：**放弃**，上游不发送，官方客户端侧无影响；
4. **已接受的接收侧劣化**（拍板 2026-11-05）：上游 `VoiceDataEvent` 不暴露包头 flags（高 nibble 0x10 扩展 / 0x40 尾字节），官方桌面端每连接前 5 个语音包的尾字节不再由网关剥离（Opus 解码器容忍尾部多余字节；桌面端 nvp 恒 1，0x10 实际不出现）。详见 `src/server/voice-payload.ts` 头注释。

## 升级方式

1. fork 仓库（wslinnn/teamspeak-js）main 对齐上游目标 commit，`pnpm install --frozen-lockfile && pnpm build`；
2. 覆盖本目录 `dist/`（删除其中 `*.test.*` 产物），更新 `package.json` 的 `version`（`+webspeak.N` 后缀递增）与本文件的 commit 记录；
3. 跑 `npm run verify` 确认协议相关测试全绿。

`dist/` 中的 `.map` 文件保留：用于调试时定位 SDK 内部堆栈。
