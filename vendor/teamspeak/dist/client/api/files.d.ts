/**
 * One-call file transfers: negotiate the transfer, move the bytes, and return.
 *
 * `initFileUpload` and `uploadFileData` (and the download twins) are the two
 * halves of a transfer; these run both, over the connection that sends the
 * commands. That is a voice `Client`, or a `QueryClient` over raw TCP or SSH:
 * measured on TeamSpeak 3 3.13.8 (raw TCP, SSH, voice) and TeamSpeak 6
 * beta13.1 (SSH, voice), the key a query connection negotiates opens the same
 * file transfer port a voice client's does. WebQuery refuses every file command
 * (error 5120), on both servers.
 */
import { Readable, Writable } from "node:stream";
import type { ChannelID, CommandExecutor, FileDownloadOptions, FileUploadOptions } from "@honeybbq/teamspeak";
import type { FileTransferOptions } from "../transfer.js";
/**
 * How {@link uploadFile} negotiates and moves the file: the options of
 * `initFileUpload` and those of `uploadFileData`. `signal` and `timeoutMs`
 * apply to the negotiation, and the signal to the transfer too.
 */
export interface UploadFileOptions extends FileUploadOptions, FileTransferOptions {
    /**
     * The host of the file transfer port. A voice client sends to the host it
     * connected to, so it needs none; any other connection must name it. A host
     * given here wins over the client's own, and so does `socketFactory`.
     */
    readonly host?: string | undefined;
    /**
     * The size in bytes of a stream passed as the data, which the server needs
     * before it takes the file. Required for a `Readable`; for bytes it is their
     * length, and a different value here is refused. A stream that gives fewer
     * or more bytes fails the upload.
     */
    readonly size?: bigint | number | undefined;
}
/**
 * How {@link downloadFile} negotiates and moves the file. With a
 * `seekPosition` the bytes are the file's from there to its end.
 */
export interface DownloadFileOptions extends FileDownloadOptions, FileTransferOptions {
    /** The host of the file transfer port, as for {@link UploadFileOptions}. */
    readonly host?: string | undefined;
    /**
     * Write the file into this stream instead of returning its bytes. The stream
     * is neither ended nor destroyed, as for `downloadFileData`, so it may take
     * several downloads; a failed transfer still rejects the call.
     */
    readonly dest?: Writable | undefined;
    /**
     * The most bytes to hold in memory when no `dest` is given; 268435456
     * (256 MiB) by default. A larger download is refused with a
     * {@link FileTransferError} before any byte is read, and the transfer the
     * server negotiated is stopped.
     */
    readonly maxSize?: number | undefined;
}
/**
 * Upload a file into a channel's file area: negotiate the transfer
 * (`initFileUpload`) and send the bytes (`uploadFileData`), in one call.
 *
 * `data` is the bytes, or a `Readable` with `options.size` the number of bytes
 * it will give. It resolves once the server has closed the transfer
 * connection and, by `ftgetfileinfo` (one more command), holds a file of
 * exactly that size: the server does not say whether it stored a file, so a
 * close alone could be a transfer someone stopped. A size that differs, or a
 * file that is not there, fails the call with a {@link FileTransferError}; a
 * client with no browse power cannot ask (2568) and resolves on the close. A
 * stream that gives fewer or more bytes than `size` fails the call, and the
 * connection is closed. When the connection to the file transfer port is
 * refused or times out, the negotiated transfer is stopped on the server (else
 * it lingers in `ftlist` for about 10 seconds), as it is for `downloadFile`.
 *
 * With `resume`, `data` is still the whole file: the server says how much it
 * already holds from an interrupted upload (a file that is not there is
 * refused with 2054), and only the rest is sent; `overwrite` cannot go with it
 * (2056). An existing file is not replaced unless `overwrite` is set, and
 * the directory the file goes in must exist (a missing one is refused with
 * 2054, invalid file path): make it with `createDirectory` first. A refusal of
 * the negotiation is thrown as the ServerError it is, before anything is sent;
 * a failure of the connection to the file transfer port is a
 * {@link FileTransferError}.
 *
 * Over a voice `Client` the bytes go through its own transfer sockets and to the
 * host it connected to. Over any other connection, such as a `QueryClient`,
 * name the host of the file transfer port in `options.host`.
 */
export declare function uploadFile(client: CommandExecutor, channelID: ChannelID, path: string, data: Uint8Array | Readable, options?: UploadFileOptions): Promise<void>;
/**
 * Download a file from a channel's file area into memory: negotiate the
 * transfer (`initFileDownload`) and read the bytes (`downloadFileData`), in one
 * call. With `options.dest` the bytes go into that stream instead and nothing
 * is held, which is the way to fetch a large file.
 *
 * With `seekPosition` the bytes are the file's from there to its end, which is
 * how to resume a partial download: append them to what was already fetched.
 *
 * More than `maxSize` bytes (256 MiB unless set) is refused when no `dest` is
 * given, and the transfer the server negotiated is stopped.
 * A file that is not there is the ServerError of the negotiation: 2051 on TS3
 * 3.13.8 and TS6 beta13.1. A path that names a directory is not refused by the
 * server: it announces a size and sends nothing, so the call rejects with a
 * {@link FileTransferError} for the bytes that never came.
 *
 * Over a voice `Client` the bytes come through its own transfer sockets from
 * the host it connected to. Over any other connection, name the host of the
 * file transfer port in `options.host`.
 */
export declare function downloadFile(client: CommandExecutor, channelID: ChannelID, path: string, options: DownloadFileOptions & {
    readonly dest: Writable;
}): Promise<void>;
export declare function downloadFile(client: CommandExecutor, channelID: ChannelID, path: string, options?: DownloadFileOptions): Promise<Uint8Array>;
//# sourceMappingURL=files.d.ts.map