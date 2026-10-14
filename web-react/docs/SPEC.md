# WebSpeak 前端行为规格（React 重构基线）

> 版本：2026-10-14（Phase 0 产出；同日第二增量完成 §18 全部采证并新增 8 个 characterization 测试）
> 事实源与可信度：本文只收录三类证据——① 既有测试断言（带 file:line）；② 运行时解析器/校验器代码（带 file:line）；③ 三份主题笔记（CLAUDE.md / .agents/notes/voice.md / decisions.md）中经代码或测试印证的条款。**代码注释与历史文档不作为依据**；与代码冲突处以代码为准并回写本文。
> 用法：Phase 4 每页迁移的平价验收清单以本文对应章节为准；行为改动先改本文（spec 先行）。

---

## 0. 文档规则

- 行为条目默认标记「平价复刻」；标记「待采证」的条目没有测试锁定，迁移时先从实现源码核对并在真机确认。
- 「怪癖不随迁」条目（§19）是唯一允许与现版行为不同的地方，且必须逐条登记。
- 测试引用格式 `voice-session.test.mjs:123` 均指 `web/test/` 或 `web/src/` 下文件。

---

## 1. 应用壳与路由

- 4 条路由：`/`、`/join` → WebClient；`/download` → DownloadView；`/admin/*` → AdminView。`html[data-ws-route]` ∈ {webclient, download, admin}，由路由切换副作用设置（`main.ts:39-41`）——CSS 文档级门控依赖它，React 版等价实现（路由 effect 写 `document.documentElement.dataset.wsRoute`）。
- UI 缩放：以 1920×1080 为基准，视口更大时放大 `--ui-scale`（上限 1.5），挂 resize 监听（`main.ts:6-23`）；`.web-client/.join-page/.app-shell` 高度 `calc(100dvh / var(--ui-scale))`。
- 主题：`webspeak:theme` ∈ light/dark/system，system 跟随 `prefers-color-scheme`；同步 `meta[theme-color]` 与 `color-scheme`。
- WebClient 两态：`voiceShellVisible = connected || reconnecting || reconnectFailed || favoriteSwitchActive`；根元素 `data-ws-page="home"|"voice"`。
- 全局弹窗/通知放模板根部（两态分支之外）：成员菜单、频道密码、服务器密码、音频设置、收藏对话框、服务器右键菜单、皮肤恢复/目录通知、toast。**红线（decisions.md）**：带 backdrop-filter/transform 的元素是 fixed 后代的包含块，fixed 浮层不得挂其子树内；Teleport 目标用 `.web-client` 根而非 body（皮肤选择器与 z 阶梯变量都挂在 `.web-client` 上）。
- **模态框只经按钮/Esc 关闭，不响应 backdrop 点击**（decisions.md 硬规则）。

## 2. 连接与会话生命周期

### 2.1 join 两段式
- `POST /api/join-ticket`，body `{target, channel, nickname, serverPassword, identity, rememberIdentity}`（`voice-session.test.mjs:920`）；重连时 body 为 `{reconnect: reconnectTicket}`。响应 `{ticket}` 或 `{code, detail?, retryAfterMs?}`。
- 之后开 WS `ws(s)://<host>/ws/voice?ticket=<ticket>`，`binaryType="arraybuffer"`。文本帧=JSON 控制消息；二进制帧=音频（4 字节头：codec + clientId 大端 2 字节）。
- **join deadline 15s** 覆盖请求与 `response.json()`；触发后 abort、`errorCode="REQUEST_TIMEOUT"`、迟到 ticket 不得开 socket（:930-952, :996-1016）。

### 2.2 替换/竞态失效总则（贯穿全链路的第一不变量）
新 connect/disconnect 使一切在途异步按「会话代」失效：旧 join 的响应体一个字节都不读（:907-928）；旧 socket 的迟到 onmessage/onclose/ack/音频帧全部失效（:1018-1051, :2102-2110）；旧命令 ack 不能结算新 socket 的命令（requestId 按 socket 作用域隔离，:862-889）。**迁移时每个异步步骤都必须校验会话代。**

### 2.3 重连
- `connected.reconnectTicket` → sessionStorage `webspeak:voice-session` 写恢复意图；`close(1006)` → `reconnecting=true`。
- 退避表 **[1s,2s,4s,8s,15s] 共 5 次**（`useVoiceWebSocket.ts:166-167`）；耗尽 → `reconnectFailed=true`、`errorCode=connectionFailureCode="GATEWAY_NETWORK_LOST"`、**删除恢复意图**（:2739-2765）。
- 关闭码映射：4004→SERVER_REJECTED、4005→IDENTITY_IN_USE；`onerror` 本身不产生错误码，gateway close reason 优先（:1018-1029）。
- 同 socket 恢复（`disconnected{recoverable}` → `connected`）：目录清空重置、事件/poke 清空，**聊天历史保留**；恢复期间不能发送（:443-454, :683-701）。

### 2.4 命令模型
- 应答式命令带 `requestId`（`command-<base36>-<序号>`），**8s 超时**（"操作超时"）；断开后发命令 reject "语音连接已关闭"；ack 幂等（重复 ack 只结算一次）；send 同步抛错 → 立即 reject 并释放定时器（:837-889）。
- fire-and-forget 命令保持现有线协议（CLAUDE.md §命令）。
- `switchChannel` 由服务端 `channelSwitched{requestId,channelId}` 结算（:2375-2390）；失败回滚本地乐观状态，错误对象带 `code`。

