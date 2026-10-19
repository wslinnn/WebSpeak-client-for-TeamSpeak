# WebSpeak 设计系统 · Design System

前端视觉的事实源文档。改颜色、层级、样式文件归属前先读这里；本文件与代码不一致时，以代码为准并回改本文。

[返回项目首页](../README.md) · [简体中文](./README.zh-CN.md) · [English](./README.en.md)

---

## 1. 颜色令牌：`--wsd-*` 单轨

**唯一调色板**定义在 `web/src/styles/web-client/tokens.css`，作用域为产品路由根（`.web-client, .download-page`）。日间值为默认，夜间整块挂在 `.dark .web-client, .dark .download-page` 覆盖（`html.dark` 由 `theme.ts` 维护），`color-scheme` 随令牌块同步翻转。

| 令牌 | 用途 | 日间 | 夜间 |
| --- | --- | --- | --- |
| `--wsd-bg` | 页面/舞台底色 | `#eef1f2` | `#17181b` |
| `--wsd-rail` | 最深层轨道（rail 列） | `#e3e8ea` | `#141518` |
| `--wsd-panel` | 面板/卡片面 | `#ffffff` | `#1d1e22` |
| `--wsd-raised` | 次级凸面（输入域、chip） | `#f2f5f6` | `#292a2f` |
| `--wsd-hover` | 悬停面 | `#e9eef0` | `#303137` |
| `--wsd-border` | 描边/分隔 | `#dfe5e8` | `#303136` |
| `--wsd-text` / `-muted` / `-dim` | 文字三级 | `#22262b` / `#626a72` / `#9099a1` | `#f0f1f3` / `#a0a2a8` / `#777a82` |
| `--wsd-accent` / `-hover` | 交互色（文字/图标/描边） | `#2b5cd9` / `#234db8` | `#7d96f2` / `#93a9f5` |
| `--wsd-accent-fill` / `-fill-hover` | 填充类控件底色 | 同 accent | 同 accent |
| `--wsd-accent-contrast` | accent 填充上的文字 | `#ffffff` | `#101318` |
| `--wsd-on-fill` | 非主题填充上的常白字形（内联哈希色头像首字母、滑杆白盘、通知圆点符号；双主题同值，不随夜间翻转） | `#ffffff` | 同左 |
| `--wsd-accent-soft` | accent 淡底（选中态、焦点晕染） | `rgba(43,92,217,.10)` | `rgba(125,150,242,.16)` |
| `--wsd-success` / `-warning` / `-danger`（+ `-contrast`） | 状态语义色 | `#1e7a40` / `#8a5d0b` / `#bb3f38` | `#4cc27a` / `#e2b36c` / `#ee8a82` |
| `--wsd-backdrop` | 模态遮罩（双主题同值） | `rgba(12,14,16,.52)` | 同左 |
| `--wsd-radius` | 基准圆角 | `9px` | 同左 |
| `--wsd-font` | 应用字体栈 | Geist Variable + 苹方/雅黑 CJK 回落 | 同左 |

口径：**Graphite × cobalt**——中性石墨面 + 唯一交互钴蓝；success 保持独立绿（状态语义），不与品牌色混用。组件层颜色使用点禁止裸 hex（棘轮测试强制，见 §5）；新颜色先落成命名变量（全局令牌或组件根语义变量）再消费。

## 2. 浮层层级：`--ws-z-*` 阶梯

定义在 `web/src/index.css` 的 `:root`（**单点**，admin 与 web-client 共用，`declaration-discipline.test.ts` 防副本）：

```
--ws-z-raised: 10      --ws-z-header: 100     --ws-z-dropdown: 200
--ws-z-menu-mask: 300  --ws-z-menu: 310
--ws-z-modal-mask: 400 --ws-z-toast: 500
```

- 浮层 `z-index` 只准取这些变量（stylelint 强制）；`isolation: isolate` 容器内部的 `0–3` 局部小阶梯不与本阶梯比较。
- toast 层经 `[data-sonner-toaster]` 收编到 `--ws-z-toast`。

## 3. CSS 层阶梯与文件分工

`web/src/styles/web-client.css` 是纯 manifest，顶部 `@layer` 声明语句即**覆盖契约**（层序 = 覆盖权限，低 → 高）：

```
ws-tokens < ws-base < ws-ui < ws-join < ws-chrome < ws-room
          < ws-dialogs < ws-menus < ws-night < ws-mobile
```

| 层 / 文件 | 职责 |
| --- | --- |
| `ws-tokens` / `tokens.css` | 只放 `--wsd-*` 定义与滚动条面；组件规则禁入 |
| `ws-base` / `base.css` | 路由门控元素 reset、按钮基座、页面根面 |
| `ws-ui` / `ui.css` | 共享控件原语（primary/secondary/text-button、field 系、notice、select-like） |
| `ws-join` / `join.css` | 首页：页头/品牌/连接卡/设备设置弹层/身份记忆块 |
| `ws-chrome` / `chrome.css` | 应用壳：app-shell 网格、工作区框架、收藏 rail、页头、横幅、移动导航、视口契约 |
| `ws-room` / `room.css` | 房间：语音卡、成员面板、聊天、屏幕共享、whisper 条、语音活动艺术品 |
| `ws-dialogs` / `dialogs.css` | 浮层对话框：设置模态、频道密码、身份导入、收藏管理、移动门、toast |
| `ws-menus` / `menus.css` | 指针浮层：右键/成员菜单、服务器切换、桌面音频坞、性能面板、语言坞、弹层原语（ws-popup/ws-icon-btn/ws-menu-item） |
| `ws-night` / `night.css` | 夜间面：只放 `html.dark` 前缀的颜色/阴影覆盖，不改布局 |
| `ws-mobile` / `mobile.css` | 移动终局锁：≤740 键盘避让（`--ws-viewport-height`）、触控目标、菜单锚定——级联最后一环 |

