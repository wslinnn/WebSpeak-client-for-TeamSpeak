import { useEffect, useState, type ReactNode } from "react";

import { createVoiceSessionController, VoiceSessionContext } from "./useVoiceSession";

/** One controller per app root; dispose() cancels reconnect timers on unmount.
 *  组件单独成文件：react-refresh 要求组件导出与 hooks 导出分居。 */
export function VoiceSessionProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(createVoiceSessionController);
  useEffect(() => () => controller.dispose(), [controller]);
  return <VoiceSessionContext.Provider value={controller}>{children}</VoiceSessionContext.Provider>;
}