### 2.5 断开清理（顺序容错）
任一环节抛错不得阻断其余：mic test 停 → 伴音释放 → peer close → 播放 pause/元素移除 → meter/mix 节点断开 → 定时器清空 → socket handlers 置 null（:1313-1323, :1548-1573, :1031-1042）。异常断开（close 1006）同时释放屏幕共享 track 与 pending 命令（:1053-1069）。

## 3. 目录 / 成员 / 头像

- `connected` 携带初始 members；`channelList` 全量只在连接/恢复后出现且**原地更新**（members/channels 引用不变）；换 snapshot 不丢用户音量 `volumes[uid]`，但 **uid 被复用给新成员时不得继承旧音量**（:286-310）。
- `memberUpdated` 必须**原地 patch 同一对象**（引用相等断言 :365）；`memberLeave` 同时清 members、频道投影、volumes、whisper 目标并把 whisperActive 归 false（:328-340）。
- `channelList` 缺 members 数组 = 保留已知成员（不是清空）；非法目录（字段类型错）整条拒绝且不破坏合法状态（:342-354, :1085-1090）。
- 自己被 TS 侧强制移动（`memberMoved` id===self 且带 channelId）→ `selfMovedChannelId`（:373-386）。
- serverEvent 日志与聊天历史上限均 **500 条裁头留尾**；poke ≤20（协议报告 §2.2）。
- 频道树构建（useWebClientChannels）：迭代式遍历（5000 层深不栈溢出）、兄弟按 order 排序、自环/互环/孤儿/重复 id 输出有限去重树、孤儿提升为根（:768-789；CLAUDE.md 禁止递归遍历与整树丢弃）。
- 头像（decisions.md 硬规则）：交付=无账本 URL 快照，`attachAvatars`（snapshot 全集+重试排期），**禁止「谁已见过哪些字节」记账状态**；URL 是 HMAC capability（`/avatars/<aid>?v=<内容hash>`，URL 即凭证、无时效、跨刷新字节稳定——勿加时效签名）；404 不入前端状态（保持首字母回落）；前端 LRU 200，`new Image()` 探测成功才入状态（协议报告 §2.4；session-state.ts:31-69）；avatar 缓存跨重连存活、按 uid 键控暖缓存（:412-425）。

## 4. 聊天

- **ack 确认制**：发送后不立即写历史（带 requestId）；收到回显 `chatMessage` + `commandCompleted` 才落库；`error{code}` → reject 不落库（:561-578）。未连接/重连中发送 reject 且不发命令（:550-559）。超时不证明未送达（CLAUDE.md）。
- 滚动跟随四规则（:491-548）：不在底部不滚；自己消息强制滚底；切 tab 立即滚底；移动端隐藏时不滚、显示后补滚；clientHeight=0 的滚动事件忽略。
- 草稿与竞态（:591-664）：pending 重复点击合流；失败保留草稿 + `sendError`；成功只清「提交后未被修改」的草稿；会话更替后旧提交不得清/改新会话状态。
- 私聊按 **uid 会话键**（`memberConversationKey`），防数字 ID 复用串话；无 uid 遗留成员用成员生命周期作用域；payload 带 `clientUid`（:632-759）。
- 换服务器：privateClientId 归零、tab 回 channel、草稿清空（:617-630）。
- **聊天=降噪流**（decisions.md 硬规则）：无气泡、自己消息左对齐、作者 11px/600 muted、时间 10px、正文 13px/1.55。

## 5. 语音链路

### 5.1 采集与上行
- 约束默认（:2447-2465；decisions.md 拍板）：`echoCancellation:false, autoGainControl:false, noiseSuppression:true`——**增加延迟的处理默认关**；三开关经约束重配+偏好持久化，勿静默回退默认。
- **上行单增益铁律**（voice.md）：输入音量只施加在采集图唯一 gain 上；增益恰一次禁止平方（:2392-2397 断言 0.5→gain 0.5 非二层）。
- **R/G 模式**：降噪关+音量 100%+无伴奏+无麦测试 → 原始轨直连 sender（bypass 条件必须含 `!microphoneTestActive`）；否则 processedStream；切换走 replaceTrack 无重协商（:2399-2411）。
- 麦克风测试经增益门控广播（raw track 保持 enabled 供录制；禁止 track.enabled 门控——会录到静音，:2413-2432）。
- 兼容路径：48kHz mono、960 样本 20ms 帧、1920 字节 Int16；AudioWorklet（`/mic-capture-worklet.js`）优先、构造抛错回退 ScriptProcessor；worklet 加载 pending 期间旧图继续发帧；`stopCapture` 只拆 PCM 分接不动 gain（voice.md 红线；:2650-2572）。

