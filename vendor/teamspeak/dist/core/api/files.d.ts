/**
 * File transfer commands.
 *
 * These are the control-plane half: they list, move and delete files, and they
 * negotiate an upload or download. The actual bytes travel over a separate TCP
 * connection to the file transfer port, which the voice client's
 * `uploadFileData` and `downloadFileData` handle.
 *
 * Every command here takes a channel password as its `password` option, in
 * cleartext: the voice client sends it as `base64(sha1(password))`, the same
 * encoding `clientmove` uses, and ServerQuery as it is. Unset, it is sent
 * empty, which is right for a channel with no password.
 */
import type { CommandExecutor, CommandOptions } from "../command/request.js";
import type { ChannelID, ClientFileTransferID, ClientID, ServerFileTransferID } from "../command/ids.js";
import type { FileDownloadInfo, FileUploadInfo } from "../types.js";
/** One entry of a directory listing, or one file's details. */
export interface FileEntry {
    /** The file or directory name. */
    readonly name: string;
    /** The size in bytes; 0 for a directory. */
    readonly size: bigint;
    /**
     * When it was last modified. TS3 sends seconds, TS6 milliseconds in a
     * listing and nanoseconds in `getFileInfo`; all are read as the same time.
     */
    readonly modifiedAt: Date | undefined;
    /**
     * Whether this is a directory. The listing sends `type=0` for a directory
     * and `type=1` for a file; `getFileInfo`'s answer carries no type, so there
     * it is always false.
     */
    readonly isDirectory: boolean;
}
/** The channel password a file command needs. */
export interface FileOptions extends CommandOptions {
    /** The channel's password, in cleartext; "" by default (`cpw`). */
    readonly password?: string | undefined;
}
/** Directory listing for one path in a channel's file area. */
export declare function listFiles(client: CommandExecutor, cid: ChannelID, path: string, options?: FileOptions): Promise<FileEntry[]>;
/** One entry of a recursive listing: what {@link listFiles} reports, with where it is. */
export interface FileTreeEntry extends FileEntry {
    /**
     * The entry's full path in the channel's file area, from its root: `/a/b.txt`
     * for the file `b.txt` in the directory `a`. A directory's path has no
     * trailing slash.
     */
    readonly path: string;
}
/** How {@link listFilesRecursive} walks the file area. */
export interface FileTreeOptions extends FileOptions {
    /**
     * How many directory levels to list, counted as `find -maxdepth` counts: 1
     * lists the starting directory only, as {@link listFiles} does; 2 also lists
     * the directories in it; and so on. 16 by default; there is no unbounded
     * walk, since every level is a round trip. A positive integer.
     */
    readonly maxDepth?: number | undefined;
}
/**
 * Every file and directory under a path in a channel's file area, in one list:
 * the entries of the directory in the order {@link listFiles} gives them, each
 * directory followed by what it holds.
 *
 * It lists one directory at a time, one command each, so a large tree costs
 * that many round trips. `maxDepth` bounds how far it goes down; a directory
 * at the bound is listed, but not entered. The options (password, signal,
 * timeoutMs) reach every command, and the first error ends the walk. An empty
 * directory has no entries, and a path that is not a directory fails as
 * {@link listFiles} does: TS3 3.13.8 answers 2052 and TS6 beta13.1 2051 for a
 * path that does not exist.
 *
 * File commands are not served over WebQuery (error 5120).
 */
export declare function listFilesRecursive(client: CommandExecutor, cid: ChannelID, path: string, options?: FileTreeOptions): Promise<FileTreeEntry[]>;
/** Size and timestamp of one file. */
export declare function getFileInfo(client: CommandExecutor, cid: ChannelID, path: string, options?: FileOptions): Promise<FileEntry>;
/**
 * Delete one or more files, in one command: each name is a row of it
 * (`name=/a|name=/b`).
 */
export declare function deleteFile(client: CommandExecutor, cid: ChannelID, paths: string | readonly string[], options?: FileOptions): Promise<void>;
/**
 * Create a directory. Its parent has to exist: measured on TS3 3.13.8 and TS6
 * beta13.1, a path whose parent is missing is refused with 2052 (file
 * input/output error), so nested directories are made one level at a time.
 */
export declare function createDirectory(client: CommandExecutor, cid: ChannelID, dirname: string, options?: FileOptions): Promise<void>;
/** Where {@link renameFile} moves a file, and the passwords it needs. */
export interface FileRenameOptions extends CommandOptions {
    /** The source channel's password, in cleartext; "" by default (`cpw`, always sent). */
    readonly password?: string | undefined;
    /**
     * Move the file into this channel's file area; unset or 0 keeps it in the
     * same channel, and omits `tcid` and `tcpw` both (`tcid`).
     */
    readonly targetChannelID?: ChannelID | undefined;
    /**
     * The target channel's password, in cleartext; "" by default. Sent, as
     * `tcpw`, only with a `targetChannelID`.
     */
    readonly targetChannelPassword?: string | undefined;
}
/**
 * Rename or move a file, optionally into another channel.
 *
 * `cpw` is always sent, as for every file command; `tcid` and `tcpw` go
 * together, and only when the file moves to another channel.
 */
