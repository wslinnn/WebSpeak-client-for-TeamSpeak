/** Mobile interstitial gate: phones get a recommendation page (use a PC, or
 *  grab the Android client) instead of the phone-browser experience the
 *  project no longer invests in. The visitor's choice is remembered: tablets
 *  (iPads included) and desktop-sized windows are never gated. */

const CHOICE_STORAGE_KEY = "webspeak:mobile-gate";
const PHONE_VIEWPORT_MAX = 740;

export interface MobileGateSignals {
  userAgent: string;
  maxTouchPoints: number;
  coarsePointer: boolean;
  viewportWidth: number;
  storedChoice: string | null;
}

export function readMobileGateChoice(): string | null {
  try {
    return localStorage.getItem(CHOICE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeMobileGateChoice(choice: "continue"): void {
  try {
    localStorage.setItem(CHOICE_STORAGE_KEY, choice);
  } catch {
    // Without storage the gate simply reappears on the next visit.
  }
}

export function readMobileGateSignals(target: {
  navigator?: { userAgent?: string; maxTouchPoints?: number };
  matchMedia?: (query: string) => { matches: boolean };
  innerWidth?: number;
}): MobileGateSignals {
  return {
    userAgent: target.navigator?.userAgent ?? "",
    maxTouchPoints: target.navigator?.maxTouchPoints ?? 0,
    coarsePointer: Boolean(target.matchMedia?.("(pointer: coarse)")?.matches),
    viewportWidth: target.innerWidth ?? 0,
    storedChoice: readMobileGateChoice(),
  };
}

/** Pure decision core: only phone-class devices on a phone-sized, touch screen
 *  see the gate. iPads (including iPadOS reporting a Macintosh UA) and Android
 *  tablets keep the full site, and a one-time "continue" choice wins forever. */
export function shouldShowMobileGate(signals: MobileGateSignals): boolean {
  if (signals.storedChoice === "continue") return false;
  const ua = signals.userAgent;
  const isTablet = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && signals.maxTouchPoints > 1) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
  if (isTablet) return false;
  if (!/Android.*Mobile|iPhone|iPod/i.test(ua)) return false;
  if (!signals.coarsePointer) return false;
  return signals.viewportWidth <= PHONE_VIEWPORT_MAX;
}