### 5.2 WebRTC 传输
- offer 预开 1 条上行 + **16 条 recvonly 下行槽** transceiver（DOWNSTREAM_SLOTS=16）；answer 应用后 sender `setParameters` **maxBitrate=60000**（encodings 为空先补种子，:1850-1867）。
- 协商/track 失败 → 兼容回退：peer closed、`audioNoticeCode="WEBRTC_FALLBACK"`、**不得误报麦克风错误**、发一次 webrtcStop（连发送失败都吞掉）、PCM 不断流（:1824-1848, :1638-1653）。
- STUN：`connected.webRtcStunServer` 归一化后进 `iceServers`；不带则 `[]`（:2704-2714）。
- 迟到的旧 peer answer/stats/ontrack/connectionState 一律失效，不得影响新 peer（:1496-1532）。
- **协商完成前不得向槽位注入 RTP**（voice.md：Chrome 未信令 SSRC 关联污染）。

### 5.3 兼容播放（WS PCM）
- 每说话人 decoder+gain+source 一套资源；**80ms 播放窗口（4×20ms 块）**，第 5 块溢出 → decoder 重建全清；同说话人 `decodeQueueSize>0` 再来帧 → 过载重建 decoder、旧 gain 断开（:1977-2100）。
- gain = 成员音量×输出音量；静音/过载重建保持静音态与音量精确恢复（:2064-2083）。
- decoder 失败/codec 配置失败/source start 失败：各自释放局部资源，下一帧可重建（:2002-2044）；成员离开只释放自己的播放（:2046-2062）。

### 5.4 WebRTC 播放与说话指示
- 元素池：每槽隐藏 `<audio>` 直连远端流；**ontrack 一律 `new MediaStream([event.track])` 逐轨自建流，禁止 attach `event.streams[0]`**（voice.md 三层坑③铁律；测试基建注释同样钉死 :193-195）。
- 音量：master ≤0 → muted；成员+总音量 ≤100% 走 `element.volume`（钳 1）；**>100% 走惰性增益管道，flowed 门控**（收到首个 RTP 包才建管道，之前钳在元素，:1878-1903——毒 context/预流动两层坑的防回归断言）。
- 说话指示是**三层模型**（口径冲突已采证解决；voice-session:1905-1943 与 speaking-state.ts、webrtc-playback.ts:60-63 互证）：① 播放层每槽 **150ms 轮询** `receiver.getStats().packetsReceived` 增量刷新 `lastAudioAt`，槽活跃判定 = 距最后音频 **<1200ms hangover**；② `onSlotActivity` → `speaking-state`：active 时 `markSpeaking` 刷新每客户端 **360ms 防闪烁 hold**，无新标记 360ms 即熄灭（clearSpeaking 立即生效）；③ 兼容路径自己的徽标 = 麦克风电平表 RMS ≥ voxThreshold（§5.8）。三层各司其职，迁移时不可合并成单层。
- autoplay 被挡 → pointerdown/keydown 重试，合并并发手势为一次 in-flight play；旧会话 retry 回调对新会话无效（:1591-1636）。
- WebRTC pacer 空闲 200ms 停表、入帧即恢复（禁止逐帧门控，voice.md）。

### 5.5 伴奏（系统声音混入上行）
- getDisplayMedia 参数：音轨 `{autoGainControl:false, echoCancellation:false, noiseSuppression:false, restrictOwnAudio:true}`、`selfBrowserSurface:"exclude"`、`systemAudio:"include"`、`windowAudio:"window"`；`contentHint="music"`；纯视频流拒绝（`noAudio`）（:1344-1368）。
- 资源纪律：被顶替/取消/断开的迟到捕获一律 stop 自己、不碰现役流；准备期 ended 不发布 active；分配失败保留现役麦克风 sender、不发 setAccompanimentActive；**accompaniment getTarget 必须返回稳定同一对象**（voice.md 红线）；contentHint 失败可忽略（:1124-1311）。
- 错误分型五语言：权限拒绝 vs AudioContext 分配失败（`accompanimentAudioFailed`，:1325-1342）。
- 伴音绕过麦克风增益/降噪、保持源电平；不干扰麦克风静音与 gain（CLAUDE.md；:1344-1385）。

### 5.6 麦克风测试
- **5s 硬超时**（:2202-2213）；正常结束发布 blob URL；断开/替换丢弃迟到结果并 revoke；连接中停止测试只发布录音、房间采集与连接保持（:2112-2200）。

### 5.7 设备管理（竞态总则：最新选择赢、失败回滚到最后已提交设备、旧请求失效不污染）
- 持久化键 `webspeak:input-device` / `webspeak:output-device`；并发切换旧请求迟到失败不回滚新选择（:2232-2289）。
- 切麦成功（WebRTC 模式）= 旧 peer closed + 新 peer 重发 offer + 持久化；切换失败 → peer 存活、原 track live、选中/存储/降噪开关回滚到已提交值（:2247-2259, :2312-2342, :2716-2724）。
- 输出：setSinkId 按端点串行化；并发乱序完成时最终 sink=最新设备；失败回退 "default" + `audioNoticeCode="OUTPUT_DEVICE_UNAVAILABLE"` + 存储清空（:2276-2373）。
- 设备消失 → 走正常切换事务重建（默认设备失败保留原偏好并报错）（:2607-2648）。
- 切麦 pending 期间改降噪 → 以实际拿到的设备提交（:2467-2482）；pending/失败期间兼容 PCM 不断流（:2492-2550）。

