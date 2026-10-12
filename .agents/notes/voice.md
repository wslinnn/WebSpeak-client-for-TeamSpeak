# 语音链路专册（改语音代码前必读）

> 拆分自根 AGENTS.md 的语音主题记忆。范围：`src/server/voice-bridge.ts` 及其拆出模块、`src/server/webrtc-audio.ts`、`src/server/rtp-lab.ts`、`src/server/opus-frame.ts`、`web/src/voice/`。改造报告原文在 `D:\develop\project\tsweb\reports\`。

## 现行架构：WebRTC 多轨 RTP 透传（SFU 形态）

改造于 2026-10-13/14（`b2b9294`+`958f9fc`+`e551a1a`，已推送；原四刀中刀 2/3 因前后端物理不可分割合并为一笔）。用户优先级（勿倒置）：**最佳音质 > 网关性能 > 优先 WebRTC 回退 WS**。

- **上行**：answer fmtp 钉 `maxaveragebitrate=60000;usedtx=0`（60k 在 TS quality 10 的 7.71KiB/s 预算内、64k 会被服务器裁包；fmtp 只是上限，浏览器端 applyAnswer 后对音频 sender `setParameters` maxBitrate=60000 配套才生效；不设 stereo——上行 mono，stereo 声明只会分薄码率）。
- **下行**：每说话人一条 RTP 流。网关预开 16 条 sendonly 槽轨（浏览器 offer 预开同数 recvonly 免重协商；超出的 m-line answer inactive 防恶意 offer 放大），TS 原始 Opus 包 payload 一字节不动，只重写 seq/timestamp（帧时长经 RFC 6716 TOC 解析，`opus-frame.ts` 覆盖 SILK/hybrid/CELT×code 0-3，已用 @discordjs/opus 60k 全档真实编码包逐帧验证解析正确）、marker 标流首包、随机起点防跨流关联；说话人 LRU 占槽、绑定经 voiceRoute 消息下发。
- **槽位池 12→16**（`4f08c2b`）：`DOWNSTREAM_SLOTS`（前端）/`MAX_DOWNSTREAM_SLOTS`（网关）成对扩容；voiceRoute 校验上限本就 ≤16；新旧混跑时多余 m-line 按 inactive 降级。槽位语义：每听众 16 路并发预算，LRU 淘汰最久未说话者；成员音量是本地渲染参数，不影响他人听感、不影响说话者上行。
- **网关 mixer 全套已删**：音频 CPU 趋零，`setMemberVolume` 网关命令与 `voiceActivity` 事件随删。
- **voice-bridge 已拆分**：DetachedSessionPool / createVoiceRtc / createVoiceConnectionHandler 三模块（拆分记录见 `.agents/notes/history.md`）。
- **浏览器播放（`webrtc-playback.ts` 元素池，现行）**：每槽隐藏 `<audio>` 元素直连远端流；master 音量 ≤0 → muted；成员+总音量 ≤100% 走 `element.volume`；>100% 走惰性增益管道（ampContext + GainNode，flowed 门控，失败自动钳回 100%）；说话指示 = `receiver.getStats()` 的 packetsReceived 增量（150ms 轮询 + 1.2s hangover）；扬声器选择经 `setSinkDevice` 统一路由（"" 归一化 "default"，失败聚合传播供 `setOutputDevice` 回滚）。ontrack 一律 `new MediaStream([event.track])` 逐轨自建流（铁律，见三层坑③）。立体声伴奏（codec 5）顺带修复。
- 初版播放图（每槽 MediaStreamSource→GainNode（成员音量本地化）→AnalyserNode（说话指示 RMS≥0.01）→汇总 MediaStreamDestination→单个 audio element 出声，保 setSinkId 路由/iOS 解锁/retry 语义）已被元素池取代，仅存档。

## werift 关键机制（勿回退，源码+实验双验证）

- **方向回显**：werift 把 offer 方向原样回显为被动 transceiver 的本地意向——不显式把上行钉 recvonly、槽轨钉 sendonly，浏览器收不到下行（`andDirection` 是 Directions 枚举按位与，`offerDirection` 存的是 reverseDirection 后的视角）。
- **协商形状**：answer 方 `buildAnswerSdp` 只遍历远端 offer 已有的 m-line——answer 方无法把本地多出的 transceiver 塞进协商（实验室曾踩：纯下行实验页面必须单条 recvonly 对网关单条 sendonly；生产不踩因浏览器预开全部 m-line）。
- **主动订阅**：werift 在 `setRemoteDescription(offer)` 内同步注册浏览器 SSRC 并触发 `transceiver.onTrack`——被动等 offer 再挂订阅永远错过事件、上行 RTP 无人消费。修复 = 构造时主动 `addTransceiver("audio", sendrecv)` + 即时订阅（werift 以 mid=null+kind 匹配复用给 offer 首条 audio m-line），answer 阶段仅翻转为 recvonly。这是首版真机双向断流的根因（`e551a1a`）。
- **SSRC 归 sender**：werift 的 sender 拥有 SSRC（SDP `a=ssrc` 自动宣告、writeRtp 时覆盖 header.ssrc/payloadType，seqOffset/timestampOffset 初值 0），seq/timestamp 由网关按槽位推进。
- **SDP 只读**：`RTCSessionDescription.sdp` 只读；SDP 修改走协商 codec 对象的 `parameters` 字段（`pinOpusCodecParameters` 合并而非覆盖浏览器参数）。
- **无 msid 应答**：对「裸 recvonly offer」，werift answer 的 SDP 不含任何 `a=msid`（sender.streamIds 为空、也不回显远端流 id）——Chrome 由此把全部下行轨归入同一默认 MediaStream（三层坑③根源）。
- 其他：`useOPUS()` 无默认 PT 时自动 96+i；`close()` 后 `assertNotClosed()` 使 createAnswer/setRemoteDescription 抛错；answer 方 `transceiver.codecs` 直接采用 offer 方 codec 对象（Chrome Opus=PT 111）并回显，RTP 头 payloadType 是占位、真实 PT 由 sender 覆盖；内建 `replaceRTP`/`freezeRtpContinuityOffsets` 连续性偏移可替代手写 seq/ts 管理（槽位重绑定候选，未启用）。

## 播放链路三层坑（全部破案，勿回退）

① **毒 context（Chromium 死绑定）**：AudioContext 在远程 WebRTC 轨道开始流动之前创建 → 该 context 对该轨道的源节点绑定**永久死掉**——ctx.state=running、振荡器正常渲染（渲染线程活着），唯独该轨道 createMediaStreamSource 恒零；轨道流动后新建 context 立即正常；muted 元素踢、0.01 音量元素踢、死 context 上补建节点均无效（绑定按 context 记，不按节点记）。语音房共享 context 在进房早期（startMicrophone）创建，曾绑死全部槽 → NetEq 只进不出、缓冲溢出全丢（packetsDiscarded≈packetsReceived、totalSamples=0）。**凡「按需创建 context 消费远程 WebRTC 轨道」的代码，都必须门控到轨道流动之后。**

② **放大管道预流动**：持久化音量 >100% 的成员在绑定时刻（轨道流动前）创建增益管道 = 把坑①带回来——管道恒零、元素被静音 → 该槽永久无声且滑条失效（真机 playback-debug 状态表 muted:true + pipeGain 正常 + 包流动钉死）。修法 = 管道创建加 flowed 门控（收到首个 RTP 包才允许建管道，之前钳制走元素路径）（`d9fbb76`）；说话指示同批从 analyser RMS 换成 packetsReceived 增量（audioLevel 电平随音量滑条/静音/VAD 词间停顿漂移，天生不适合当「在传输」信号）。

③ **共享默认流**：werift answer 无 msid → Chrome 把无 msid 的全部下行轨归入**同一个默认 MediaStream**，各槽 `event.streams[0]` 是同一对象，每个元素都在放全部轨的混合：静音/调 0 单元素其余份数照播（音量失效）、总音量 N 份同变（「总音量有效」的假象）、指示灯按 receiver 统计照常（三者并存互不矛盾）。修法 = ontrack 一律 `new MediaStream([event.track])` 逐轨自建流，**禁止直接 attach `event.streams[0]`**（对本项目「裸 recvonly 预开 + werift 应答」SDP 形态是铁律；标准双 offer 场景 msid 正常时不适用）。

教训链：三轮症状（全静音→部分无效→完全无效）是三个独立缺陷的叠加，每修一层才暴露下一层；playback-debug 状态表 + apply 分支日志是逐层剥洋葱的关键。

## 回归不变量

- **上行单增益铁律**（2026-10-14 上行重构）：输入音量只施加在采集图唯一的 gain 上一处（destination 在增益后，WebRTC 上行与兼容 PCM 共享该级）。**禁止再建第二层增益/destination**——旧双层图曾把音量平方（0.5×0.5=0.25）。
- **R/G 上行模式**：降噪关+音量 100%+无伴奏+无麦测试 → 原始轨经 `setUplinkStream` 直连 sender（绕过整个 WebAudio 图，免疫 context 挂起——Newt-Desktop 同款教训「WebAudio Destination 挂起→0 字节上行」）；任一条件成立回 processedStream。切换走 sender.replaceTrack，无重协商。**bypass 条件必须包含 !microphoneTestActive**——麦测试的广播门控靠增益，raw 直连会绕过门控。
- **麦测试不广播**：测试激活期间上行由采集增益静音（MediaRecorder 直接 tap 原始轨，禁止用 track.enabled 门控——那会让测试录到静音）；测试结束恢复用户音量。
- **stopCapture 只拆 PCM 分接（worklet/script/silent），不得动 gain**：transport 每次 start 都调 stopPcm→stopCapture，拆增益会杀死上行音量控制（2026-10-14 单增益化时踩过，测试抓到）。
- **accompaniment getTarget 必须返回稳定同一对象**：模块用 `getTarget() === target` 判自身捕获 vs 被顶替捕获，每次新建对象会把一切捕获当过期取消（2026-10-14 踩过，5 个伴奏测试抓到）。
- **协商完成（answer 应用）前不得向槽位注入 RTP**——Chrome 会把未信令 SSRC 错误关联到已存在 m-section 永久污染。
- `onSlotActivity` 是**电平语义**：active 期间每次轮询（150ms）都上报，靠消费方的自熄 hold（360ms）续命；只报上升沿会让持续说话的成员在 360ms 后熄灯（兼容路径按帧重 mark 不受影响，WebRTC 路径的轮询是唯一心跳）。槽位换人时必须用**旧** clientId 清灯。
- WebRTC pacer 空闲 200ms 停表、入帧即恢复（禁止逐帧门控）。
- 语音路径禁止逐帧持久日志；音频计数走内存诊断快照。
- Firefox 的 WebRTC 输出设备选择降级为默认设备，有意取舍。

## TS 语音数据形态（vendored @echosixhiya/teamspeak-client 0.2.4 与 D:\develop\project\tsweb\teamspeak-js 源码钉死，两边语音路径逐字节一致）

S2C 数据报 = 4B EAX tag + 3B 头（packetID u16BE + typeFlagged：低 nibble 0=Voice 1=Whisper，高 nibble 0x10 Fragmented/0x20 NewProtocol/0x40 Compressed/0x80 Unencrypted）+ 密文；语音包体 = VId u16BE（说话人自序号，SDK 解析后丢弃不透传——将来要核对 TS 侧丢包须先让 SDK 带出）+ CId u16BE + codec u8（4=Opus-Voice 单声道 / 5=Opus-Music 可立体声）+ 裸 Opus 帧（TOC+数据，payload 透传合法性的根据）。SDK handler 对语音不重组不解压（重组与 QuickLZ 解压只属于 Command 路径）、一个数据报只解析一个包、包体≤5 字节（burst 空载荷末包）静默丢、clid 自滤自我回声、setImmediate 异步保序分发。三个「发生即静默劣化」边界：① whisper 与普通语音在 VoiceData 合流（无类型字段，whisper 会被当频道语音转发；包体同构性未真机验证）；② 语音包 Compressed 标志不处理（若发生会把 QLZ 数据当 Opus 帧喂 TOC 解析→计入 droppedFrames；「burst 前 5 包压缩」线索未证实，验证需 SDK 暴露 flags）；③ 多包一数据报会被静默丢（当前服务器实测 4 连帧=4 包无碍，属 SDK 假设非协议保证）。TS=SFU 由此字节级坐实（每包自带说话人 CId，MCU 形态不可能有）；旧 WebSpeak 每频道混流才是 MCU 形态且已删。

## node-sfu（werift 官方示例，本机 D:\develop\project\tsweb\node-sfu）参考结论

官方模式=服务器永远当 offer 方（初始只协商 DataChannel，加媒体由服务器 createOffer 经 DataChannel 发浏览器 answer）；SFU 转发不手写 RTP——发布者 receiver→MediaStreamTrack 对象→订阅者 addTransceiver(track,{direction:"sendonly"}) 由 werift 内部管道搬运。

## 下行静音案全记录（已破案，修复已推送，截至 `4f08c2b`）

- **真机症状**：WS 兼容路径全通（录音放音正常）；WebRTC 下行「刷新后响一声然后永久静音」；Edge 与 Chrome 均无声（同 Chromium 内核，不能区分版本 bug）；webrtc-internals 决定性特征 = packetsReceived 涨 + packetsDiscarded≈packetsReceived + totalSamplesReceived=0 + jitterBufferFlushes 高 + audioLevel=0——NetEq 收包整批丢弃、解码零样本输出。
- **受控实验排除矩阵（全部有声或正常）**：上游静音假说——对方说话时段网关收到并转发的是真实语音帧（toc=0xfc、bytes 243-316；3 字节帧是词间舒适噪声混入日志批次，曾误导——0xfc 的 s 位=1 是立体声声明）；RTP 头构造——seq 连续、timestamp 步进 960；传输/SSRC 归属——浏览器 decode tap 抓到的帧与网关发出字节级一致（连续 25 秒不断）；受控 lab——stereo/mono、真实 TS 节奏（成对突发 210ms 间隙 + 3 字节静音帧混流 + 时间线冻结）、播放图全部有声。实验室元素直连全维度有声且 discarded=0 → 浏览器版本/公网路径/网关 RTP 生成全部出局，根因收敛到页面播放链路（三层坑）。
- **早期调研线索存档（Tavily 子代理）**：toc=0xfc 3 字节 = CELT FB 20ms + s位=1 的数字静音帧（正常语音帧几十到几百字节）；TS6 客户端已知 bug「VAD 卡死常开（说话灯亮但发送静音）」与「采集采样率/位深不匹配致输入全零（改 16bit/48kHz 修复）」——说话人 talking 灯亮≠采到了声音；判别工具 = webrtc-internals 的 totalSamplesReceived（增长即解码正常输出零，坐实上游静音；恒 0 且 jitterBufferFlushes 约每 4 秒 +1 则是 Chrome M149 NetEq 已知 bug issues.webrtc.org/525729347，M148 正常——后被实验室排除）；第三方交叉验证法 = 让 TS 原生客户端确认说话人是否可闻（可闻而网关只见 3 字节帧 → 查网关处理；同样无声 → 说话人采集问题）；槽轨池是 Unified Plan 标准做法（Chrome 单 m-line 多 SSRC 不可行、Plan B 已移除）；公开世界无现成 TS↔WebRTC 每说话人独立流桥（webspeak3/TeaWeb 形态不同）。
- **方法教训**：把怀疑对象的形状搬进实验室逐维复刻，是定位「只在真机某路径发生」类故障的最短路径。

## 诊断基建（保留在仓库）

- 网关出站帧日志：`WEBSPEAK_RTP_DEBUG=1`（首 40 帧 + 1/500 采样）+ 槽位 SSRC 对照表。
- 浏览器 decode tap：`webspeak:rtp-debug=1` + `/rtp-debug-worker.js` 同源 worker（blob worker 被 CSP script-src 拦截的教训）。
- 播放诊断：`localStorage` 设 `webspeak:playback-debug=1` → `window.__webspeakPlayback()` 返回每槽 clientId/streamId/vol/muted/paused/flowed/pipeGain/packets/level + master，及 voiceRoute/setSlotClients/setVolume/apply 分支日志。
- **RTP 隔离实验室** `/_rtp-lab`（`WEBSPEAK_RTP_DEBUG=1` 启用）：浏览器直连网关 werift 播合成 440Hz 音，声道/节奏/停顿策略/播放方式（直连元素 vs Web Audio 图）页面实时切换。实验室修复（已推送）：`get closed()` 是访问即 `peer.close()` 的自杀 getter——mount 层一注册就杀会话，werift 对已 close 的 peer 在 createAnswer/setRemoteDescription 首步 assertNotClosed 抛错 → 所有 offer 500；改被动生命周期 Promise（failed/closed 终态即 resolve，disconnected 超 10s 收割并关 peer）。m-line 形状见 werift 机制节。「停止」原只停 20/140 词间窗口（86% 时间照发）→ 加 pacing:"stopped" 真停。另修 /_rtp-lab/offer 400：isSessionDescription 校验完整描述对象 {type,sdp} 而路由曾传裸 SDP 字符串；页面改「开始连接」手势驱动（AudioContext 需 sticky activation）并向浏览器注入生产同款 STUN（`1a6d6ae`：必须复用生产 ICE 配置——容器端口映射只暴露生产 UDP 段，默认随机端口不可达即「webrtc-internals 无流」）。实验室 getStats 的 audioLevel=0 是 werift 不发 audio-level RTP 头扩展所致，非故障。

## 已排除方向（复现勿重查）

- 成员音量链路每一环均被真机日志证明工作：voiceRoute 到达 → setSlotClients → refreshSpeakerVolume matched → element.volume=0 已执行。
- UI 事件链 volumeInput→onVolInput→setVolume 完整。
- TS clid 与 member.id 同域（兼容路径音量正常为证）。
- 浏览器版本/公网路径/网关 RTP 生成（实验室元素直连全维度有声为证）。

## 若音量/说话指示问题复现

先跑 `__webspeakPlayback()` 看各槽 streamId 是否互异、clientId 是否绑定、flowed/pipeGain 数值，再看 apply 分支日志的 element/pipe 值——先判「声源是否在元素」，再谈其余。

待复测清单：共享流修复（逐轨自建 MediaStream）部署后——静音成员立即无声、50%/150% 立即可闻、持续说话指示灯常亮、行内/右键菜单 % 跟随、`__webspeakPlayback()` 各槽 streamId 互异且 clientId 绑定正确；e551a1a 部署后——双向语音（重点：两个 WebSpeak 端互听——双方上行都断会造成「双向静音」的感知，单 bug 即可解释全部症状）、stereo 伴奏多轨同放、多说话人并发、成员音量滑条即时生效、性能面板转发/丢弃/活跃槽位计数。

## 探针与测试备忘

- werift↔werift 的 ICE 在本机沙箱永卡 connecting——双 werift 探针不可用于媒体层验证；Chrome↔werift 正常。
- CJS 包 `await import()` 的具名导出可能是 undefined 须走 `m.default`（曾致 lab 发裸 PCM 的假静音）。
- 多轨链路已真 Chrome 端到端验证有声：本地 lab werift 多轨 sender→Chrome insertable-streams 抓包确认 Opus 帧原样到达（TOC 0xf8）→ analyserRMS 0.196 / audioLevel 0.32。落地时测试基线 568；测试 window stub 需 setInterval/clearInterval。
- 兼容路径（WS 回退）上行编码仍是 `opus-codec.ts` 24kbps/VOIP/FEC10%（低 CPU 回退定位，未提码）；麦克风约束 `microphoneConstraints()`=AEC on+Chrome NS on+AGC off 未动；浏览器直连 TS 协议已否决。
