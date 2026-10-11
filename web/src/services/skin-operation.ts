export const SKIN_LOAD_TIMEOUT_MS = 8_000;
export const SKIN_DOWNLOAD_TIMEOUT_MS = 45_000;

export interface SkinLoadOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** A deadline also covers non-abortable storage, parsing and response readers. */
export function createSkinOperation({ signal: parent, timeoutMs = SKIN_LOAD_TIMEOUT_MS }: SkinLoadOptions = {}) {
  const controller = new AbortController();
  const { signal } = controller;
  const cancel = () => controller.abort(new DOMException("Skin operation cancelled", "AbortError"));
  const parentAborted = () => controller.abort(parent?.reason);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finish = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    parent?.removeEventListener("abort", parentAborted);
  };
  signal.addEventListener("abort", finish, { once: true });
  if (parent?.aborted) parentAborted();
  else {
    parent?.addEventListener("abort", parentAborted, { once: true });
    timer = setTimeout(() => controller.abort(new DOMException("Skin loading timed out", "TimeoutError")), timeoutMs);
  }
  function check() { signal.throwIfAborted(); }
  async function wait<T>(value: PromiseLike<T>): Promise<T> {
    // Attach a rejection handler even when cancellation happened just before wait.
    return new Promise<T>((resolve, reject) => {
      const aborted = () => reject(signal.reason);
      const done = () => signal.removeEventListener("abort", aborted);
      signal.addEventListener("abort", aborted, { once: true });
      Promise.resolve(value).then(
        result => { done(); if (signal.aborted) reject(signal.reason); else resolve(result); },
        error => { done(); reject(error); },
      );
      if (signal.aborted) { done(); aborted(); }
    });
  }
  return { signal, check, wait, cancel, finish };
}

/** The activation deadline covers local work (parsing, storage, rendering);
 *  a package download scales with bandwidth instead, so it gets its own much
 *  wider budget. The child signal still retires the moment the parent
 *  operation aborts (user switched again / page closed). */
export function createDownloadSignal(parent: AbortSignal, timeoutMs = SKIN_DOWNLOAD_TIMEOUT_MS): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parent.reason);
  const timer = setTimeout(() => controller.abort(new DOMException("Skin download timed out", "TimeoutError")), timeoutMs);
  if (parent.aborted) abortFromParent();
  else parent.addEventListener("abort", abortFromParent, { once: true });
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      parent.removeEventListener("abort", abortFromParent);
    },
  };
}