### 5.8 电平表、静噪与通知音
- 512 样本 analyser、**50ms 轮询**、增益换算、封顶 1；读失败只停表清零（`micLevel=0`），会话不死（:1480-1494）。
- `voxThreshold`（默认 0.008，钳 [0.001, 0.08]，IndexedDB 偏好持久化）：兼容路径**自己**的说话徽标静噪门控——`rms ≥ voxThreshold && !muted && track.enabled → markSpeaking(self)`，否则清（useVoiceWebSocket.ts:267, :330, :436）。
- 通知音（`playNotification`，useVoiceWebSocket.ts:961-988）：五种双音 connected 660/880 · disconnected 440/330 · poke 740/980 · private 600/760 · reconnectFailed 300/220（Hz）；增益峰值 = `notificationVolume × effectiveOutputVolume × 0.12`，0.2s 指数包络；输出静音/零音量/context 挂起时跳过；best-effort 永不影响会话。`notificationVolume` 默认 0.5、钳 [0,1]、持久化。poke 横幅最多显示 3 条、9s 自动消失（WebClient.vue:1598, :1630-1633）。

## 6. 性能诊断面板
- 仅面板打开时轮询，**间隔恰 2000ms**，打开立即探测一次；`sample()` 探针 = `audioStatsProbe{sequence}` + peer.getStats 结合。
- 速率只对匹配 scopeId（peer/传输/会话代）与传输类型做差值；跨传输/缺 RTP stats/旧 scope 迟到样本一律不算；null/失败探针清活动重建基线（voice-performance.test.mjs 全文）。
- 丢包率：上行 = lost/sent；下行 = lost/(received+lost)，百分比有界（:203-210）。
- unmount 退役 pending 结果/定时器/手动 refresh（:169-185）。

## 7. 屏幕共享
- 开流程：`screenShareStart{requestId,name?,audio?}` → `screenShareStarted{stream,owner?}`（requestId 不匹配=过期自动 stop）；观看端 `screenShareJoined` → viewer peer；信令 `screenShareSignal`（offer/answer/iceCandidate/close）。
- 分辨率缩放：`scaleResolutionDownBy = 1920/maxWidth`（:104-119，screen-share.test.ts）。
- 共享设置三预设（characterization 已钉，screen-share-ui.test.mjs）：分辨率 source/720p/1080p（**默认 1080p**）、帧率 [5,10,15,24,30,60]（**默认 15**）、码率 auto/1.5/3/5/8/12 Mbps（**默认 auto=不限**）；`startWithSettings` 提交 `[true, {maxWidth?, maxHeight?, maxFrameRate, maxBitrate?}]` 并把三项持久化到 `webspeak:screen-share-resolution/-framerate/-bitrate`；损坏存储值回退默认。
- 播放端 `<video>` 是独立输出端点：跟随所选输出设备 `setSinkId`（失败静默回退默认）；观看者头像列表显示最后 5 位（useWebClientScreenShare.ts:81, :155-165）。
- 无视频轨的捕获结果全 track stop；ICE 配置每控制器独立。
- 属主匹配：已知 ownerClientId/ownerPeerId 绝不按昵称回退（防同昵称串流）；legacy `ownerPeerId="unknown"` 才按昵称（screen-share-ui.test.mjs:64-74）。
- 播放器：video 绑定显式元素回调、换元素重绑并清旧元素、presentation 清理不停 owner track；全屏需非空 player、移除只退出自己的全屏；音量同步。
- 权限迟到（socket 已关）→ track 立即 stop、不发 start（voice-session.test.mjs:1071-1083）。

## 8. 切服 / 收藏 / 连接表单
- **收藏模型（decisions.md 拍板）**：列表只显示收藏——连接即收藏、取消收藏即移除，无「最近」概念；记住密码常开（无勾选框）；密码只存 IndexedDB 收藏记录。
- 桌面=壳层最左 58px 图标 rail（active 左缘胶囊+密码角标）；移动=顶部 chips 行（channels/more tab 常驻）。
- 切服横幅状态机（voice-server-switch.test.mjs）：`begin(name)/settle()/fail()`；`SERVER_PASSWORD_REQUIRED`/`INVALID_SERVER_PASSWORD` 保持 pending（弹密码框不算失败）；`IDENTITY_REJECTED` → failed；**20s 安全定时器**兜底；settle 后迟到 fail 无效。
- 语音内切不同服务器=显式离开（内部 1000 → teardown，不进 detached 池）；同目标换频道走 switchChannel（decisions.md）。
- 地址表单（connection-dialogs.test.mjs）：粘贴 MyTeamsSpeak 链接 → 解析目标名并清端口预填；自定义端口保留；`suggestedTeamSpeakPort` 只在地址类型变化时清预填（teamspeak-target.test.ts:48-54）。target 拆合/IPv6/lookup URL/hash 端口语义见 teamspeak-target.test.ts。
- 频道密码对话框：submitting 防重入；普通错误（如 COMMAND_TIMEOUT）保持开、密码草稿保留、可重试；`channelSwitched` → 整个重置关闭（:47-74）。
- **fixed 模式**：免密直进唯一密码权威是服务端注入（`policy.serverPassword`），客户端不得上送本地表单密码覆盖；前端拿到的 target 是空占位（decisions.md 安全审查结论）。
- 频道折叠：按服务器持久化 `webspeak:channel-folds:<serverKey>`；损坏 JSON → 全展开；频道树**单击选中、双击/回车加入**（decisions.md KAAK 不变量）。

