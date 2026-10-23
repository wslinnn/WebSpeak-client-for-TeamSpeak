# 遗留清单销账与二轮拍板（2026-10-23 收账）

## 样式金样门禁（拍板 A）

- `web/tests/style-snapshot.spec.ts` + `web/tests/__style-snapshots__/*.json`（16 文件）+ `scripts/smoke-server.mjs` 日志落盘（admin 首启 token 从 `$TEMP/webspeak-smoke-gateway.log` 取）。
- 覆盖：join/房间/admin/admin-server × 日/夜 × mobile/tablet/desktop 三视口档；按 `data-ws-part` 部件录 27 项白名单计算样式 + 几何。**opacity 白名单刻意排除**（入场动画中间帧抖动，presence 语义由 display/visibility 兜住）。
- 用法：覆盖致渲染变化 → 冒烟红并列出 `部件.属性: 旧 -> 新`；改动属有意 → `UPDATE_STYLE_SNAPSHOTS=1 npm run smoke` 重录并随改动同批提交。
- 接线：随 `npm run smoke`（pre-push + CI）自动执行。
- **坑账**：①种子前必须等根挂载——goto 返回早于 effects，`__wsTestHooks` 未注册时 optional chaining 静默空转（曾三次 1.0m 超时）；②三项目共用快照文件名会互相覆盖，键必须带项目前缀；③beforeAll 自建上下文与 fixture page 行为有差，spec 结构对齐 smoke.spec 才稳。

## 死类清退（拍板①冗余清退的姊妹批）

- 工具：`reports/layer-tools/purge-dead-css.mjs`（postcss AST 版；v1 自研括号遍历器曾误吞 index.css 令牌面 226 行——git checkout 回滚后弃用，教训：Tailwind 指令文件不得进产品 CSS 清退面，工具用 AST 不用手写解析）。
- 判定口径：15 个产品 CSS 的类名 ↔ TS/tests 消费宇宙交叉核对；动态豁免 = AGENTS 名单（mobile-view-/language-/permission-）+ TransitionGroup 库挂的 voice-member-* + 模板字面量前缀（含 `` `x-${` `` 形态）。
- 结果：规则级移除 51 条，定点重扫归零；`language-*`/`permission-*`/`mobile-view-*`/`voice-member-*`/`size-*` 按豁免/前缀保留在 KEEP。**金样零漂移**（清退前后快照逐字节一致）即「删干净且没删多」的最硬证明。
