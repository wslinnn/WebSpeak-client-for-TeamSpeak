import type { StoreApi } from "zustand";

import { extractIdentityNickname, IdentityImportError, importIdentityText, exportTeamSpeakIdentity } from "@/services/identity-import";

import type { HomeStore } from "./home-store";

interface Options {
  store: StoreApi<HomeStore>;
  showToast(message: string, tone?: "info" | "warn"): void;
  t(key: string): string;
  parse?(text: string): Promise<string>;
  serialize?(material: string, nickname: string): Promise<string>;
}

/** 身份对话框控制器（旧 useWebClientIdentity 平价）：只有最新动作生效的代际纪律、
 *  导出 URL 生命周期、启动恢复不覆盖更新的导入。状态片在 home-store.identityDialog。 */
export function createHomeIdentity(options: Options) {
  const parse = options.parse ?? importIdentityText;
  const serialize = options.serialize ?? exportTeamSpeakIdentity;
  let generation = 0;
  let exportGeneration = 0;
  let identityRevision = 0;
  let disposed = false;
  const downloads = new Map<string, ReturnType<typeof setTimeout> | undefined>();

  const state = () => options.store.getState();
  const patchDialog = (partial: Partial<HomeStore["identityDialog"]>) =>
    options.store.setState({ identityDialog: { ...state().identityDialog, ...partial } });
  const isCurrent = (operation: number) => !disposed && state().identityDialog.open && operation === generation;

  function invalidate() {
    generation++;
    patchDialog({ reading: false, busy: false });
  }
  function setText(text: string) {
    // 旧 watch(text) flush:sync 平价：编辑作废在途读取并清错误。
    invalidate();
    patchDialog({ text, error: "" });
  }
  /** 身份材料/记住偏好被任何来源改动时作废在途导出（旧 watch 平价）。 */
  function onIdentityChanged() {
    identityRevision++;
    exportGeneration++;
    patchDialog({ exporting: false });
  }
  let lastMaterial = options.store.getState().identityMaterial;
  let lastRemember = options.store.getState().rememberIdentity;
  const unsubscribeIdentity = options.store.subscribe((snapshot) => {
    if (snapshot.identityMaterial !== lastMaterial || snapshot.rememberIdentity !== lastRemember) {
      lastMaterial = snapshot.identityMaterial;
      lastRemember = snapshot.rememberIdentity;
      onIdentityChanged();
    }
  });

  function show() {
    if (disposed || state().identityDialog.busy) return;
    invalidate();
    patchDialog({ text: "", error: "", open: true });
  }
  function close() {
    if (state().identityDialog.busy) return;
    invalidate();
    patchDialog({ open: false });
  }
  function reset() {
    invalidate();
    identityRevision++;
    exportGeneration++;
    patchDialog({ exporting: false, open: false, text: "", error: "" });
    for (const url of downloads.keys()) releaseDownload(url);
  }

  async function readFile(file?: Pick<File, "size" | "arrayBuffer">) {
    const dialog = state().identityDialog;
    if (!file || disposed || !dialog.open || dialog.busy) return;
    invalidate();
    const operation = generation;
    patchDialog({ error: "" });
    if (file.size > 128 * 1024) {
      patchDialog({ error: options.t("identityImportErrorTooLarge") });
      return;
    }
    patchDialog({ reading: true });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isCurrent(operation)) return;
      let encoding = "utf-8";
      if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
      else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
      const text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      patchDialog({ text, error: text.trim() ? "" : options.t("identityImportErrorEmpty") });
    } catch {
      if (isCurrent(operation)) patchDialog({ error: options.t("identityImportErrorMalformed") });
    } finally {
      if (isCurrent(operation)) patchDialog({ reading: false });
    }
  }

  async function submit() {
    const dialog = state().identityDialog;
    if (disposed || !dialog.open || dialog.busy || dialog.reading) return;
    invalidate();
    const operation = generation;
    patchDialog({ busy: true, error: "" });
    try {
      const material = await parse(dialog.text);
      if (!isCurrent(operation)) return;
      invalidate();
      options.store.setState({ rememberIdentity: true, identityMaterial: material });
      // 导入的身份把它的名字一起带来：INI 昵称成为 join 表单昵称（WebSpeak/SDK
      // 材料不带昵称，保留用户输入）。
      const importedNickname = extractIdentityNickname(dialog.text);
      if (importedNickname) options.store.setState({ nickname: importedNickname });
      patchDialog({ open: false, text: "" });
      options.showToast(options.t("identityImportSuccess"));
    } catch (failure) {
      if (!isCurrent(operation)) return;
      const code = failure instanceof IdentityImportError ? failure.code : "invalid-key";
      patchDialog({ error: options.t(({
        empty: "identityImportErrorEmpty", "too-large": "identityImportErrorTooLarge",
        multiple: "identityImportErrorMultiple", malformed: "identityImportErrorMalformed",
        "invalid-key": "identityImportErrorInvalidKey", unsupported: "identityImportErrorUnsupported",
      } as const)[code]) });
    } finally {
      if (isCurrent(operation)) patchDialog({ busy: false });
    }
  }

  async function exportIdentity() {
    const dialog = state().identityDialog;
    if (disposed || dialog.exporting || !state().rememberIdentity || !state().identityMaterial) return;
    const operation = ++exportGeneration;
    const current = () => !disposed && operation === exportGeneration;
    patchDialog({ exporting: true });
    let url: string | undefined;
    let link: HTMLAnchorElement | undefined;
    try {
      const content = await serialize(state().identityMaterial, state().nickname);
      if (!current()) return;
      url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
      downloads.set(url, undefined);
      link = document.createElement("a");
      link.href = url;
      link.download = "webspeak-identity.ini";
      document.body.append(link);
      link.click();
      const downloadUrl = url;
      downloads.set(url, setTimeout(() => releaseDownload(downloadUrl), 1000));
      options.showToast(options.t("identityExportSuccess"));
    } catch {
      if (url) releaseDownload(url);
      if (current()) options.showToast(options.t("identityExportError"), "warn");
    } finally {
      try { link?.remove(); } catch { /* URL 清理与 DOM 移除互不依赖。 */ }
      if (current()) patchDialog({ exporting: false });
    }
  }

  function releaseDownload(url: string) {
    if (!downloads.has(url)) return;
    clearTimeout(downloads.get(url));
    downloads.delete(url);
    try { URL.revokeObjectURL(url); } catch { /* 继续释放其余自有 URL。 */ }
  }

  async function restore(load: () => Promise<string | null>) {
    if (disposed) return;
    const revision = ++identityRevision;
    try {
      const stored = await load();
      if (!disposed && revision === identityRevision && stored) {
        options.store.setState({ rememberIdentity: true, identityMaterial: stored });
      }
    } catch { /* 可选本地存储不能阻断新会话。 */ }
  }

  function dispose() {
    disposed = true;
    reset();
    unsubscribeIdentity();
  }

  return { setText, onIdentityChanged, show, close, reset, restore, readFile, submit, exportIdentity, dispose };
}

export type HomeIdentity = ReturnType<typeof createHomeIdentity>;
