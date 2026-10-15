import { createStore } from "zustand/vanilla";

import { listInstalledSkins, loadLocalPreferences, saveLocalPreferences } from "@/services/local-persistence";
import { BUILTIN_SKIN_CATALOG, getPublicDefaultSkinId, isPublicSkinEnabled, listPublicSkins, onSkinDirectoryError, type SkinCatalogEntry } from "@/services/skin-catalog";
import { activateSkin, BUILTIN_DARK_SKIN, BUILTIN_LIGHT_SKIN, clearCustomSkinStyle, getStoredSkinId } from "@/services/skin-runtime";
import { createSkinOperation } from "@/services/skin-operation";
import { getStoredTheme, isDarkTheme, saveTheme, type ThemeMode } from "@/services/theme";
import type { InstalledSkin } from "@/services/skin-pack";

const readChoice = (): string | null => {
  try { return localStorage.getItem("webspeak:skin-choice"); } catch { return null; }
};
const builtin = (id: string) => id === BUILTIN_LIGHT_SKIN || id === BUILTIN_DARK_SKIN;
const fallbackId = () => isDarkTheme(getStoredTheme()) ? BUILTIN_DARK_SKIN : BUILTIN_LIGHT_SKIN;

export interface SkinControllerState {
  activeSkin: InstalledSkin | null;
  activeSkinId: string;
  skinReady: boolean;
  installedSkins: InstalledSkin[];
  catalogSkins: SkinCatalogEntry[];
  /** A load failure forced the builtin fallback: say why instead of silently
   *  showing the wrong appearance. */
  recoveryNotice: boolean;
  /** The server-side skin directory could not be refreshed: only built-ins
   *  are listed and the user should know that is temporary. */
  catalogUnavailableNotice: boolean;
  themeMode: ThemeMode;
}

export interface SkinControllerOptions {
  appVersion?: () => string;
  timeoutMs?: number;
}

/** Framework-free port of the old usePublicSkin composable: one owner of skin
 *  initialization, user choices and their late responses, including
 *  persistence. React binds through `useStore(controller.store)`. */
