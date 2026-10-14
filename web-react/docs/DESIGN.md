# WebSpeak React 前端设计系统（DESIGN.md）

> 版本：2026-10-14（Phase 3 首版）。token 事实源是 `src/index.css`（`@theme` + `:root`）；本文是使用契约与门禁边界的说明。冲突时以 index.css 与 ESLint 规则为准，回写本文。
> 视觉基准（DECISIONS #5）：shadcn 中立风 + 亮暗双主题起步；KAAK 观感（报告 16-19 成果）在 Phase 5 后置以内置主题（纯 token 变量组）回填。布局以 SPEC §17 为准（结构不放开，视觉放开）。

## 1. 语义色（亮暗双主题）

shadcn 中立 token（`--background/--foreground/--card/--popover/--primary/--secondary/--muted/--accent/--destructive/--border/--input/--ring` + sidebar/chart 组），亮暗两套值在 `:root` / `.dark`。TSX 一律用语义类：`bg-background text-foreground border-border text-muted-foreground bg-destructive` 等。

- 暗色切换的唯一入口是 `services/theme.ts`（`saveTheme/applyTheme`）：它同时维护 `html[data-theme]`、`.dark` 类（Tailwind `dark:` 变体钉在类上）、`color-scheme`、`meta[theme-color]`、`.ws-skin-root` 的 `data-ws-skin`。**组件不得手写 `.dark` 类切换**；响应式读取用 `useThemeMode()`（`hooks/use-theme.ts`）。
- 禁止裸色值：TSX 字符串里 `-[#hex]`/`-[rgb(...)]` 形态被 ESLint 拦（门禁 4）。`style={{ color: "var(--...)" }}` 是合法逃生口。CSS 文件不在 lint 范围，靠流程纪律（改样式先看 diff + 真浏览器计算样式抽查，仓库既有红线）。

## 2. 字号六级

| token | 值 | 行高 | 用途（对齐旧版紧凑排版） |
| --- | --- | --- | --- |
| `text-xs` | 10px | 1.4 | 时间戳、微标签 |
| `text-sm` | 11px | 1.45 | 聊天作者、徽标（旧版 11px/600 muted） |
| `text-base` | 13px | 1.55 | 正文默认（body 全局默认；聊天正文 13/1.55） |
| `text-md` | 14px | 1.5 | 控件/表单标签（shadcn 组件内 text-sm 语义在六级下=11px，注意取舍） |
| `text-lg` | 16px | 1.5 | 区块标题、移动端输入（=输入防护值） |
| `text-xl` | 18px | 1.45 | 页面级标题 |
| `text-2xl`（展示级） | 28px | 1.2 | 仅页面主标题（hero），不进正文六级 |

- 禁裸字号：`text-[13px]` 形态被拦；六级之外确需例外，先改 index.css 再用。
- **16px 输入防护**（SPEC §13 平价）：≤740 视口下 `input/textarea/select` 全局 16px（`!important` 压过组件字号类，这是规则的目的——防 iOS 聚焦缩放）。全局规则覆盖不到的编辑面（contenteditable 等）用 `text-mobile-input-safe` utility。

## 3. 间距 / 圆角

- 间距：Tailwind 默认 `--spacing: 0.25rem` 基数，不另造 token；44px 触控目标 = `size-11`（11×4px）。
- 圆角：shadcn `--radius`（0.625rem）倍率组（sm/md/lg/xl/2xl…），用 `rounded-lg` 等语义类。

## 4. 浮层层级阶梯（z-index）

值照抄旧版（SPEC §17.3），定义在 index.css `:root`，TSX 只允许语义 utility：

| utility | 值 | 使用者（旧版图谱） |
| --- | --- | --- |
| `z-raised` | 10 | rail/dock/mobile-nav |
| `z-header` | 100 | join-header/workspace-header |
| `z-dropdown` | 200 | banners/下拉/hover 面板（生成组件的 dropdown/popover/select/tooltip 已映射） |
| `z-menu-mask` | 300 | 右键菜单/切换器遮罩 |
| `z-menu` | 310 | 右键菜单/切换器本体（context-menu 组件已映射） |
| `z-modal-mask` | 400 | 全部模态（dialog/alert-dialog 已映射） |
| `z-toast` | 500 | toast/皮肤通知/poke 横幅（sonner 已内联钉住） |

- 门禁：`z-[...]` 与 `style={{ zIndex: <number> }}` 被 ESLint 拦；style 对象逃生口是字符串 `zIndex: "var(--ws-z-*)"`.
- `isolation: isolate` 容器内的局部 1/2/3 小阶梯不参与阶梯（豁免，如组件内徽标/箭头）。
- fixed 浮层红线（decisions.md）：带 backdrop-filter/transform 的祖先会成为 fixed 后代的包含块——浮层要么挂到无此类属性的根，要么走 portal。React 下 portal 目标沿用旧版语义（`.web-client` 根而非 body），Phase 4 落地时逐个对齐。

