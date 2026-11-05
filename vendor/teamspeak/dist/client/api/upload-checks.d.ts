/**
 * What an upload does around its data phase: stop a transfer whose connection
 * was never made, and check what the server stored once it closed the
 * connection. Shared by the file and avatar helpers; not exported from the
 * package.
 */
import type { ChannelID, CommandExecutor, FileUploadInfo } from "@honeybbq/teamspeak";
/**
 * Runs the data phase of a transfer the server has negotiated. When it fails
 * because the connection to the file transfer port was refused or timed out,
 * nothing has reached the server, and the transfer would sit in its list until
 * it expires: stop it, as a refused `maxSize` download does. The stop is best
 * effort and never replaces the dial's error. Not sent once the connection
 * opened (the key may be written and the server may have dropped the transfer),
 * nor after `STOP_WITHIN_MS`.
 */
export declare function withDialCleanup(client: CommandExecutor, serverFileTransferID: FileUploadInfo["serverFileTransferID"], move: () => Promise<void>): Promise<void>;
/**
 * Checks that the server holds the whole file after an upload's connection
 * closed. Measured on TeamSpeak 3 3.13.8 and TeamSpeak 6 6.0.0: a completed
 * upload gets no status from the server, so a close after the last byte looks
 * the same whether the file was stored or the transfer was stopped (the voice
 * protocol reports that, 2066, only after the close), and `ftgetfileinfo`
 * already answers the final size 6 to 45 ms after the close, in every case.
 * Permissions are checked at the negotiation only, so no refusal comes later.
 *
 * A client without browse power gets 2568 for `ftgetfileinfo`: the file cannot
 * be checked, and the upload resolves on the close. Any other failure of the
 * command is thrown as it is.
 */
export declare function verifyStored(client: CommandExecutor, channelID: ChannelID, path: string, size: bigint, options: {
    readonly password?: string | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly timeoutMs?: number | undefined;
}): Promise<void>;
//# sourceMappingURL=upload-checks.d.ts.map