export function createSkinController(options: SkinControllerOptions = {}) {
  const store = createStore<SkinControllerState>(() => ({
    activeSkin: null,
    activeSkinId: getStoredSkinId() ?? fallbackId(),
    skinReady: Boolean(getStoredSkinId() && builtin(getStoredSkinId()!)),
    installedSkins: [],
    catalogSkins: [...BUILTIN_SKIN_CATALOG],
    recoveryNotice: false,
    catalogUnavailableNotice: false,
    themeMode: getStoredTheme(),
  }));
  let current: ReturnType<typeof createSkinOperation> | undefined;
  let disposed = false;
  const offDirectoryError = onSkinDirectoryError(() => { store.setState({ catalogUnavailableNotice: true }); });
  const owns = (operation: ReturnType<typeof createSkinOperation>) => !disposed && current === operation;
  function cancel() { current?.cancel(); current = undefined; }
  function begin() {
    cancel();
    return current = createSkinOperation({ timeoutMs: options.timeoutMs });
  }

  async function apply(id: string, operation: ReturnType<typeof createSkinOperation>, persist = true, updateTheme = false): Promise<void> {
    operation.check();
    const entry = store.getState().catalogSkins.find((skin) => skin.id === id);
    const skin = await operation.wait(activateSkin(id, entry?.version, options.appVersion?.(), { signal: operation.signal }));
    if (!owns(operation)) return;
    // activateSkin resolves null when it fell back to a builtin skin. Asking
    // for a builtin and getting null is normal; asking for a catalog skin and
    // getting null means the package failed to load — say so instead of
    // silently showing the wrong appearance.
    if (!skin && !builtin(id)) store.setState({ recoveryNotice: true });
    const activeSkinId = skin?.id ?? (builtin(id) ? id : fallbackId());
    const mode: ThemeMode = activeSkinId === BUILTIN_LIGHT_SKIN ? "light"
      : activeSkinId === BUILTIN_DARK_SKIN ? "dark" : isDarkTheme(getStoredTheme()) ? "dark" : "light";
    if (updateTheme) {
      // A custom skin owns the `data-ws-skin` namespace its css is keyed to;
      // re-applying the theme unpreserved would hand appearance back to the
      // builtin stylesheet and leave the switcher looking like a no-op.
      saveTheme(mode, builtin(activeSkinId) ? {} : { preserveCustomSkins: true });
      store.setState({ activeSkin: skin, activeSkinId, themeMode: mode });
    } else {
      // Initialization paths must not override the saved/system theme: mode is
      // derived only to persist alongside an explicit choice.
      store.setState({ activeSkin: skin, activeSkinId });
    }
    if (persist) void saveLocalPreferences({ schemaVersion: 1, skinId: activeSkinId, ...(updateTheme ? { theme: mode } : {}) }, operation.signal).catch(() => undefined);
  }

  async function recover(error: unknown, operation: ReturnType<typeof createSkinOperation>): Promise<void> {
    if (!owns(operation) || (error as { name?: string } | null)?.name === "AbortError") return;
    // Retire every stage of the old operation before installing a fallback.
    operation.cancel();
    const fallback = begin();
    try { await apply(fallbackId(), fallback, false); }
    catch { /* A newer selection or page can retire the fallback as well. */ }
    finally {
      if (owns(fallback)) {
        store.setState({ skinReady: true, recoveryNotice: true });
      }
      fallback.finish();
    }
  }

  async function initialize(): Promise<void> {
    if (disposed) return;
    const operation = begin();
    try {
      const [preferences, installed, available] = await operation.wait(Promise.all([
        loadLocalPreferences(), listInstalledSkins(), listPublicSkins({ signal: operation.signal }),
      ]));
      store.setState({ installedSkins: installed, catalogSkins: available, catalogUnavailableNotice: false });
      if (!localStorage.getItem("webspeak:theme")) {
        const mode = preferences.theme ?? store.getState().themeMode;
        saveTheme(mode);
        store.setState({ themeMode: mode });
      }
      // Only an explicit user choice overrides the instance default.
      const choice = readChoice();
      await apply(choice && isPublicSkinEnabled(choice) ? choice : getPublicDefaultSkinId(), operation);
    } catch (error) { await recover(error, operation); }
    finally { if (owns(operation)) store.setState({ skinReady: true }); operation.finish(); }
  }

  async function select(id: string): Promise<void> {
    if (disposed) return;
    const operation = begin();
    store.setState({ recoveryNotice: false });
    try {
      // The choice is only recorded once the skin actually applied: persisting
      // first would boot every later page into the same failure and fallback.
      await apply(id, operation, true, true);
      if (!owns(operation)) return;
      try { localStorage.setItem("webspeak:skin-choice", id); } catch { /* Optional storage. */ }
    } catch (error) { await recover(error, operation); }
    finally { if (owns(operation)) store.setState({ skinReady: true }); operation.finish(); }
  }

  async function reset(): Promise<void> {
    if (disposed) return;
    const operation = begin();
    store.setState({ recoveryNotice: false });
    clearCustomSkinStyle();
    const dark = isDarkTheme("system");
    store.setState({
      activeSkin: null,
      installedSkins: [],
      catalogSkins: [...BUILTIN_SKIN_CATALOG],
      themeMode: "system",
      activeSkinId: dark ? BUILTIN_DARK_SKIN : BUILTIN_LIGHT_SKIN,
      skinReady: true,
    });
    saveTheme("system");
    try {
      const available = await operation.wait(listPublicSkins({ signal: operation.signal }));
      store.setState({ catalogSkins: available, catalogUnavailableNotice: false });
    } catch { /* Reset remains usable even if refreshing the optional catalog fails. */ }
    finally { operation.finish(); }
  }

  function dispose(): void {
    disposed = true;
    cancel();
    offDirectoryError();
  }

  return { store, initialize, select, reset, cancel, dispose };
}

export type SkinController = ReturnType<typeof createSkinController>;