## 9. 身份
- 导入：128 KiB 上限（超限同时退役上一选择且不读文件内容）；UTF-8/UTF-16LE/BE BOM；错误码 empty/multiple/malformed/too-large/invalid-key；INI 与官方格式互操作（identity-import.test.ts）。
- 全程「只有最新动作生效」：文件读取/parse/导出/启动恢复都被新动作/关闭/卸载/reset 退役且无副作用；parse 失败保留草稿可重试（identity-dialog.test.mjs）。
- 导出：合并并发点击；`webspeak-identity.ini`；1s 后 revoke URL；click 抛错仍释放 URL 并 toast；**关闭「记住身份」取消在途导出**。
- 启动恢复不覆盖更新的导入/remember 偏好。
- 昵称 INI 转义：`\x` 十六进制、`\`→`\x5c`、`"`→`\x22`、代理对、空昵称 `nickname=`。

## 10. 皮肤与主题（已拍板：契约重置，见 DECISIONS.md #2）
- 内置亮/暗双皮肤（`builtin.light`/`builtin.dark`）以主题形式保留；激活=设 `data-theme`+`data-ws-skin`+注入 `<style>`；退役 id（community.illusia-voice）继续拒绝。
- 生命周期（skin-lifecycle.test.mjs）：**持久化只属于最后被选中的皮肤**（输掉竞态不写）；迟到失败不回退新选择；AbortSignal 贯穿；本地读取/目录/包下载各有 deadline（统一 TimeoutError，迟到结果不安装）；目录失败本地已装包仍可用；目录永不响应首绘不阻塞（skinReady=true、builtin.light）；持久化自定义选择包挂起 → 首绘回退但**保留**选择键供重试；手动选择胜过未完成初始化；实例默认皮肤不得覆盖用户主题偏好、不写 `webspeak:skin-choice`；DOM 安装失败 revoke 候选资产 URL 并回退。
- 公开目录：始终含两个内建且排最前；仅暴露 enabled；无效/禁用 default 回退 builtin.light；旧目录响应不能覆盖新响应。
- 主题切换与自定义皮肤互斥（**已采证 + characterization 测试钉死**，theme.ts:50-55）：`applyTheme` 遍历 `.ws-skin-root`，`preserveCustomSkins:true` 时跳过非内置皮肤的 `data-ws-skin` 改写。调用点语义：用户选内置皮肤 → 不 preserve（外观交回内置）；选自定义皮肤 → preserve（否则切主题会把自定义打回内置，usePublicSkin.ts:63）；**系统主题跟随监听器恒 preserve**（OS 翻转夜间模式不得偷走自定义皮肤，theme.ts:90）；`reset()` 不 preserve（重置回内置）。皮肤包字节级上限（skin-pack.ts:11-15）：包 20MB / CSS 512KB / content 256KB / 单图 16MB / 单字体 4MB；可选淡出部件白名单 11 项（skin-pack.ts:33-45，`voice.member.live-indicator` 等交互控件不在册）。
- skin-pack 编译契约（.wskin 运行时若按期迁移则继续成立；扫描测试 TSX 化）：`:root`→`.ws-skin-root[data-ws-skin="<id>"]` 前缀；keyframes/font-family 加 `ws-<id>-` 命名空间；资源→`wskin-asset:`→blob:；自定义属性必须 `--skin-` 前缀；**布局属性拒绝清单**（display/position/inset/z-index/padding/transform/font-size/line-height/white-space/text-transform/后代选择器 display/变量间接 display/all:unset）；控件隐藏仅限 OPTIONAL_VISUAL_PARTS 白名单；外部资源拒绝（`SKIN_EXTERNAL_RESOURCE`）。字节级资源上限（20MB 包/512KB CSS 等）在 skin-pack.ts 源码、无测试锁定 → 待采证。
- admin 视图/组件不得含 `ws-skin-root`/`data-ws-page=`（契约测试钉死）。
- 皮肤/语言切换器：桌面 rail 58×58 tile 变体、下拉 fixed 贴瓦片右侧（rail 是 overflow 裁剪容器）；移动首页**常驻 header 行**（decisions.md）；下拉钳制必须四边含裁剪祖先（`overflow-y≠visible ⇒ overflow-x 连带非 visible`，视口∩祖先取最紧，decisions.md）。
- **pointerdown 激活即卸载的浮层必须吞掉手势尾随 click**（一次性捕获守卫；decisions.md 实案：更多面板切语言误触退出断连）；danger 动作与浮层覆盖区空间隔离。

## 11. i18n
- 五语言（zh/en/de/ru/ja），**zh 为编辑基准**；web-client 每语言 **364 键**、admin 每语言 **236 键**（2026-10-14 实测）；平价测试=包含校验（de/ru/ja 经 en spread 合法超集）+ 规模护栏（>300 / >100）。
- `t()`：`lang→en→zh→key` 兜底链 + `{{name}}` 变量替换（单括号不替换）。
- 服务端错误本地化（`localizedMessage`）：中文服务端文案精确映射 + 错误码重组 de/ru 句子（useWebClientI18n.ts:13-60+）；join 超时等五语言文案有断言（:983-994, :721-727, :1325-1342）。
- admin 另有 session/connection/event/error 四张「码→翻译键」映射表 + Intl.DateTimeFormat 本地化。

