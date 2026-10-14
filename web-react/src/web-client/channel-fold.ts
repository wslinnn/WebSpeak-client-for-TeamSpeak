import { createStore } from "zustand/vanilla";

// Per-server channel fold memory. Keys ride the webspeak: namespace like every
// other storage entry, so "clear local data" sweeps them automatically.
const FOLD_KEY_PREFIX = "webspeak:channel-folds:";

/** 每服务器频道折叠记忆（旧 useChannelFold 平价）。Vue 的 watch(serverKey, read,
 *  immediate) 显式化：视图在服务器目标变更的 effect 里调 sync(key)，折叠/展开走
 *  toggle(id)。 */
export function createChannelFold() {
  const store = createStore<{ folded: ReadonlySet<string> }>(() => ({ folded: new Set() }));
  let currentKey = "";

  function read(): void {
    try {
      const raw = localStorage.getItem(FOLD_KEY_PREFIX + currentKey);
      store.setState({ folded: new Set(raw ? (JSON.parse(raw) as string[]) : []) });
    } catch {
      store.setState({ folded: new Set() });
    }
  }
  function persist(): void {
    try {
      localStorage.setItem(FOLD_KEY_PREFIX + currentKey, JSON.stringify([...store.getState().folded]));
    } catch { /* Optional storage. */ }
  }
  function sync(serverKey: string): void {
    currentKey = serverKey;
    read();
  }
  function toggle(id: string): void {
    const next = new Set(store.getState().folded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    store.setState({ folded: next });
    persist();
  }
  return { store, sync, toggle };
}

export type ChannelFold = ReturnType<typeof createChannelFold>;
