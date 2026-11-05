/**
 * Diagnostics channels: the SDK's tracing points, for an application or an
 * APM agent (OpenTelemetry instruments `diagnostics_channel` directly) to
 * subscribe to.
 *
 * A library does not decide where its traces go, so the SDK publishes them
 * here, and with no subscriber a channel costs a property read.
 *
 * Messages carry the command's name, never its parameters: those hold
 * password hashes, which the server accepts as passwords, and privilege keys.
 *
 * ```ts
 * import { tracingChannel } from "node:diagnostics_channel";
 *
 * tracingChannel("honeybbq:teamspeak:command").subscribe({
 *   start: ({ command }) => console.time(command),
 *   asyncEnd: ({ command }) => console.timeEnd(command),
 *   error: ({ command, error }) => console.error(command, error),
 * });
 * ```
 */
import { channel, tracingChannel, } from "node:diagnostics_channel";
/**
 * Traces every command with an answer: `start` when it is sent, `asyncEnd`
 * when its answer arrives, `error` when it fails.
 */
export const commandChannel = tracingChannel("honeybbq:teamspeak:command");
/** Publishes every command the server sends. */
export const incomingChannel = channel("honeybbq:teamspeak:incoming");
//# sourceMappingURL=diagnostics.js.map