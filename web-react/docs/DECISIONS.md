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
10. **规格测试分两波移植**：已入 web-react（会话生命周期/命令/重连/目录增量/聊天边界/屏幕共享释放/存储命名空间/皮肤包导入/协议解析等 117 用例）；**随视图层重写的测试留旧套件、Phase 4 以 RTL+新钩子重钉**——chat ack 视图分组、channel tree、audio controls、performance 面板轮询、voice-server-switch 横幅、admin-api.integration（切包后把 import 指向新副本）。皮肤包 5 个锚定旧 web-client.css/Vue 源的基线测试留旧套件，Phase 3/4 按新样式基线重钉。

## 待办决策（无）

（Phase 4 迁移过程中新产生的取舍记此处，格式：日期 · 决策 · 理由 · 影响面）
