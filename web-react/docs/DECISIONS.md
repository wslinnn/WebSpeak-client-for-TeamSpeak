# 前端重构决策记录（web-react）

> 上游决策源：仓库根 `.agents/notes/decisions.md`（会话回归不变量 / 否决项 / 条件重开项——其中前端相关条款已并入 `SPEC.md`，此处只记重构专属决策）。行为改动先改 SPEC，拍板记本文。

## 2026-10-14 · 重构立项拍板（5/5，选择题确认）

1. **仓库策略：同仓 `react-web` 分支 + 平行目录 `web-react/`**。切换时单 commit `git mv` 回 `web/`，后端 `STATIC_DIR` 零改动。理由：保住前端直连 `src/shared/` 的防漂移机制；协议类型分叉复制是比现有怪味更糟的腐化源。react 分支期间定期 rebase master；Vue 侧冻结只修致命 bug。
2. **皮肤系统：契约重置**。`.wskin` 运行时/管理台上传/公开目录/内置亮暗全保留；`data-ws-part` 注册表按新布局重新登记（legacy 177 值清单见 `skin-parts-legacy.md`，仅作参考不作承诺）；旧社区皮肤降级为「尽力兼容」（结构选择器失效不可避免）；KAAK 对齐成果（报告 16-19）转内置主题回填。执行口径：属性钩子（`data-ws-part`/`data-ws-page`/`ws-skin-root`/`data-ws-skin`）从建壳起就带着写；注册表重置在皮肤迁移步统一登记与验收，验收以至少一份真实 `.wskin` 实测为准。
3. **防劣化门禁：轻量档**。五条机检（max-lines 400 豁免字典/测试/components-ui；services+voice 禁 import react、响应式用 zustand/vanilla；跨包只走 `@shared` 别名；禁裸色值/字号/z-index；data-testid 约定）+ 两条流程纪律（spec 先行；verify 全绿禁 grep 日志代替退出码）。
4. **工具链：npm + ESLint 9 flat + typescript-eslint + react-hooks + Vitest/RTL**。Node 22、TS 6（与后端同版）、Vite 当期稳定、Tailwind 4 CSS-first、shadcn CLI 当期版。不引 pnpm/oxlint/husky。
5. **视觉基准：shadcn 中立风 + 亮暗双主题起步**；KAAK 观感以内置主题形式回填（Phase 5 后置小批次，纯 token 变量组）。布局保留现版结构（SPEC §17）。

## 继承的仓库级否决项（前端相关，勿重新立项）

- 前端 shallowRef 目录状态（delta 化后无收益）。
- 昵称冲突客户端自动重试（TS 服务端自带处理）。
- 管理端邀请功能（fixed 模式下无门禁语义；`?channel=` 已覆盖深链）。
- 自动「最近连接」列表（2026-10-10 废除；收藏模型见 SPEC §8）。
- 皮肤包上 CDN（版本化 URL+immutable 已够；选点见上游 decisions.md）。
- 皮肤插件平台（上游 v2/v3/v4 wasm 插件——违背 fork 初衷）。
- KAAK 说话双环无限动画（无 reduced-motion 豁免）、五段移动布局。

## 条件重开项（前端相关触发器）

- 移动端代码整体删除：自研安卓端稳定上架后（此前只做引导页+逃生口）。
- iOS 音频行为真机定级（volume/mute/输出路由）。
- 入会前设备选择完整版（现仅对话框复用入口）。
- 头像换新检测（`fileTransferInitDownload` 元数据比对路径已明确）。
- 上游式「复制服务器/频道链接」：默认不做，做则放 more 面板守住 header 图标数。

## 2026-10-14 · Phase 2 移植落地取舍

