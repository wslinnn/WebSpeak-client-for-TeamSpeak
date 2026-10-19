import { WebSocket } from "ws";
import { clientConnectionFailureCode, type WebSpeakError } from "../../errors.js";
import type { ServerMessage } from "../../shared/server-messages.js";
import type { ConnectionState, SessionTeardownReason } from "../session-manager.js";
import type { VoiceBridgeOptions, WebClientEntry } from "./types.js";
import { notePasswordFailure } from "./connection-admission.js";
import { publicFailureDetail } from "./connection-request.js";

interface ConnectionFailureHost {
  entryId: string;
  entry: WebClientEntry;
  session: { readonly state: ConnectionState; transition(next: ConnectionState): void };
  options: VoiceBridgeOptions;
  targetKey: string;
  serverPassword: string;
  sendJson: (message: ServerMessage) => void;
  ws: WebSocket;
  teardown: (entryId: string, reason: SessionTeardownReason) => Promise<void>;
}

/** Terminal failure reporting for both the first connect and the reconnect
 *  loop. Structured failures are sent before the socket closes because some
 *  browsers and reverse proxies drop a WebSocket close reason, which would
 *  otherwise collapse every failure into a generic message. */
export function createConnectionFailureReporter(host: ConnectionFailureHost) {
  const clearReconnectTimer = () => {
    if (!host.entry.reconnectTimer) return;
    clearTimeout(host.entry.reconnectTimer);
    host.entry.reconnectTimer = null;
  };

  const failConnect = (normalized: WebSpeakError) => {
    // A dead transport can report itself twice -- once as a `disconnected`
    // event and once as a rejected `connect()`. Report and tear down once.
    if (host.session.state === "failed" || host.session.state === "disconnecting" || host.session.state === "idle") return;
    clearReconnectTimer();
    try {
      host.session.transition("failed");
    } catch { /* teardown below remains authoritative */ }
    const failureCode = clientConnectionFailureCode(normalized, host.serverPassword);
    const failureDetail = publicFailureDetail(normalized);
    host.entry.connectionFailureCode = failureCode;
    host.sendJson({ type: "connectionFailed", code: failureCode, ...(failureDetail ? { detail: failureDetail } : {}) });
    if (host.ws.readyState === WebSocket.OPEN) host.ws.close(4003, failureCode);
    void host.teardown(host.entryId, "teamSpeak-connect-failed");
  };

  /** A reconnect attempt that can no longer recover: the browser keeps its
   *  socket and learns the reason through `reconnectFailed`. */
  const failReconnect = (normalized: WebSpeakError) => {
    clearReconnectTimer();
    try {
      if (host.session.state !== "disconnecting" && host.session.state !== "idle") host.session.transition("failed");
    } catch { /* teardown below remains authoritative */ }
    const failureCode = clientConnectionFailureCode(normalized, host.serverPassword);
    const failureDetail = publicFailureDetail(normalized);
    host.entry.connectionFailureCode = failureCode;
    notePasswordFailure(host.options, host.targetKey, failureCode);
    host.sendJson({ type: "reconnectFailed", code: failureCode, ...(failureDetail ? { detail: failureDetail } : {}) });
    void host.teardown(host.entryId, "teamSpeak-connect-failed");
  };

  return { failConnect, failReconnect };
}
