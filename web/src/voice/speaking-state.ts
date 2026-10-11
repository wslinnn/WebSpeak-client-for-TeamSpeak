import { reactive } from "vue";

const SPEAKING_HOLD_MS = 360;

/** Per-client "speaking now" flags with a hold window: a client stays lit for
 *  a short grace after its last voice frame so the badge does not flicker.
 *  One instance per session — never a module singleton. */
export function createSpeakingState() {
  const speakingIds = reactive(new Set<number>());
  const speakingTimers = new Map<number, ReturnType<typeof setTimeout>>();

  function markSpeaking(clientId: number): void {
    if (!clientId) return;
    speakingIds.add(clientId);
    const previous = speakingTimers.get(clientId);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      speakingIds.delete(clientId);
      speakingTimers.delete(clientId);
    }, SPEAKING_HOLD_MS);
    speakingTimers.set(clientId, timer);
  }

  function clearSpeaking(clientId: number): void {
    const timer = speakingTimers.get(clientId);
    if (timer) clearTimeout(timer);
    speakingTimers.delete(clientId);
    speakingIds.delete(clientId);
  }

  function clearSpeakingState(): void {
    for (const timer of speakingTimers.values()) clearTimeout(timer);
    speakingTimers.clear();
    speakingIds.clear();
  }

  return { speakingIds, markSpeaking, clearSpeaking, clearSpeakingState };
}
