// 入口图安全切片：语言类型与初始语言判定不含任何语言包数据。UI 语言已收缩为
// 中文/英文两种：zh 是编辑基准，en 必须覆盖 zh 键集（i18n-parity 钉住）；语言
// 包静态随路由 chunk 打包。历史 localStorage 里已下架语言的存储值视为未存储。
export type Language = "zh" | "en";

export function getInitialLanguage(): Language {
  const stored = localStorage.getItem("webspeak:language");
  if (stored === "zh" || stored === "en") return stored;
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh")) return "zh";
  return "en";
}