## 5. 断点角色表（SPEC §17.4，值不改动）

740（移动总开关，flex column + 底部 nav）/ 741 / 851（zoom 补偿）/ 980↓（2 列 + 成员横带）/ 981↑（四栏 grid：86px rail · 304px 频道成员 · minmax(280px,1fr) 舞台 · minmax(340px,min(38vw,520px)) 聊天）/ 981–1009（聊天列下限 280）/ 1100·1200·1201（舞台宽三档 1360/950/900）/ 360·390·420↓（极窄）/ 980↓+500↓（矮横屏）/ admin：520·560·620·850（总开关）·1050·1100 / download：640 / `prefers-reduced-motion`（全局 kill switch：`animation: none` + transition 0.01ms，见 index.css 尾部；KAAK 双环动画否决的豁免前提，勿删）。

## 6. 移动条款

- safe-area：`--ws-safe-*` 四向 token + `pt-safe/pb-safe/pl-safe/pr-safe` utility。
- 布局高度：`h-dvh` 家族；`--ui-scale`（`app/ui-scale.ts`，1920×1080 基准、上限 1.5、双向更大才放大）由 main.tsx 安装，视图高度 `calc(100dvh / var(--ui-scale))` 在 Phase 4 视图 CSS 落地。
- 触控目标 ≥44px（`size-11` 起）；软键盘 visualViewport 跟踪是 Phase 4 移动步的迁移项（`services/mobile-viewport.ts` 已平移）。

## 7. 应用壳约定

- 路由（SPEC §1）：`/`、`/join` → WebClient；`/download` → DownloadView；`/admin/*` → AdminView。`html[data-ws-route]` ∈ {webclient, download, admin} 由 `components/app/route-effect.tsx` 副作用维护——**文档级页面样式必须由它门控**（CSS 常驻，路由切换不重载）。
- 属性钩子从第一行 JSX 起就带（DECISIONS #2）：公开页根元素 = `ws-skin-root` 类；WebClient 根另有 `data-ws-page="home"|"voice"`。**admin 不得含 `ws-skin-root`/`data-ws-page`**（SPEC §10 红线）。`data-ws-part` 注册表按契约重置在 Phase 4-7 统一登记（新增 part 必须同步 docs/SKIN_DEVELOPMENT.md）。
- 模态红线（decisions.md）：只经按钮/Esc 关闭。`ui/dialog.tsx` 已在 DialogContent 无条件吞掉 outside 交互；优先用 AlertDialog（语义即「必须表态」）。全局确认走 `confirmDialog()` Promise API + `ConfirmDialogHost`（渲染在模板根部，两态之外）。
- 全局浮层（toast/poke 横幅/成员菜单等）放模板根部，进房态与首页态都可达。
- 主题/皮肤：`services/theme.ts` 是唯一入口（含 system 跟随监听、`preserveCustomSkins` 语义见 SPEC §10）；皮肤运行时接线在 Phase 4-7，壳层挂载后补 `applyTheme(getStoredTheme())` 只是让皮肤锚点生效的临时桥。

## 8. 性能条款（voice.md 红线的设计面投影）

- 说话指示/电平表等高频值**不进 React 渲染路径**：zustand/vanilla store + 选择器订阅只取基元；逐帧值（如电平表）Phase 4 用 ref 直写 DOM（`element.style.setProperty`），不经 setState。
- 频道树 delta 渲染：成员/频道对象写入即替换（引用相等感知），行组件 memo；禁止在 render 里建树（useMemo 持有，输入变更才重建）。
- 动画只用 transform/opacity（tw-animate-css 默认）；禁止逐帧门控语音路径（pacer 空闲 200ms 停表语义不可破坏）。

## 9. 门禁边界速查（ESLint，规则本体 eslint.config.js）

1. max-lines 400（skipBlankLines+skipComments）；豁免：i18n/测试/`components/ui`（整体 ignores）+ 存量清单（skin-pack/screen-share/session-controller，Phase 4 清空）。
2. `services/**`、`voice/**` 禁 import react/react-dom/zustand 根入口（用 `zustand/vanilla`）。
3. 跨根只走 `@shared/*`、`@domain/*` 别名；相对路径逃出包外被拦。
4. 禁裸值：`-[#hex]` 类形态、`text-[Npx]`、`z-[...]`、`style={{ zIndex: <number> }}`。
5. `_` 前缀豁免 unused-vars。
- 规则有效性自证：`src/test/gate-probes.test.ts`（每条规则 = 违规被拦 + 合法放行）。