6. **状态层：Vue reactive/ref → zustand/vanilla 快照替换**。session-state 的公开快照按「数组与对象写入即替换」发布（React 靠引用相等感知变更），三处原字段突变点（memberUpdated/applyAvatar/channelUpdated）改为新建对象换引用；**「频道投影与成员列表共享同一对象」这条业务不变量保留**。旧规格测试中钉 Vue 实现细节的断言（数组引用跨更新不变、ref.value）按「行为级平价」翻译为内容断言，见 `src/voice/session-controller.test.ts` 文件头。
7. **useVoiceWebSocket → `src/voice/session-controller.ts`**：行为级等价平移（1456 行，进 max-lines 存量豁免清单，Phase 4 随视图层拆解）。Vue computed（voiceTransport）改为写入点同步重算；Vue 生命周期（onUnmounted）改为显式 `dispose()`（React Provider 卸载时调用）；screen-share 的 `api` 摊平对象取消，暴露 `store` + 动作方法。React 绑定只有 `src/hooks/useVoiceSession.tsx` 一层（context + useStore 选择器）。
8. **i18n：`createWebClientMessages(language)` 纯函数层**（useWebClientI18n 机械转换，翻译表零漂移 diff 验证），React Provider/hook 随 Phase 3 应用壳落地；五语键集平价测试照旧。
9. **门禁存量豁免清单**（`eslint.config.js`，Phase 4 拆解后必须清空）：skin-pack.ts / screen-share.ts / session-controller.ts。
10. **规格测试分波移植（已完成 4 波，web-react 共 219 用例全绿）**：会话生命周期/命令世代/重连预算/目录增量与头像/命令超时/设备切换与枚举回退/处理开关回滚/麦克风权限代际/伴奏取消与失败隔离/试听表/播放解码与槽位轮询/说话灯泡/WebRTC 协商与回退/音频探测作用域/麦克风试听/屏幕共享/存储命名空间/皮肤包导入/协议解析。**以下测试留旧套件、Phase 4 以 RTL+新钩子重钉**：chat ack 视图分组、channel tree、audio controls（含伴奏错误文案五语言）、performance 面板轮询、voice-server-switch 横幅、admin-api.integration（切包后把 import 指向新副本）。皮肤包 5 个锚定旧 web-client.css/Vue 源的基线测试留旧套件，Phase 3/4 按新样式基线重钉。

## 2026-10-14 · P4-2 管理台移植取舍

16. **架构：三领域控制器 + orchestrator，全部 zustand/vanilla**（`src/admin/*-controller.ts`）：server-settings/operations/skins 逐行平价旧 composable（合并基线、探针作废、mutation 串行），Vue 的 flush:sync watch 显式化为 `setField/setSecretField`；orchestrator 持会话状态机与 401 双轨，经 `bind()` 注入当次渲染的 navigate/路径/语言（React 视图层职责）。22 条 characterization（web/test/admin-view.test.mjs）平移为 `admin-controller.test.ts` 23 用例，直接实例化控制器（旧的无头 Vue 挂载不再需要）。window.confirm 保留在控制器（平价；Promise 化确认弹窗的替换留 Phase 5 打磨项）。
17. **admin 语言复用全局 I18nProvider**：旧版 AdminView 有独立 language 实例但写同一个 `webspeak:language` 键；新版一份语言状态驱动 web-client 与 admin 两套字典（`createAdminMessages(language)` 纯函数层，i18n/admin-messages.ts）。
18. **site-copy 移入 `src/shared/`**：前端三处依赖 DEFAULT_WELCOME_TEXTS/SiteLanguage，后端仅 admin-service 一处引用——按共享归属移入白名单目录，旧路径留再导出 shim（冻结的 Vue 侧零改动）。
19. **admin.css 平移 + `:deep` 剥除**：13 分片 3379 行拷入 web-react/src/styles/，剥掉 542 处 Vue scoped 的 `:deep()` 包装，其余字节不动；全局导入安全（唯一文档级规则是与 index.css 同值的 `:root` z 阶梯；其余类名 admin 专属）。视图类名与结构保留 → 视觉平价。
20. **React 视图层约束落点**：`admin-view.tsx` 的控制器创建只用 useState 初始化器 + `bind()` 注入闭包——react-hooks v7 的 refs 规则按词法扫描组件体，ref 传递/解引用都会被拦；绑定式注入同样满足「控制器只创建一次」。
21. **管理台模态红线对齐**：WebRTC 端口提示弹窗改为只经按钮/背景点击显式目标关闭（旧版 backdrop click.self 关闭与「模态不响应 backdrop」红线冲突，按红线收口）。

