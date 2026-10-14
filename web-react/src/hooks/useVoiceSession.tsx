import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createVoiceSessionController, type VoiceSessionController, type VoiceSessionView } from "../voice/session-controller";

const VoiceSessionContext = createContext<VoiceSessionController | null>(null);

/** One controller per app root; dispose() cancels reconnect timers on unmount. */
export function VoiceSessionProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(createVoiceSessionController);
  useEffect(() => () => controller.dispose(), [controller]);
  return <VoiceSessionContext.Provider value={controller}>{children}</VoiceSessionContext.Provider>;
}

export function useVoiceSession(): VoiceSessionController {
  const controller = useContext(VoiceSessionContext);
  if (!controller) throw new Error("useVoiceSession must be used within <VoiceSessionProvider>");
  return controller;
}

/** Subscribe to the view snapshot. Selectors must return primitives or stable
 *  references — zustand v5 compares with Object.is, and a fresh object per
 *  call re-renders forever (use useShallow for composite picks). */
export function useVoiceView<T>(selector: (view: VoiceSessionView) => T): T {
  return useStore(useVoiceSession().store, selector);
}
