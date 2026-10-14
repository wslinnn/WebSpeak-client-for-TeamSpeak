# web-react · WebSpeak 前端（React 重写）

React 19 + Tailwind CSS 4 + shadcn/ui 重写版。**动线与规矩先读两份文档**：

- [`docs/SPEC.md`](./docs/SPEC.md) — 行为规格与平价验收基准（迁移的合同）
- [`docs/DECISIONS.md`](./docs/DECISIONS.md) — 立项拍板与门禁定版（`eslint.config.js` 即其执行体）

## 命令

```sh
npm run dev     # 开发（端口 5174，代理后端 3040）
npm run ci      # lint + test + build（提交前必过）
```

## 架构边界（ESLint 门禁强制）

- `src/services/**`、`src/voice/**` 是纯逻辑层：禁 import `react`/`react-dom`/React 版 `zustand`；需要响应式用 `zustand/vanilla`。
- 跨根依赖唯一白名单：`@shared/*` → 仓库根 `src/shared/*`（协议类型 + 运行时校验器）。
- 单文件 ≤400 行（豁免：i18n 字典、测试、`src/components/ui/**` shadcn 生成代码）。
- TSX 禁裸色值/裸字号/裸 z-index；浮层层级只走 `--ws-z-*` 阶梯语义类。