## 2026-10-14 · P4-3a 首页逻辑层取舍

22. **首页态拆分**：`web-client/home-store`（join 表单+弹窗+收藏+身份对话框的共享 zustand/vanilla 状态）+ 四控制器：home-connection（join 触发/双密码弹窗/乐观选台）、home-identity（导入导出代际纪律）、home-favorites（连接即收藏）、public-config（公开配置预填）；`server-switch`（语音内切服横幅状态机）独立。全部接受结构化切面（voiceStore 只声明四个连接字段 + 动作回调），不 import 真实 controller 类型——测试用夹具 store 即可，视图层接 VoiceSessionController。
23. **Vue watch → store 订阅**：errorCode/channelSwitchedChannelId/selfMovedChannelId 三字段的弹窗驱动语义（频道密码重开、服务器密码弹窗、强制移动同步选台）改为 zustand subscribe + prev 比较；home-identity 对 rememberIdentity/identityMaterial 的监听同样订阅化（任何来源的变更都作废在途导出）。测试 39 条全平移（connection 4+3 补充 / identity 22 / favorites 4 / switch 4）。
24. **window.confirm/Toast 走回调注入**：控制器不依赖具体 toast 实现（视图接 sonner），确认弹窗等 P4-3b 视图层决定用 confirmDialog Promise host 还是保留 window.confirm。

## 2026-10-14 · P4-3b 首页视图移植取舍

25. **web-client CSS 全分片剥壳平移**（非按需拆分）：21 分片 + mobile 覆盖层整体字符级剥 `:deep()`/`:global()` 壳（admin 542 处同手法），级联次序原样保留——按选择器组拆分响应式分片正是踩坑红线警告的手木区，Phase 5 视觉重做时一并归零。唯一裸元素泄漏（mobile 层 `input/textarea/select/button/a`，Vue 靠 scoped [data-v] 限域）补 `html[data-ws-route="webclient"]` 门控；组件自带 scoped 样式（语言切换器/手机门/服务器右键菜单）收进 `21-components.css` 尾片，`#app` 挂载点改 `#root`。语言切换器选项常量挪 `i18n/language-options.ts` 保 react-refresh 纯组件。
26. **live i18n 桥**：home-identity 控制器只创建一次（代际纪律的 downloads/generation 状态不可随语言重建），其 t/localizedMessage 适配器经模块级 `liveMessages` 读当次语言（仅事件与订阅回调触达，渲染路径不经过）；connection/favorites 无瞬时状态，随 messages 重建并配 dispose effect 防订阅泄漏。视图装配独立为 `web-client/use-web-client-controllers.ts`（view 380 行 < 门禁 400）。
27. **过渡期功能缺口（后续阶段回填）**：header 无 SkinSwitcher（P4-7 皮肤运行时回归，现用 applyTheme 钉内置皮肤）；设备设置按钮 no-op（P4-5 音频设置弹窗回归）；连接成功后仍显示 join 页（P4-4 进房壳落地，data-ws-page 已按 voice 翻转）；服务器密码取消尚未联动切服横幅结算（P4-4 voice-server-switch 接线时补）。
28. **toast 换 sonner、window.confirm 保留**：旧 2800ms 自绘 toast div 退役（P4-2 admin 同规）；clearBrowserData 的确认弹窗保留 window.confirm（DECISIONS #16/#24 同一纪律，Promise 化替换统一留 Phase 5）。
29. **输入区焦点指示只留外层框**（走查用户拍板）：`.web-client input:focus-visible` 的 outline 与 `.field-wrap:focus-within` ring 叠成双框——旧版两条同特异性 (0,2,1) 且 12 分片后导入必胜，02 分片里 `.field-wrap input` 的 outline:none 从未真正生效（「同特异性后导入必胜」死规则的又一实例，模式同 SPEC §19-2）。修法：`.field-wrap input:focus-visible` 以 (0,3,1) 显式豁免，按钮/链接/裸 textarea（无外层框者）保留 focus-visible 作键盘可达性指示。

