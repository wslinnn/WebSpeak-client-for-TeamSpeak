import type { ClientVersion } from "@honeybbq/teamspeak";
import type { ClientInternals } from "./client.js";
/** Handle the `clientinitiv` message (P-256 based crypto path). */
export declare function handleHandshakeInitIV(client: ClientInternals, params: Record<string, string>): void;
/** Handle the `initivexpand2` message (Ed25519 / TS3 crypto path). */
export declare function handleHandshakeExpand2(client: ClientInternals, params: Record<string, string>): void;
/** Handle `initserver` — marks the client as connected. */
export declare function handleInitServer(client: ClientInternals, params: Record<string, string>): void;
/**
 * Encode a password field for the command protocol.
 *
 * TeamSpeak expects password fields as base64(sha1(password)) — server and
 * channel passwords during the handshake, the `clientmove` channel password,
 * and the `cpw` field of the file transfer commands. Sending the plain text
 * instead makes the server reject correct passwords with error 781.
 */
export declare function prepareClientPassword(password: string): string;
/**
 * The version `clientinit` sends unless the `version` option says otherwise.
 *
 * A literal on purpose: `@honeybbq/teamspeak/versions` holds over a thousand
 * constants, and the client must not load them. A test holds this equal to the
 * table's `Windows_3_X_X_5680278000`.
 */
export declare const defaultClientVersion: ClientVersion;
export declare function sendClientInit(client: ClientInternals): void;
//# sourceMappingURL=handshake.d.ts.map