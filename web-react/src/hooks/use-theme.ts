import { useSyncExternalStore } from "react";
import { getActiveTheme, subscribeTheme, type ThemeMode } from "@/services/theme";

// theme.ts（服务层）持有主题状态与 DOM 契约；此 hook 只是把它的订阅接进 React。
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribeTheme, getActiveTheme);
}