## 2026-10-14 · P4-4a 进房投影逻辑层取舍

30. **投影层纯函数化**：useWebClientChannels 的树构建/当前频道/过滤/耳语目标从 Vue computed 改为 `web-client/channel-tree.ts` 纯函数（视图订阅 store 后 useMemo 调用），选台缺省补齐（旧 watch(channelTree)）返回增量或 null 由视图落地。折叠记忆（useChannelFold）的 watch(serverKey) 显式化为 `sync(key)` 由视图 effect 调用。
31. **聊天页签权威归 home store**：P4-3a 已把 chatTab 放进 HomeStore（selectChannel 乐观补位写它），chat-controller 不再自持页签状态——读写都走 home store，单一权威避免双源漂移；其余聊天状态（草稿/私聊会话/发送中/错误）在 chat store，按 `epoch:tab:conversationKey` 目的地键隔离草稿/在途/错误。
32. **滚动容器切面化**：旧 listElement Vue ref 改为 `getList()` 切面（视图传 HTMLElement、测试传桩对象），滚动跟随（followingLatest/scrollGeneration）留在控制器、DOM 操作经切面；移动分段/视口高度变化的 scrollIfFollowing 钩子由视图 effect 调用（旧 watch 平价）。
33. **聊天历史装载触发面**：旧 watch([connected, sessionEpoch, serverKey]) 三源在 React 侧收敛为三处 store 订阅各触发 + 幂等 identity 去重（`connected:epoch:serverKey`）；控制器直接 setState 会话 store 合并历史（快照替换语义，Phase 2 红线）。
34. **members 拖拽 DOM 操作不进 store**：pointer capture 与 elementFromPoint 命中留在控制器闭包，store 只收 draggedMember/dragOverChannelId 两个渲染字段；prompt（poke/away 留言）经 Options 注入保测试性（生产默认 window.prompt，替换留 Phase 5，与 #16/#24/#28 同纪律）。

## 2026-10-14 · P4-4b 进房视图层取舍

35. **壳组件按门禁分片**：VoiceShell 压在 400 行内（397），横幅+poke 自动消退拆 `voice-banners.tsx`（113 行）、移动端 more 面板拆 `voice-mobile-more.tsx`。poke 到达的提示音归 VoiceBanners（横幅宿主），后台系统通知（showBackgroundTabNotification）归根部 useInRoomControllers——旧版同一 watch 里做三件事，拆分后各认一半防双音；桌面通知开关沿用 `readDesktopNotificationSetting()` 读时取值（设置 UI 随 P4-5 回归）。
36. **进房控制器装配 `useInRoomControllers`**：chat/members/fold/serverSwitch 在根部 hook 创建（切服/断线期间语音壳与首页互换挂载，草稿/折叠/菜单必须跨两态存活，与旧单文件 ref 平价）；语言/视口经模块级 live 桥（liveMessages 同款纪律，仅事件与订阅回调触达）。React Compiler 两轮规则应对已定型：渲染期建闭包读 ref.current → refs 违规（改模块桥）；useMemo 返回的稳定盒在 effect/回调里写 → immutability 违规（hook 返回值视为不可变）——可变非渲染数据一律走模块桥，不再试 ref/盒两条路。app.test 两个 WebClient 用例 waitFor 提到 5000ms（并行负载下模块图+首渲染可超默认 1s，/download 用例同款先例）。
37. **vite8 代理必须 `changeOrigin: false`**：vite 8 的 dev 代理默认改写 Host 头，网关 `/api/join-ticket` 的 `Origin===Host` 同源校验随即失败（ORIGIN_REJECTED）；api/avatars/ws 三条代理显式保留原始 Host（旧 web/vite6 未受影响）。真浏览器连真实 TS 服务器全链路走查即依赖此修复。
38. **平迁陷阱两则（真浏览器走查揪出，测试与 tsc 都测不出）**：① zustand store 渲染期 `getState()` 是一次性快照——fold 集合曾这样传给面板，toggle 后 UI 不更新，必须 `useStore(fold.store)` 订阅；② 容器归属必须照旧模板逐层核对——聊天面板与说话横条是 workspace-content 直接子级（移动页签显隐各归各），放进 voice-section 会被 `mobile-section-hidden` 连带藏掉。#27 的「服务器密码取消联动切服结算」缺口已在此轮补齐（onServerPasswordCancel = serverSwitch.fail + cancelServerPassword）；switchServer 平价含同地址 no-op、失败镜像复位、无效表单即挂失败横幅。
39. **成员子菜单开合语义与旧版等价**：mouseenter 开 + click toggle 的组合在「鼠标悬停容器内再点触发器」时会开合抵消（Playwright 首点即此路径）——与旧 Vue 版逐行为同构，不改；子菜单摆位沿用同帧反推（主菜单位置未提交时按未偏移锚点计算），摆位/视口clamp 真浏览器核实（fixed + --ui-scale 折算 + z-index 310 = --ws-z-menu）。

