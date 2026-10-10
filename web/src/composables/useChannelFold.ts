import { ref, watch } from "vue";

// Per-server channel fold memory. Keys ride the webspeak: namespace like every
// other storage entry, so "clear local data" sweeps them automatically.
const FOLD_KEY_PREFIX = "webspeak:channel-folds:";

export function useChannelFold(serverKey: () => string) {
  const folded = ref<ReadonlySet<string>>(new Set());

  function read(): void {
    try {
      const raw = localStorage.getItem(FOLD_KEY_PREFIX + serverKey());
      folded.value = new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      folded.value = new Set();
    }
  }
  function persist(): void {
    try { localStorage.setItem(FOLD_KEY_PREFIX + serverKey(), JSON.stringify([...folded.value])); }
    catch { /* Optional storage. */ }
  }
  watch(serverKey, read, { immediate: true });

  function toggle(id: string): void {
    const next = new Set(folded.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    folded.value = next;
    persist();
  }
  return { folded, toggle };
}