规则（结构由 `web-client-manifest.test.ts` 钉死）：

- **一个组件族只住一个文件**；同族规则的响应式/暗色变体就近共置（media query 不加特异性）。改样式先读目标文件头注释。
- 跨文件覆盖只有层序一条路，抬特异性跨层无效；同文件内同特异性按源序（后位胜）。
- `!important` 是锁面：每文件数量钉顶、同族锁单源（`cascade-locks.test.ts`、`declaration-discipline.test.ts`）；important 跨层按**早层胜**裁决，加锁前先确认同族没有更早层的锁。
- Tailwind utilities 层位于全部 `ws-*` 层之前——分片规则在共享属性上胜过 utility 类；TSX 里的 Tailwind 只用于分片未接管的布局便利。

管理台样式（`web/src/styles/admin/`，五个职责文件）**刻意不分层**：构建期由 `vite.config.ts` 的插件统一加 `.admin-root` 前缀做作用域，未分层规则结构性胜过 web-client 分层规则，这是两个界面互不污染的根基。文件内级联 = 导入序（layout.css 恒最后）。

## 4. 排印与断点

- 字体：Geist Variable（`@fontsource-variable/geist`，index.css 全局加载）；`--wsd-font` 栈为拉丁/数字 Geist + 苹方/雅黑 CJK 回落。字号六级经 Tailwind `@theme` 定义（`--text-xs` 0.625rem → `--text-xl` 1.125rem，展示级 `--text-2xl` 仅页面主标题）。
- 断点体系（产品 CSS）：`360 / 390 / 420 / 520 / 740|741（移动门）/ 851 / 980|981 / 1009 / 1100 / 1200|1201`；四栏工作区布局自 `≥981` 起（`86px rail / 304px 频道 / 1fr 舞台 / 聊天列`）。
- 触屏卫生：悬停面一律包 `@media (hover: hover)`；交互控件 `min-height: 44px`；≤740 输入元素强制 16px（防 iOS 聚焦缩放，index.css 基座层）；`prefers-reduced-motion` 全局降级是既有动画的豁免前提，勿删。
- 移动视口：`viewport-fit=cover` + `interactive-widget=resizes-content`；键盘避让消费 `--ws-viewport-height` / `--ws-viewport-top`（`mobileViewport` 服务写入元素内联变量）。

## 5. 声明纪律（机器强制）

`web/stylelint.config.js` + `web/src/styles/declaration-discipline.test.ts`：

- z-index 只准 `var(--ws-z-*)`（0–3 局部阶梯豁免）；transition 禁 `all` 与 `width/height/top/left/right/bottom/margin/padding/gap`（布局过渡必致回流；`grid-template-*` 是工作区折叠动画的刻意豁免）。
- 颜色使用点零裸 hex：十文件逐一断言为 0，色值只允许住在命名变量定义里——全局 `--wsd-*`（tokens.css）或组件根语义局部变量（如 `--toast-bg`、`--reconnect-fg`，横幅/恒暗 toast 等组件私有调色板）。`--ws-z-*` 单源；`!important` 锁面盘点。
- 颜色取用向导：落在 accent 填充上的文字/字形走 `--wsd-accent-contrast`（夜间翻墨色）；哈希色头像首字母、滑杆白盘等非主题填充走 `--wsd-on-fill`（恒白）；日/夜各自成套的组件调色板（纸色横幅、恒暗 toast）收在组件根的语义变量里，夜间由 night.css 直接覆盖声明。

## 6. 沿革

- 报告 19（KAAK 对齐）确立四栏工作区与磁贴语言；随后整体重定调为 Graphite × cobalt。
- 2026-10-18 皮肤系统整体下架：日/夜改 `html.dark` 静态承载，`night.css` 接管夜间组件面。
- 2026-10-19 令牌单轨（遗留 `--ws-*`/`--surface-*`/`--skin-*` 全部 1:1 映射进 `--wsd-*` 后删除）+ 组件族归位 + 语义层阶梯（原批次序号层 w00–w22 废止）。
- 2026-10-19 hex 清偿：web-client 十文件颜色使用点裸 hex 归零（原存量约 110 处）；旧绿调色板残留（面包屑/成员面板/聊天输入、移动端收藏 chip）归入石墨令牌；横幅与 toast 改组件根语义变量；新增 `--wsd-on-fill`；夜间层删除日间归一后冗余的覆盖规则；menus 语言切换器剥除失效的 admin 回退值（admin 由 base-auth.css 全套 `--admin-*` 重建）。
