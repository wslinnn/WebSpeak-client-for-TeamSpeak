import { createStore } from "zustand/vanilla";

import { applyTheme, getActiveTheme, getStoredTheme, isDarkTheme, saveTheme, subscribeTheme } from "@/services/theme";

export interface ThemeControllerState {
  /** 解析后的明暗态（存储值可为 system，此处始终是二值）。 */
  dark: boolean;
}

/**
 * 日/夜主题控制器：皮肤系统下架后外观只有明暗二值。html.dark 由 theme.ts
 * 维护，这里只持有 React 渲染所需的解析态并转发用户切换。
 */
export function createThemeController() {
  const store = createStore<ThemeControllerState>(() => ({
    dark: isDarkTheme(getStoredTheme()),
  }));
  let disposed = false;
  const unsubscribe = subscribeTheme(() => {
    if (disposed) return;
    store.setState({ dark: isDarkTheme(getActiveTheme()) });
  });
  function set(dark: boolean): void {
    saveTheme(dark ? "dark" : "light");
  }
  function dispose(): void {
    disposed = true;
    unsubscribe();
  }
  return { store, set, dispose };
}

export type ThemeController = ReturnType<typeof createThemeController>;

// 路由级单例：web-client 与 download 页共享同一主题状态源。
let sharedTheme: ThemeController | null = null;

export function getThemeController(): ThemeController {
  sharedTheme ??= createThemeController();
  return sharedTheme;
}

/** 模块加载即对齐一次（旧 skin-controller.initialize 的主题职责收编）：系统
 *  跟随模式下 OS 翻转时 store 跟进。 */
applyTheme(getStoredTheme());
