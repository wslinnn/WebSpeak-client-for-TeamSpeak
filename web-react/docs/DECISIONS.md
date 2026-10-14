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

## 待办决策（无）

（Phase 4 迁移过程中新产生的取舍记此处，格式：日期 · 决策 · 理由 · 影响面）

## 2026-10-14 · Phase 3 设计系统与应用壳落地取舍

11. **主题暗色同步**：Tailwind 的 `dark:` 变体钉在 `.dark` 类（`@custom-variant`），`services/theme.ts` 的 `applyTheme` 在维护 `data-theme` 的同一处切换 `.dark` 类——主题 DOM 契约仍只有 theme.ts 一个入口，React 侧响应式经 `subscribeTheme/getActiveTheme`（`hooks/use-theme.ts` 消费）。sonner 包装弃用 next-themes（依赖已卸载），改读 theme 服务。
12. **生成组件的两处定制**（`components/ui/`，shadcn 生成后手改）：① z-50 一律映射 `--ws-z-*` 阶梯语义类（dialog/alert-dialog→modal-mask、dropdown/popover/select/tooltip→dropdown、context-menu→menu、sonner 内联 `var(--ws-z-toast)`）；② `DialogContent` 无条件吞掉 outside 交互——产品红线「模态只经按钮/Esc 关闭」下沉到组件层，调用方回调仅观察用。升级 shadcn 组件时这两处定制必须重放。
13. **门禁增补**：`style={{ zIndex: <number> }}` 裸数值被拦（esquery 的 value regex 只对字符串生效，选择器须用 `raw` 属性匹配；负数字面量是 UnaryExpression 需单独一条）。门禁规则有效性自证持久化为 `src/test/gate-probes.test.ts`（ESLint 编程式 lintText：违规被拦 + 合法放行 + 豁免面核实）。
14. **字号六级收编 Tailwind 命名空间**：`--text-xs/sm/base/md/lg/xl` = 10/11/13/14/16/18px（行高配对钉死），body 默认 13px（旧版紧凑排版平价）；shadcn 组件内的 `text-sm` 因此渲染为 11px——Phase 4 迁移页面时逐处核对视觉，不要按 shadcn 默认直觉调级。≤740 输入 16px 防护是全局 `!important` 兜底，逃生口 `text-mobile-input-safe`。
15. **公开页皮肤锚点的临时桥**：Phase 4-7 皮肤运行时接线前，公开壳挂载后补 `applyTheme(getStoredTheme())`——内置皮肤 CSS 作用域钉在 `.ws-skin-root[data-ws-skin=…]`，挂载前根元素不存在。接线后此桥删除。
