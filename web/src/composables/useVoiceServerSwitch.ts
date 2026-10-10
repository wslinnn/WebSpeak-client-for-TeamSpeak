import { computed, ref, watch } from "vue";

// In-voice server switching keeps the voice shell mounted while the new join
// is in flight, so the user watches a status banner instead of a join-form
// flash. This machine owns the pending/failed banner pair and its safety
// timer; the view feeds it lifecycle events (begin, error, connect, leave).
const SWITCH_SAFETY_TIMEOUT_MS = 20_000;
// Server password prompts are owned by the server password dialog: a switch
// stays pending while the dialog is up and resolves through connect or cancel.
const PASSWORD_DIALOG_CODES = new Set(["SERVER_PASSWORD_REQUIRED", "INVALID_SERVER_PASSWORD"]);

export function useVoiceServerSwitch(errorCode: () => string) {
  const pending = ref<string | null>(null);
  const failed = ref<string | null>(null);
  const active = computed(() => Boolean(pending.value || failed.value));
  let safetyTimer: ReturnType<typeof setTimeout> | undefined;

  function clearSafetyTimer(): void {
    if (safetyTimer !== undefined) clearTimeout(safetyTimer);
    safetyTimer = undefined;
  }
  // Idempotent: an idle banner (or an already failed one) stays untouched.
  function fail(): void {
    if (!pending.value) return;
    clearSafetyTimer();
    failed.value = pending.value;
    pending.value = null;
  }
  function begin(name: string): void {
    clearSafetyTimer();
    failed.value = null;
    pending.value = name;
    // Safety net: a gateway that never answers must not hold the shell hostage.
    safetyTimer = setTimeout(fail, SWITCH_SAFETY_TIMEOUT_MS);
  }
  // A terminal event (connected to the new server, or leaving the room) ends
  // the switch; a failure banner from an earlier attempt never survives it.
  function settle(): void {
    clearSafetyTimer();
    pending.value = null;
    failed.value = null;
  }
  watch(errorCode, (code) => {
    if (!code || PASSWORD_DIALOG_CODES.has(code)) return;
    fail();
  });
  return { pending, failed, active, begin, fail, settle };
}