export declare function renameFile(client: CommandExecutor, cid: ChannelID, oldName: string, newName: string, options?: FileRenameOptions): Promise<void>;
/** How {@link stopFileTransfer} cancels. */
export interface FileTransferStopOptions extends CommandOptions {
    /**
     * Remove the partial file as well, which is usually what you want after a
     * failed upload; false by default (`delete`, always sent).
     */
    readonly removePartialFile?: boolean | undefined;
}
/**
 * Cancel a running transfer.
 *
 * Stop only your own transfers: TeamSpeak 6 6.0.0-beta13.1 crashes on a
 * ServerQuery `ftstop` for a transfer that is not the connection's own (one
 * that does not exist, or another client's), and nothing here guards against
 * it. A transfer of your own is gone once it has finished, or when nobody
 * connected to it within about 10 seconds of its being negotiated (measured on
 * TeamSpeak 3 3.13.8 and TeamSpeak 6 6.0.0), so stopping it then crashes
 * TeamSpeak 6 too. See "Server behaviour the SDK works around" in
 * `docs/serverquery-responses.md`.
 */
export declare function stopFileTransfer(client: CommandExecutor, serverFileTransferID: ServerFileTransferID, options?: FileTransferStopOptions): Promise<void>;
/** A running transfer, as `ftlist` reports it. */
export interface ActiveTransfer {
    /** The client transferring. */
    readonly clientID: ClientID;
    /** The directory in the channel's file area. */
    readonly path: string;
    /** The file name. */
    readonly name: string;
    /** The file's size in bytes. */
    readonly size: bigint;
    /** How many bytes have been transferred. */
    readonly sizeDone: bigint;
    /** The client's id for the transfer. */
    readonly clientFileTransferID: ClientFileTransferID;
    /** The server's id for the transfer, which {@link stopFileTransfer} takes. */
    readonly serverFileTransferID: ServerFileTransferID;
    /** Which side sends the data, as the server reports it (`sender`). */
    readonly sender: string;
    /**
     * The transfer's state, as the server reports it. A plain number: no table
     * of its values is known.
     */
    readonly status: number;
    /** The current speed, in bytes per second. */
    readonly currentSpeed: number;
    /** The average speed, in bytes per second. */
    readonly averageSpeed: number;
    /** How long the transfer has been running, in milliseconds. The server reports seconds. */
    readonly runtimeMs: number;
}
/**
 * File transfers in progress. Requires the file-transfer-info permission. None
 * is an empty list.
 */
export declare function listActiveTransfers(client: CommandExecutor, options?: CommandOptions): Promise<ActiveTransfer[]>;
/** How {@link initFileUpload} negotiates an upload. */
export interface FileUploadOptions extends CommandOptions {
    /** The channel's password, in cleartext; "" by default (`cpw`). */
    readonly password?: string | undefined;
    /**
     * Replace a file already at the path; false by default, so an upload never
     * destroys a file unless asked to (`overwrite`, always sent).
     */
    readonly overwrite?: boolean | undefined;
    /**
     * Continue a partial upload; false by default (`resume`). The server keeps
     * what an interrupted upload had received, and `seekPosition` of the answer
     * is how much that is: send the file from there. Measured on TeamSpeak 3
     * 3.13.8 and TeamSpeak 6 6.0.0: resuming a file that is not there is refused
     * with 2054 (invalid file path), and `overwrite` together with `resume` with
     * 2056 (overwrite excludes resume).
     */
    readonly resume?: boolean | undefined;
}
/**
 * Negotiate an upload, returning the key and port to dial over TCP.
 *
 * Pass the result to the client's `uploadFileData` to send the data; it does
 * not go through this command. A refusal — no permission to upload, say — is
 * thrown as a ServerError, even though the voice protocol reports it in a
 * separate notification after the command itself has succeeded.
 */
export declare function initFileUpload(client: CommandExecutor, cid: ChannelID, path: string, size: bigint, options?: FileUploadOptions): Promise<FileUploadInfo>;
/** How {@link initFileDownload} negotiates a download. */
export interface FileDownloadOptions extends CommandOptions {
    /** The channel's password, in cleartext; "" by default (`cpw`). */
    readonly password?: string | undefined;
    /**
     * The byte offset to start from, to resume; 0 by default (`seekpos`). The
     * answer's `size` stays the whole file's, and the bytes sent are those from
     * here to the end; an offset past the end is refused with 2057 (invalid file
     * size), measured on TeamSpeak 3 3.13.8 and TeamSpeak 6 6.0.0.
     */
    readonly seekPosition?: bigint | undefined;
}
/**
 * Negotiate a download, returning the key, port and size to dial over TCP.
 *
 * Pass the result to the client's `downloadFileData`. Refusals are thrown as
 * for {@link initFileUpload}.
 */
export declare function initFileDownload(client: CommandExecutor, cid: ChannelID, path: string, options?: FileDownloadOptions): Promise<FileDownloadInfo>;
//# sourceMappingURL=files.d.ts.map