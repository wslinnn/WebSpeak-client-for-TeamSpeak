import type { Client } from "./client.js";
/** Handle the `clientinitiv` message (P-256 based crypto path). */
export declare function handleHandshakeInitIV(client: Client, params: Record<string, string>): void;
/** Handle the `initivexpand2` message (Ed25519 / TS3 crypto path). */
export declare function handleHandshakeExpand2(client: Client, params: Record<string, string>): void;
/** Handle `initserver` — marks the client as connected. */
export declare function handleInitServer(client: Client, params: Record<string, string>): void;
export declare function sendClientInit(client: Client): void;
//# sourceMappingURL=handshake.d.ts.map