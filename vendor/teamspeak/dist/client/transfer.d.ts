/**
 * File transfer data.
 *
 * Negotiating a transfer is a command (`initFileUpload`, `initFileDownload`);
 * the bytes then go over a separate TCP connection to the server's file
 * transfer port, opened with the key the negotiation returned.
 */
import { Writable, type Duplex, type Readable } from "node:stream";
import type { FileUploadInfo, FileDownloadInfo } from "@honeybbq/teamspeak";
import type { FileTransferSocketFactory } from "./types.js";
import { FileTransferError } from "./errors.js";
/**
 * Whether `error` is a dial that never got a connection: refused, unreachable,
 * or timed out while connecting. Not one the caller's signal or the idle limit
 * ended, nor one after the connection opened, where the key may have been
 * written and the server may hold or have dropped the transfer.
 */
export declare function failedToConnect(error: unknown): boolean;
/** The values of the table below, before freezing. */
declare const fileTransferStageValues: {
    /** Reaching the transfer port, before the key is written. */
    readonly Dial: "dial";
    /** After the connection opened, while the key or the file moved. */
    readonly Transfer: "transfer";
};
/** Where a failed transfer failed. */
export declare const FileTransferStage: typeof fileTransferStageValues;
/** One of {@link FileTransferStage}. */
export type FileTransferStage = (typeof FileTransferStage)[keyof typeof FileTransferStage];
/** The file transfer port is about to be dialled. */
export interface FileTransferDialStartInfo {
    /** The `host:port` being dialled. */
    readonly addr: string;
}
/** The connection is open and the transfer key has been sent. */
export interface FileTransferDialDoneInfo {
    /** The `host:port` dialled. */
    readonly addr: string;
    /** The local socket's `host:port`; empty when the socket does not say. */
    readonly localAddr: string;
    /** Milliseconds since `dialStart`. */
    readonly durationMs: number;
}
/** Data has moved. */
export interface FileTransferProgressInfo {
    /** The bytes moved so far. */
    readonly bytes: number;
    /** The bytes the transfer will move, as the negotiation fixed them. */
    readonly total: number;
}
/** The transfer succeeded. */
export interface FileTransferDoneInfo {
    /** The bytes moved. */
    readonly bytes: number;
    /** Milliseconds since `dialStart`. */
    readonly durationMs: number;
}
/** The transfer failed. */
export interface FileTransferFailedInfo {
    /** Why: the error the transfer function rejects with. */
    readonly error: unknown;
    /** The bytes moved before it failed. */
    readonly bytes: number;
    /** Milliseconds since `dialStart`. */
    readonly durationMs: number;
    /** Whether the failure came while dialling or while the data moved. */
    readonly stage: FileTransferStage;
}
/**
 * Hooks that observe one file transfer. Every hook is optional, and none ever
 * sees the transfer key.
 *
 * A hook runs synchronously on the task doing the transfer, and its return
 * value is ignored: a returned promise is not awaited. A hook that throws, or
 * whose promise rejects, is reported the way a throwing event listener is, and
 * the transfer goes on. Keep hooks quick.
 *
 * A call of `uploadFileData` or `downloadFileData` ends with exactly one of
 * `done` and `failed`; `dialFileTransfer` on its own reports `dialStart`, then
 * `dialDone` or `failed` with the stage `"dial"`.
 */
export interface FileTransferTrace {
    /** Before the file transfer port is dialled. */
    readonly dialStart?: (info: FileTransferDialStartInfo) => void;
    /** When the connection is open and the transfer key is sent. */
    readonly dialDone?: (info: FileTransferDialDoneInfo) => void;
    /** While data moves, at most once per 64 KiB, and once more at the end with the final count. */
    readonly progress?: (info: FileTransferProgressInfo) => void;
    /** When the transfer function is about to resolve. */
    readonly done?: (info: FileTransferDoneInfo) => void;
    /** When the transfer function is about to reject, a failed dial included. */
    readonly failed?: (info: FileTransferFailedInfo) => void;
}
/** Options for a file transfer. */
export interface FileTransferOptions {
    /** Abandons the transfer; it then rejects with the signal's reason. */
    readonly signal?: AbortSignal | undefined;
    /**
     * Opens the connection instead of a direct TCP dial, to route the transfer
     * through a proxy or tunnel.
     */
    readonly socketFactory?: FileTransferSocketFactory | undefined;
    /**
     * Hooks called at each milestone of this transfer. The object is copied when
     * the call starts. See {@link FileTransferTrace}.
     */
    readonly trace?: FileTransferTrace | undefined;
    /**
     * The longest, in milliseconds, the transfer may go without moving a byte,
     * the write of the transfer key included. When it passes, the transfer
     * rejects with a {@link FileTransferError} whose `cause` is a `TimeoutError`
     * and the connection is destroyed. `undefined` means the default, 30 000;
     * `0` turns the limit off.
     */
    readonly idleTimeoutMs?: number | undefined;
}
/**
 * Open a connection to the file transfer port and send the transfer key.
 * The caller owns the returned stream and must end or destroy it.
 */
export declare function dialFileTransfer(host: string, port: number, key: string, options?: FileTransferOptions): Promise<Duplex>;
/**
 * Upload `data` over a negotiated transfer. `data` is the file from
 * `info.seekPosition` on, and must give exactly the bytes left of
 * `info.size`: a stream that gives fewer or more fails the transfer.
 *
 * Resolves once the server has closed the transfer connection, which it does
 * when it has the file. Measured on TeamSpeak 3 3.13.8 and TeamSpeak 6 6.0.0:
 * the server closes about 200 ms after the last byte of a 100 000-byte file,
 * and at once after the declared size when more is sent. A connection that
 * closes before every byte is written, or that stays open for the idle limit,
 * fails the transfer.
 *
 * A close after the last byte is not proof that the file is stored: the server
 * sends nothing on the transfer connection, and over the voice protocol its
 * `notifystatusfiletransfer` comes only for a failure (2066 canceled, 2063
 * lost connection, 2052 more than declared), after the close, never for
 * success; over ServerQuery nothing comes. `uploadFile` therefore asks the
 * server for the file's size with `ftgetfileinfo` before it resolves.
 */
export declare function uploadFileData(host: string, info: FileUploadInfo, data: Readable, options?: FileTransferOptions): Promise<void>;
/**
 * Download a negotiated transfer into `dest`. Resolves once the file is
 * written; `dest` is not ended, so it may take another download.
 *
 * A download from `info.seekPosition` brings the bytes from there to the end
 * of the file: measured on TeamSpeak 3 3.13.8 and TeamSpeak 6 6.0.0, a
 * `seekpos` of 40 000 on a 100 000-byte file is answered with the whole size
 * and then 60 000 bytes.
 */
export declare function downloadFileData(host: string, info: FileDownloadInfo, dest: Writable, options?: FileTransferOptions): Promise<void>;
export { FileTransferError };
//# sourceMappingURL=transfer.d.ts.map