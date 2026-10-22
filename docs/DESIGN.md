# WebSpeak 设计系统 · Design System

前端视觉的事实源文档。改颜色、层级、样式文件归属前先读这里；本文件与代码不一致时，以代码为准并回改本文。

[返回项目首页](../README.md) · [简体中文](./README.zh-CN.md) · [English](./README.en.md)

---

## 1. 颜色令牌：`--wsd-*` 单轨

**唯一调色板**定义在 `web/src/styles/web-client/tokens.css`，作用域为产品路由根（`.web-client, .download-page, .admin-root`）。日间值为默认，夜间整块挂在 `.dark …` 覆盖（`html.dark` 由 `theme.ts` 维护：system/light/dark 三态偏好解析成单一视觉开关，`data-theme` 属性只记录偏好不参与样式匹配），`color-scheme` 随令牌块同步翻转。管理台路由是独立懒加载 chunk，其清单（`styles/admin.css`）首行引入 tokens.css——ws-tokens 层不在 admin 加载面，令牌定义必须随行。

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
| `--wsd-media-void` | 全屏媒体背板/视频信箱底（双主题同值，浅色信箱会被读成布局故障） | `#0b0c0e` | 同左 |
| `--wsd-shadow-raised` / `-pop` / `-modal` | 浮起三级：卡片/常驻面 · 菜单/下拉/toast · 模态与对话框 | 中性墨色低透明 | 同几何、加深黑（暗底吃阴影） |
| `--wsd-radius` | 基准圆角 | `9px` | 同左 |
| `--wsd-font` | 应用字体栈 | Geist Variable + 苹方/雅黑 CJK 回落 | 同左 |

口径：**Graphite × cobalt**——中性石墨面 + 唯一交互钴蓝；success 保持独立绿（状态语义），不与品牌色混用。组件层颜色使用点禁止裸 hex（棘轮测试强制，见 §5）；新颜色先落成命名变量（全局令牌或组件根语义变量）再消费。

阴影同口径：层级只有上面三级令牌，裸 `box-shadow` 值被棘轮测试拦下；阴影色用中性墨/黑，**不得用 `--wsd-text` 混色**——该令牌夜间近白，混出来是浅色光晕而不是投影。状态环（`0 0 0 Npx …`）与引用颜色令牌的辉光（如说话态 `--wsd-accent-soft`）不属浮起体系，可继续直写。

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

管理台样式（`web/src/styles/admin/`，五个职责文件 + tokens 引入）**刻意不分层**：构建期由 `vite.config.ts` 的插件统一加 `.admin-root` 前缀做作用域，未分层规则结构性胜过 web-client 分层规则，这是两个界面互不污染的根基。文件内级联 = 导入序（layout.css 恒最后）。色值与 web-client 同源（`--wsd-*` 单令牌轨，散装 hex 已清偿）；管理台局部令牌只剩四个语义位（`--admin-field/--admin-sunk/--admin-sidebar-muted/--admin-hero-muted`，定义在 theme-overrides 的 `.admin-root` 块）；共享组件（如 LanguageSwitcher）的类样式在 admin 侧自持一份（路由 chunk 不含 ws-menus 层），几何两处对齐、色值经令牌天然同源。

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

## 6. UI 原语迁移纪要（2026-10-21 战役收官）

交互控件全面迁 shadcn 栈（tailwind v4 + radix-ui 统一包 + cva/cn，观感照搬 ZCode radix-mira，源在 `web/src/components/ui/`）：

- **浮层六簇**：语言切换器/服务器菜单/成员菜单/服务器切换器迁 DropdownMenu（≤740 底部面板保留旧标记双渲染）；坞悬停面板与性能面板迁 Popover（PopoverAnchor 悬停驱动）。摆位/碰撞/外点/Esc/焦点归原语，手摆定位服务（dropdown-place / member-menu-placement）退役。
- **弹窗六枚**：频道/服务器密码、共享设置、收藏服务器、身份导入、音频设置迁 Dialog；useDialogFocus 与 body-scroll-lock 退役；「backdrop 点击不关闭」经 onInteractOutside 阻断。
- **表单控件**：Slider（shadcn canonical，ZCode 无此原语）/Switch 迁原语，rangeStyle 渐变轨道退役。表单控件走单色 primary（日墨/夜白），非 accent。设备/预设原生 select 保留（「默认设备」空值语义不值得 radix Select，已评估推迟）。
- **浮层挂载点两代规则**：锚定浮层（menu/popover/tooltip）portal 落 **body**——`#root` 有 `zoom: var(--ui-scale)`，portal 回缩放子树会让 popper 坐标再乘缩放；弹窗（dialog/alert-dialog）portal 落 **#root**——居中定位无 popper 坐标，回缩放子树正好跟随整体缩放。令牌作用域必须含 `body`（tokens.css），否则 portal 子树内一切 `var(--wsd-*)` 计算值期整体失效（渲染为透明）。
- **边界适配**：控制器事件形参（`{target:{value}}`）经组件边界适配保留，radix onValueChange/onCheckedChange 不上溯改控制器签名；尾随 click 吞噬守卫在菜单挂 onSelect、弹层挂 onPointerDownOutside。

## 7. 沿革

- 报告 19（KAAK 对齐）确立四栏工作区与磁贴语言；随后整体重定调为 Graphite × cobalt。
- 2026-10-18 皮肤系统整体下架：日/夜改 `html.dark` 静态承载，`night.css` 接管夜间组件面。
- 2026-10-19 管理台并入单一主题通道与令牌源：暗色键从 `data-theme` 双族（显式 dark + system 经 media query 复制整块）统一到 `html.dark`；`--admin-*` 轨道折叠进 `--wsd-*`（局部只剩四个语义位），散装 hex 163→3（全部是局部令牌定义行）；CSP 收紧皮肤时代的 `img-src/font-src blob:` 遗留通道（盘点零消费）。
- 2026-10-19 令牌单轨（遗留 `--ws-*`/`--surface-*`/`--skin-*` 全部 1:1 映射进 `--wsd-*` 后删除）+ 组件族归位 + 语义层阶梯（原批次序号层 w00–w22 废止）。
- 2026-10-19 hex 清偿：web-client 十文件颜色使用点裸 hex 归零（原存量约 110 处）；旧绿调色板残留（面包屑/成员面板/聊天输入、移动端收藏 chip）归入石墨令牌；横幅与 toast 改组件根语义变量；新增 `--wsd-on-fill`；夜间层删除日间归一后冗余的覆盖规则；menus 语言切换器剥除失效的 admin 回退值（admin 由 base-auth.css 全套 `--admin-*` 重建）。
- 2026-10-21 UI 原语迁移战役收官（浮层六簇/弹窗六枚/表单控件，见第 6 节）：修复两处存量层序倒置（≡ 服务器头部、移动语音页控制条均因族规则散居两文件被层序无声杀死）与 portal 令牌缺位（`--wsd-*` 作用域补 body）；stylelint 新增颜色使用点禁裸色值规则与 `--wsd-backdrop-sheet` 语义槽。
