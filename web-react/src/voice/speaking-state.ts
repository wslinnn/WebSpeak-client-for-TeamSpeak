import { createStore } from "zustand/vanilla";

const SPEAKING_HOLD_MS = 360;

export interface SpeakingStateSnapshot {
  speakingIds: Set<number>;
}

/** Per-client "speaking now" flags with a hold window: a client stays lit for
 *  a short grace after its last voice frame so the badge does not flicker.
 *  One instance per session — never a module singleton. The set is replaced
 *  (never mutated) on change so reference-based rendering sees updates. */
export function createSpeakingState() {
  const store = createStore<SpeakingStateSnapshot>(() => ({ speakingIds: new Set<number>() }));
  const speakingTimers = new Map<number, ReturnType<typeof setTimeout>>();

  function replaceSpeakingIds(update: (ids: Set<number>) => void): void {
    const next = new Set(store.getState().speakingIds);
    update(next);
    store.setState({ speakingIds: next });
  }

  function markSpeaking(clientId: number): void {
    if (!clientId) return;
    // Same client still speaking: only the hold timer resets, no state churn.
    if (!store.getState().speakingIds.has(clientId)) replaceSpeakingIds(ids => ids.add(clientId));
    const previous = speakingTimers.get(clientId);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      speakingTimers.delete(clientId);
      replaceSpeakingIds(ids => ids.delete(clientId));
    }, SPEAKING_HOLD_MS);
    speakingTimers.set(clientId, timer);
  }

  function clearSpeaking(clientId: number): void {
    const timer = speakingTimers.get(clientId);
    if (timer) clearTimeout(timer);
    speakingTimers.delete(clientId);
    if (store.getState().speakingIds.has(clientId)) replaceSpeakingIds(ids => ids.delete(clientId));
  }

  function clearSpeakingState(): void {
    for (const timer of speakingTimers.values()) clearTimeout(timer);
    speakingTimers.clear();
    store.setState({ speakingIds: new Set<number>() });
  }

  return { store, markSpeaking, clearSpeaking, clearSpeakingState };
}
