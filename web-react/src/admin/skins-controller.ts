import { createStore } from "zustand/vanilla";

import { BUILTIN_SKIN_CATALOG, type SkinCatalogEntry } from "@/services/skin-catalog";
import type { AdminApi } from "@/services/admin-api";
import { createAdminRequests } from "@/services/admin-requests";

export interface SkinsStore {
  entries: SkinCatalogEntry[];
  loading: boolean;
  uploading: boolean;
  defaultSaving: boolean;
  removingId: string;
  updatingId: string;
  defaultId: string;
  error: string;
  notice: string;
}

interface Options {
  api: AdminApi;
  report(error: unknown, upload?: boolean): void;
  tr(key: string, vars?: Record<string, string | number>): string;
  confirmReplace(id: string): boolean;
  confirmRemove(name: string, id: string): boolean;
}

export function selectSkinBusy(state: SkinsStore): boolean {
  return state.uploading || state.defaultSaving || Boolean(state.removingId || state.updatingId);
}

export function selectEnabledSkinEntries(state: SkinsStore): SkinCatalogEntry[] {
  return state.entries.filter((skin) => skin.builtIn || skin.enabled !== false);
}

export function createSkinsController(options: Options) {
  const requests = createAdminRequests();
  const store = createStore<SkinsStore>(() => ({
    entries: [], loading: false, uploading: false, defaultSaving: false,
    removingId: "", updatingId: "", defaultId: "builtin.light", error: "", notice: "",
  }));
  let savedDefault = "builtin.light";

  const state = () => store.getState();
  const patch = (partial: Partial<SkinsStore>) => store.setState(partial);
  const clearTransient = () => patch({ error: "", notice: "" });

  function cancelRequests() {
    requests.reset();
    patch({ loading: false, uploading: false, defaultSaving: false, removingId: "", updatingId: "", error: "", notice: "" });
  }
  function reset() {
    cancelRequests();
    savedDefault = "builtin.light";
    patch({ entries: [], defaultId: "builtin.light" });
  }

  async function loadSkinCatalog() {
    const request = requests.begin("load");
    const selected = state().defaultId;
    patch({ loading: true, error: "" });
    try {
      const value = await options.api.skins(request.signal);
      if (!request.isCurrent()) return;
      const protectedIds = new Set(BUILTIN_SKIN_CATALOG.map((skin) => skin.id));
      patch({ entries: [...BUILTIN_SKIN_CATALOG, ...value.skins.filter((skin) => !protectedIds.has(skin.id))] });
      savedDefault = value.defaultSkinId;
      if (state().defaultId === selected) patch({ defaultId: savedDefault });
    } catch (error) {
      if (request.isCurrent()) options.report(error);
    } finally {
      if (request.isCurrent()) patch({ loading: false });
      request.finish();
    }
  }

  async function saveSkinDefault() {
    if (selectSkinBusy(state())) return;
    requests.cancel("load");
    patch({ loading: false });
    const request = requests.begin("mutation");
    const selected = state().defaultId;
    patch({ defaultSaving: true });
    clearTransient();
    try {
      const result = await options.api.setDefaultSkin(selected, request.signal);
      if (!request.isCurrent()) return;
      savedDefault = result.defaultSkinId;
      if (state().defaultId === selected) patch({ defaultId: savedDefault });
      patch({ notice: options.tr("skinDefaultSaved") });
    } catch (error) {
      if (request.isCurrent()) {
        options.report(error);
        if (state().defaultId === selected) patch({ defaultId: savedDefault });
      }
    } finally {
      if (request.isCurrent()) patch({ defaultSaving: false });
      request.finish();
    }
  }

  async function toggleSkinEnabled(skin: SkinCatalogEntry) {
    if (selectSkinBusy(state())) return;
    requests.cancel("load");
    patch({ loading: false });
    const request = requests.begin("mutation");
    const selected = state().defaultId;
    patch({ updatingId: skin.id });
    clearTransient();
    try {
      const result = await options.api.setSkinEnabled(skin.id, skin.enabled === false, request.signal);
      if (!request.isCurrent()) return;
      patch({ entries: state().entries.map((entry) => (entry.id === skin.id ? result.skin : entry)) });
      savedDefault = result.defaultSkinId;
      if (state().defaultId === selected) patch({ defaultId: savedDefault });
      patch({ notice: options.tr(result.skin.enabled === false ? "skinDisabledNotice" : "skinEnabledNotice") });
    } catch (error) {
      if (request.isCurrent()) options.report(error);
    } finally {
      if (request.isCurrent()) patch({ updatingId: "" });
      request.finish();
    }
  }

  async function uploadSkin(file: File, resetInput: () => void) {
    if (selectSkinBusy(state())) {
      resetInput();
      return;
    }
    requests.cancel("load");
    patch({ loading: false });
    const request = requests.begin("mutation");
    patch({ uploading: true });
    clearTransient();
    try {
      const result = await options.api.uploadSkin(file, (id) => options.confirmReplace(id), request.signal);
      if (!request.isCurrent() || !result) return;
      patch({ notice: options.tr("skinImported") });
      await loadSkinCatalog();
    } catch (error) {
      if (request.isCurrent()) options.report(error, true);
    } finally {
      resetInput();
      if (request.isCurrent()) patch({ uploading: false });
      request.finish();
    }
  }

  async function removeSkin(skin: SkinCatalogEntry) {
    if (selectSkinBusy(state()) || !options.confirmRemove(skin.name, skin.id)) return;
    requests.cancel("load");
    patch({ loading: false });
    const request = requests.begin("mutation");
    patch({ removingId: skin.id });
    clearTransient();
    try {
      await options.api.deleteSkin(skin.id, request.signal);
      if (!request.isCurrent()) return;
      patch({ notice: options.tr("skinRemoved") });
      await loadSkinCatalog();
    } catch (error) {
      if (request.isCurrent()) options.report(error);
    } finally {
      if (request.isCurrent()) patch({ removingId: "" });
      request.finish();
    }
  }

  return {
    store,
    setError: (message: string) => patch({ error: message }),
    setDefaultId: (id: string) => patch({ defaultId: id }),
    loadSkinCatalog,
    saveSkinDefault,
    toggleSkinEnabled,
    uploadSkin,
    removeSkin,
    cancelRequests,
    reset,
  };
}

export type SkinsController = ReturnType<typeof createSkinsController>;
