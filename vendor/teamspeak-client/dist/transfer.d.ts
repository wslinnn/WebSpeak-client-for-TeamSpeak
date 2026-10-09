import type { Readable, Writable } from "node:stream";
import type { FileUploadInfo, FileDownloadInfo } from "./types.js";
import { FileTransferError, FileTransferTimeoutError } from "./errors.js";
type FtNotification = FileUploadInfo | FileDownloadInfo | import("./types.js").FileTransferStatusInfo;
export declare class FileTransferTracker {
    #private;
    register(): [cftid: number, promise: Promise<FtNotification>];
    unregister(cftid: number): void;
    notify(cftid: number, value: FtNotification): void;
    reset(): void;
}
/**
 * Open a TCP connection to the TS3 file transfer port and perform the
 * ftkey handshake. The caller is responsible for closing the socket.
 */
export declare function dialFileTransfer(host: string, port: number, key: string): Promise<import("node:net").Socket>;
/** Upload data via a TS3 file transfer connection. */
export declare function uploadFileData(host: string, info: FileUploadInfo, data: Readable): Promise<void>;
/** Download data via a TS3 file transfer connection. */
export declare function downloadFileData(host: string, info: FileDownloadInfo, dest: Writable): Promise<void>;
/**
 * Build a ftinitupload command string.
 */
export declare function buildFtInitUpload(channelID: bigint, path: string, password: string, size: bigint, cftid: number, overwrite: boolean): string;
/**
 * Build a ftinitdownload command string.
 */
export declare function buildFtInitDownload(channelID: bigint, path: string, password: string, cftid: number): string;
export { FileTransferError, FileTransferTimeoutError };
//# sourceMappingURL=transfer.d.ts.map