## 待办决策（无）

（Phase 4 迁移过程中新产生的取舍记此处，格式：日期 · 决策 · 理由 · 影响面）

## 2026-10-14 · Phase 3 设计系统与应用壳落地取舍

11. **主题暗色同步**：Tailwind 的 `dark:` 变体钉在 `.dark` 类（`@custom-variant`），`services/theme.ts` 的 `applyTheme` 在维护 `data-theme` 的同一处切换 `.dark` 类——主题 DOM 契约仍只有 theme.ts 一个入口，React 侧响应式经 `subscribeTheme/getActiveTheme`（`hooks/use-theme.ts` 消费）。sonner 包装弃用 next-themes（依赖已卸载），改读 theme 服务。
12. **生成组件的两处定制**（`components/ui/`，shadcn 生成后手改）：① z-50 一律映射 `--ws-z-*` 阶梯语义类（dialog/alert-dialog→modal-mask、dropdown/popover/select/tooltip→dropdown、context-menu→menu、sonner 内联 `var(--ws-z-toast)`）；② `DialogContent` 无条件吞掉 outside 交互——产品红线「模态只经按钮/Esc 关闭」下沉到组件层，调用方回调仅观察用。升级 shadcn 组件时这两处定制必须重放。
13. **门禁增补**：`style={{ zIndex: <number> }}` 裸数值被拦（esquery 的 value regex 只对字符串生效，选择器须用 `raw` 属性匹配；负数字面量是 UnaryExpression 需单独一条）。门禁规则有效性自证持久化为 `src/test/gate-probes.test.ts`（ESLint 编程式 lintText：违规被拦 + 合法放行 + 豁免面核实）。
14. **字号六级收编 Tailwind 命名空间**：`--text-xs/sm/base/md/lg/xl` = 10/11/13/14/16/18px（行高配对钉死），body 默认 13px（旧版紧凑排版平价）；shadcn 组件内的 `text-sm` 因此渲染为 11px——Phase 4 迁移页面时逐处核对视觉，不要按 shadcn 默认直觉调级。≤740 输入 16px 防护是全局 `!important` 兜底，逃生口 `text-mobile-input-safe`。
15. **公开页皮肤锚点的临时桥**：Phase 4-7 皮肤运行时接线前，公开壳挂载后补 `applyTheme(getStoredTheme())`——内置皮肤 CSS 作用域钉在 `.ws-skin-root[data-ws-skin=…]`，挂载前根元素不存在。接线后此桥删除。
