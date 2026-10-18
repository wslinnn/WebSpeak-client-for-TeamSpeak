export type ThemeMode = "system" | "light" | "dark";

const THEME_KEY = "webspeak:theme";
const LIGHT_THEME_COLOR = "#006a64";
const DARK_THEME_COLOR = "#101918";
let activeThemeMode: ThemeMode = "system";

export function getStoredTheme(): ThemeMode {
  let value: string | null = null;
  try { value = typeof localStorage === "undefined" ? null : localStorage.getItem(THEME_KEY); }
  catch { /* A restricted browser still has a usable system theme. */ }
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

/**
 * 日/夜主题唯一通道：html[data-theme] 供管理台独立外观规则、html.dark 供
 * Tailwind dark: 变体与客户端夜间选择器（.dark .web-client …，特异性与原
 * [data-ws-skin] 形态逐档持平）。外观本身（令牌翻转、组件夜色）全部住在
 * 静态分片里，本函数不再注入任何样式元素。
 */
export function applyTheme(theme: ThemeMode): void {
  if (typeof document === "undefined") return;
  activeThemeMode = theme;
  const root = document.documentElement;
  const dark = isDarkTheme(theme);
  root.dataset.theme = theme;
  root.classList.toggle("dark", dark);
  if (root.style) root.style.colorScheme = dark ? "dark" : "light";
  if (typeof document.querySelector === "function" && typeof document.createElement === "function" && document.head) {
    let themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!themeColor) {
      themeColor = document.createElement("meta");
      themeColor.name = "theme-color";
      document.head.append(themeColor);
    }
    themeColor.content = dark ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
  }
  notifyThemeListeners();
}

export function saveTheme(theme: ThemeMode): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

export function isDarkTheme(theme: ThemeMode): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}

export function getActiveTheme(): ThemeMode {
  return activeThemeMode;
}

type ThemeListener = () => void;
const themeListeners = new Set<ThemeListener>();

/** React 侧响应式的唯一来源：applyTheme/system 翻转后通知订阅者重新读 getActiveTheme。 */
export function subscribeTheme(listener: ThemeListener): () => void {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

function notifyThemeListeners(): void {
  for (const listener of themeListeners) listener();
}

export function nextTheme(theme: ThemeMode): ThemeMode {
  return isDarkTheme(theme) ? "light" : "dark";
}

applyTheme(getStoredTheme());

if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  const systemColorScheme = window.matchMedia("(prefers-color-scheme: dark)");
  const updateSystemSkin = () => {
    if (activeThemeMode === "system") applyTheme("system");
    else notifyThemeListeners();
  };
  if (systemColorScheme.addEventListener) systemColorScheme.addEventListener("change", updateSystemSkin);
  else systemColorScheme.addListener?.(updateSystemSkin);
}