## 12. 管理台
- 状态机 `loading → login | change-password | admin`；登录成功存 csrfToken（**仅内存，不落 localStorage**）；`GET /session` 探测（authenticated 且 mustChangePassword=false → 控制台）。
- **401 双轨**：当前会话 401 → 页面重置为 login、清密码/diagnostics/spinner/error、路由 /admin/login；旧会话（已被替换）的 401 或迟到成功 → `REQUEST_CANCELLED`，不得登出新会话（admin-api.test.ts:14-24, :160-165；admin-view.test.mjs:300-326）。
- 代际语义：`invalidate()`（登出/401/重新登录）后所有在飞请求以 `REQUEST_CANCELLED` 收场（signal abort/代际变/csrf 变三重断言）；CSRF 在**调用时**读当前 token 写 `x-csrf-token`（仅非 GET 且 authenticated）；login 不带 CSRF。
- 网络错误统一 `AdminApiError("REQUEST_FAILED")` 不泄漏底层文本；响应残缺 → `INVALID_ADMIN_RESPONSE`；校验器只投影声明字段（服务端新增字段不进前端状态）。
- 表单语义（admin-view.test.mjs）：保存挂起期间的编辑在响应后保留（服务端确认字段如 hasPassword 仍合并）；保存成功清已提交密码、`passwordAction` 回 "keep"；重复保存只发一次；失败保留草稿+错误；探测挂起期间改地址丢弃旧结果；只有最新探测发布；设置响应不得回填过期探测元数据、不得覆盖更新探测。
- 运营页：旧 refresh 响应/失败不得覆盖新快照或清新 spinner；离开管理区块丢弃 pending 读、返回重新拉取；卸载后迟到登录不导航、迟到备份不下载。
- 皮肤管理：mutation 串行化（重复点击只发一次）；失败回滚到最后已保存 default；loadSkinCatalog 挂起期间的默认皮肤编辑保留。
- 登出：失败保留认证态与草稿；成功 → login + 清 csrfToken/私有状态 + 路由 /admin/login。
- 强制改密流（**已采证 + characterization 测试钉死**，AdminView.vue:503-506, :513-544）：`session.mustChangePassword=true` → screen=change-password + 路由 `/admin/change-password`，**不加载管理数据**；登录结果 mustChangePassword=true 同样迁移且密码字段照常清空；改密本地校验先行（<12 位 / 两次不一致，不发请求），提交 body `{newPassword}` 恰一次，成功后清字段 + screen=admin + 路由 `/admin` + 加载管理数据。
- 登录失败（INVALID_PASSWORD 等）：保持 login 屏、submitting 复位、csrfToken 不变、错误可见。
- `GET /api/admin/diagnostics/report` 由「运营」页以**普通链接**直下（AdminOperations.vue:91，无 admin-api 封装）；`GET /status` 前端无消费者——重构默认不对齐这两个端点的 UI 封装。
- 布局：`admin-shell` grid `236px|1fr`、html/body 钉 100dvh、admin-main 唯一滚动容器；≤850 转单列+顶部 nav 条（44px 触达）；三态 UI 见 §17.4。

## 13. 移动端
- **手机门**（mobile-gate.test.ts）：UA（Android Mobile/iPhone/iPod，平板豁免）+ `pointer:coarse` + ≤740 + 无 `webspeak:mobile-gate=continue` → 拦截页（下载引导 + 「仍要继续」）；continue 永久放行。
- **tab 模型**（≤740）：`mobileSection: channels|chat|voice|more`（默认 channels）→ `.mobile-view-*` 根类；底部 nav 为 in-flow flex 行（order 3）。
- **软键盘**（mobile-viewport.test.ts）：visualViewport 跟踪，keyboardOpen = 焦点在编辑元素且高度差 >120px（捏合缩放/旋转不误判）；事件合并单 rAF；注入 `--ws-viewport-height/--ws-viewport-top` + `.keyboard-open` 类。
- 输入类字号 16px 防 iOS 聚焦缩放；`h-dvh` 布局；44px 触达。
- 页面隐藏自动 away（仅移动端）、回前台恢复、手动 away 有所有权、重连后重新施加（mobile-away.test.ts）。
- 长按右键菜单（useLongPressContextMenu.test.ts）：仅 touch（mouse 忽略）、slop 5px、按时打开带坐标、打开后吞一次 click、cancel 不吞、原生 contextmenu 同管道。
- **移动端代码不得整体删除**（decisions.md：自研安卓端稳定上架前只做引导页+逃生口）。

## 14. 协议面要点（权威=`src/shared/` 源码与测试，此处列行为要点）
- `parseServerMessage`：返回 null=丢弃不抛错；**未知 type 静默忽略**；已知消息保留未知额外字段；requestId 非法整条 null；六类消息有归一化投影（stun/ICE 归一、stats 补零、stream 投影、chat 截断 2000/名字 128）。
- 关键校验原语：clientId 整数 1..65535；channelId `/^\d{1,20}$/` 或安全整数；avatarUrl 必须匹配 `/^\/avatars\/[A-Za-z0-9_-]{8,64}(\?v=...)?$/`。
- 客户端命令 13 种 + 屏幕共享 6 种 + WebRTC 2 种，字段约束逐条见 `src/shared/client-commands.ts` / `screen-share.ts` / `webrtc.ts`（出站预裁剪：chat 500、poke/away 200）。
- `latencyProbe`/`latencyPong`：声明但前端未用——解析器白名单必须保留，UI 可不接。
- 管理台 REST 20 端点、字段投影清单见 `src/shared/admin-responses.ts`（session 有 authenticated↔csrfToken 联合约束）；`x-csrf-token` 规则见 §12。
- 二进制音频帧：类型 4=mono / 5=stereo（stereo=伴奏）。

## 15. 存储契约（冻结：新版必须原样读写）
localStorage（`webspeak:` 前缀零例外，2026-10-14 扫描实测 18 键）：

| 键 | 语义 |
| --- | --- |
| `webspeak:language` | 界面语言 |
| `webspeak:theme` | light/dark/system |
| `webspeak:active-skin` | 已激活皮肤 id（skin-runtime） |
| `webspeak:skin-choice` | 公开页用户皮肤选择（应用成功才写；目录不可用删除） |
| `webspeak:mobile-gate` | 手机门 continue 放行 |
| `webspeak:input-device` / `webspeak:output-device` | 设备选择（失败回滚语义见 §5.7） |
| `webspeak:playback-debug` | 播放诊断（"1"） |
| `webspeak:rtp-debug` | RTP debug worker 开关 |
| `webspeak:screen-share-resolution` / `-framerate` / `-bitrate` | 共享参数记忆 |
| `webspeak:desktop-notifications` | 桌面通知开关 |
| `webspeak:nickname` | 昵称记忆 |
| `webspeak:remember-identity` | "0"/"1" |
| `webspeak:chat-collapsed` | 聊天折叠 |
| `webspeak:channel-folds:<serverKey>` | 每服务器折叠集合 |

- sessionStorage：`webspeak:voice-session` = 恢复意图 `{reconnectToken ≤128, savedAt:number}`（解析器拒绝畸形/超长——session-intent.test.ts）。
- IndexedDB `webspeak-local` v4：身份（key `current`）、偏好（读-合并-写单事务）、已装皮肤、聊天历史（每会话 ≤200）；**请求成功≠持久化完成，事务 commit 才算**（local-persistence.test.ts）。
- 清除本地数据=按 `webspeak:` 前缀扫描清扫（禁止枚举清单——新键逃逸教训）；三键名钉死：`webspeak:voice-session`、`webspeak:mobile-gate`、`webspeak:desktop-notifications`（storage-namespace.test.mjs）。
- storage-namespace 静态扫描规则 React 版必须等价重建：全源码 storage 调用点键必须带前缀。

## 16. 语音生命周期不变量红线（全量带出处，迁移评审逐条过）
1. 替换/失效总则（§2.2）适用于一切异步：媒体权限、约束、枚举、probe、信令、ack。
2. 断开清理顺序容错（§2.5）——单一资源释放失败不阻断其余。
3. ontrack 逐轨自建流（§5.4）；毒 context 门控（远程轨流动后才可创建消费它的 context）；>100% 音量管道 flowed 门控。
4. 上行单增益；R/G bypass 含 `!microphoneTestActive`；麦测试增益门控；stopCapture 不动 gain。
5. accompaniment getTarget 稳定身份；协商完成前不注 RTP；槽位换人用旧 clientId 清灯；`onSlotActivity` 是电平语义靠消费方 hold 续命。
6. pacer 空闲 200ms 停表；语音路径禁止逐帧持久日志；音频计数走内存诊断快照。
7. 目录/chat/事件/poke 数组保持响应式身份（引用不变原地更新）；成员 uid 复用不继承旧音量/私聊历史/播放。
8. 音频诊断 probe 绑 socket+代+peer，deadline 后迟到结果合并为 null；scopeId 内部元数据不入协议。
9. Firefox WebRTC 输出设备选择降级默认设备=有意取舍。

## 17. 布局规格（结构不放开，视觉放开）
### 17.1 有效几何（注意：现 CSS 有被级联覆盖的死规则——06-responsive-1 的四列模板已被 07/11 覆写为死代码，React 版只按本节实现）
- **≥981**：grid 4 列 `86px(rail) 304px(频道/成员) minmax(280px,1fr)(舞台) minmax(340px, min(38vw,520px))(聊天)`；`data-chat-collapsed` 第 4 列降 0（轨道保留做插值动画）；981–1009 聊天列下限 280px。
- **741–980**：grid 2 列 `68px 1fr` + 第 3 行 `minmax(210px,35dvh)` 成员面板底部横带。
- **≤740**：flex column：banners(absolute) → 收藏 chips → workspace/member-panel(视 tab)/more-panel → 底部 nav。
- 舞台：`.workspace-content` 宽三档 min(1360/950/900, 100%-64px)（≥1201/默认/≤1200）；成员磁贴 auto-fill minmax(142/180px,1fr)、aspect 1.82、头像 104px、说话绿环+脉冲。
- 首页：两列 grid `minmax(0,1fr) + minmax(480px,520px)`，列距 clamp(40px,6vw,88px)；header min(1680px,100%-32px)；join-card ≥741 `max-height: calc(100dvh - 190px)` 内滚。
### 17.2 区域树与 data-ws-part 层级
见侦察报告（WebClient 两态完整区域树、admin 三态、download）；part 注册表按契约重置决策在新布局重建后统一登记（Phase 4-7），legacy 177 值清单见 `skin-parts-legacy.md`。
### 17.3 z 阶梯（保留原值，语义类映射）
`--ws-z-*`: raised 10 / header 100 / dropdown 200 / menu-mask 300 / menu 310 / modal-mask 400 / toast 500。使用者图谱：rail/dock/mobile-nav=raised；join-header/workspace-header=header；banners/下拉/hover 面板=dropdown；右键菜单与切换器遮罩=menu-mask+menu；全部模态=modal-mask；toast/皮肤通知/poke 横幅=toast。`isolation:isolate` 容器内局部 1/2/3 不参与阶梯。
### 17.4 断点清单
740（移动总开关）/ 741 / 851（zoom 补偿）/ 980↓ / 981↑（四栏）/ 981–1009 / 1100·1200·1201（舞台宽三档）/ 360·390·420↓（极窄压缩）/ 980↓+500↓（矮横屏）/ admin: 520·560·620·850（总开关）·1050·1100 / download: 640 / `prefers-reduced-motion`（全局 kill switch 是当初否决 KAAK 双环动画的豁免前提，勿删）。
### 17.5 直播中胶囊
红底白字 toggle（`--wsd-danger`+呼吸点，min-height 26px/11px）：他人卡=观看 toggle，自卡纯状态；停止共享唯一入口在音频坞绿条（decisions.md）。

## 18. 采证状态
原七项待采证（2026-10-14 第二增量）**全部解决**，事实已并入正文并新增 8 个 characterization 测试钉死（skin-lifecycle.test.mjs +1 主题互斥、admin-view.test.mjs +4 强制改密/登录失败、screen-share-ui.test.mjs +3 共享三预设/码率/损坏回退）：
说话指示三层模型（§5.4）· 静噪与通知音（§5.8）· 共享三预设与码率（§7）· 主题互斥与皮肤包上限（§10）· 强制改密流与登录失败（§12）。

仍开放的采证项（随迁移推进补充）：
1. 真浏览器布局快照（首页/下载/管理台静态页可无后端截取；进房态需真实 TS 服务器，见报告 20 Phase 0）。
2. 新冠点随手登记：迁移中发现任何「测试+代码都无法解释行为来源」的点，先进本节再采证。

## 19. 怪癖不随迁清单（初版；Phase 4 分诊持续补充）
原则（报告 20 §1）：无测试/运行时背书且能判定为存量缺陷的行为不迁。初版只有「已知脆弱区」与方法，尚无实锤怪癖——诚实留空：
- 已知脆弱区（迁移时刻意按正确语义重写，不照抄）：① CSS 级联死规则与特异性战争区（dock-menus/workspace-relayout 的多轮补丁）；② `.voice-card > span` 类「直接子级通用规则压过新子元素」结构（五轮破案史的根因模式）；③ 首页 join 卡条件 notice 的互斥同位渲染（六条件依次 if 的脆弱结构）。
- 分诊方法：平价验收遇怪行为 → 查 §0 三类证据 → 有据=照做；无据+可判定缺陷 → 登记于此并按正确行为实现。
- 已登记不随迁（Phase 4 起）：
  1. **Download 页语言切换不持久化**（旧 DownloadView.vue 的 language 是本地 ref，只有 WebClient.vue:1452 与 AdminView.vue:576 写 `webspeak:language`）。不随迁理由：同一切换器在首页持久、在下载页丢失是实现接线差异而非有意行为。新版 React `I18nProvider` 全局持有一份语言状态并在切换时统一持久化。

## 20. 测试基建复用清单（characterization 直接蓝本）
- 可整体搬运（零框架依赖）：`TestSocket`（voice-session.test.mjs:10-23）、`TestPeer`（:130-163）、`AudioContextStub` 家族（:76-121）、`AudioDecoderStub/RecorderStub/AudioSourceStub/AudioNodeStub/TestTrack/TestAudioElement`、`receiveAudio/decodedChunk`、`replaceGlobal` + before/after 强清理模式、`controlRequestTimers`（只拦 8s/15s 两常量）、screen-share 的 `Peer` stub 与 `confirmStart` 模式。
- 需适配：`vite.ssrLoadModule` → React 模块加载；`effectScope.stop()` 作用域处置语义 → 组件 unmount（行为等价映射点，最需小心）；node:test mock timers → Vitest。
- 纯函数/纯状态机被测对象原样保留只改 import：microphone-failure、session-intent、useLongPressContextMenu、useWebClientServerHistory、teamspeak-target、identity-import、member-menu-placement、mobile-*、screen-wake-lock、skin-operation、skin-catalog、local-persistence、admin-api。
