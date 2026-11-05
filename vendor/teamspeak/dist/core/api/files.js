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
import { uint, U16, firstRow, commandOptions, exec, query, list, str, big, num, date, durationMs, SECOND, } from "./command.js";
import { asClientFileTransferID, asClientID, asServerFileTransferID } from "../command/ids.js";
const asPath = (path) => (path.startsWith("/") ? path : `/${path}`);
const parseFileEntry = (row) => ({
    name: str(row, "name"),
    size: big(row, "size"),
    modifiedAt: date(row, "datetime"),
    isDirectory: row["type"] === "0",
});
/** Directory listing for one path in a channel's file area. */
export async function listFiles(client, cid, path, options = {}) {
    const rows = await list(client, "ftgetfilelist", [
        ["cid", cid],
        ["path", asPath(path)],
        ["cpw", options.password ?? ""],
    ], options, { passwords: ["cpw"] });
    return rows.map(parseFileEntry);
}
/** A path without the slashes at its end; "/" becomes "". */
function withoutTrailingSlashes(path) {
    let end = path.length;
    while (end > 0 && path.charCodeAt(end - 1) === 0x2f)
        end--;
    return path.slice(0, end);
}
/** How far {@link listFilesRecursive} goes down unless told otherwise. */
const DEFAULT_MAX_DEPTH = 16;
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
export async function listFilesRecursive(client, cid, path, options = {}) {
    const { maxDepth = DEFAULT_MAX_DEPTH, ...listOptions } = options;
    if (!Number.isInteger(maxDepth) || maxDepth < 1) {
        throw new RangeError(`maxDepth is a positive integer, not ${String(maxDepth)}`);
    }
    const found = [];
    const walk = async (directory, depth) => {
        for (const entry of await listFiles(client, cid, directory, listOptions)) {
            const entryPath = `${withoutTrailingSlashes(directory)}/${entry.name}`;
            found.push({ ...entry, path: entryPath });
            if (entry.isDirectory && depth < maxDepth)
                await walk(entryPath, depth + 1);
        }
    };
    await walk(asPath(path), 1);
    return found;
}
/** Size and timestamp of one file. */
export async function getFileInfo(client, cid, path, options = {}) {
    const rows = await query(client, "ftgetfileinfo", [
        ["cid", cid],
        ["name", asPath(path)],
        ["cpw", options.password ?? ""],
    ], options, ["cpw"]);
    return parseFileEntry(firstRow(rows, "ftgetfileinfo"));
}
/**
 * Delete one or more files, in one command: each name is a row of it
 * (`name=/a|name=/b`).
 */
export async function deleteFile(client, cid, paths, options = {}) {
    const names = (typeof paths === "string" ? [paths] : paths).map(asPath);
    if (names.length === 0)
        return;
    await client.send({
        command: "ftdeletefile",
        params: [
            ["cid", cid],
            ["cpw", options.password ?? ""],
        ],
        rows: names.map((name) => [["name", name]]),
        passwords: ["cpw"],
    }, commandOptions(options));
}
/**
 * Create a directory. Its parent has to exist: measured on TS3 3.13.8 and TS6
 * beta13.1, a path whose parent is missing is refused with 2052 (file
 * input/output error), so nested directories are made one level at a time.
 */
export async function createDirectory(client, cid, dirname, options = {}) {
    await exec(client, "ftcreatedir", [
        ["cid", cid],
        ["dirname", asPath(dirname)],
        ["cpw", options.password ?? ""],
    ], options, ["cpw"]);
}
/**
 * Rename or move a file, optionally into another channel.
 *
 * `cpw` is always sent, as for every file command; `tcid` and `tcpw` go
 * together, and only when the file moves to another channel.
 */
export async function renameFile(client, cid, oldName, newName, options = {}) {
    await exec(client, "ftrenamefile", [
        ["cid", cid],
        ["oldname", asPath(oldName)],
        ["newname", asPath(newName)],
        ["cpw", options.password ?? ""],
        ...(options.targetChannelID === undefined || options.targetChannelID === 0n
            ? []
            : [
                ["tcid", options.targetChannelID],
                ["tcpw", options.targetChannelPassword ?? ""],
            ]),
    ], options, ["cpw", "tcpw"]);
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
export async function stopFileTransfer(client, serverFileTransferID, options = {}) {
    await exec(client, "ftstop", [
        ["serverftfid", serverFileTransferID],
        ["delete", options.removePartialFile ?? false],
    ], options);
}
/**
 * File transfers in progress. Requires the file-transfer-info permission. None
 * is an empty list.
 */
export async function listActiveTransfers(client, options) {
    const rows = await list(client, "ftlist", [], options);
    return rows.map((row) => ({
        clientID: asClientID(uint(row, "clid", U16)),
        path: str(row, "path"),
        name: str(row, "name"),
        size: big(row, "size"),
        sizeDone: big(row, "sizedone"),
        clientFileTransferID: asClientFileTransferID(uint(row, "clientftfid", U16)),
        serverFileTransferID: asServerFileTransferID(uint(row, "serverftfid", U16)),
        sender: str(row, "sender"),
        status: num(row, "status"),
        currentSpeed: num(row, "current_speed"),
        averageSpeed: num(row, "average_speed"),
        runtimeMs: durationMs(row, "runtime", SECOND),
    }));
}
/**
 * The `clientftfid` for the next negotiation.
 *
 * The server echoes it in the answer, and the echo is the only thing tying the
 * answer to the request — it arrives after the command has already returned —
 * so two transfers negotiated at once must not share one.
 */
let lastClientFileTransferID = 0;
function nextClientFileTransferID() {
    lastClientFileTransferID = (lastClientFileTransferID % 65535) + 1;
    return asClientFileTransferID(lastClientFileTransferID);
}
/**
 * Negotiate an upload, returning the key and port to dial over TCP.
 *
 * Pass the result to the client's `uploadFileData` to send the data; it does
 * not go through this command. A refusal — no permission to upload, say — is
 * thrown as a ServerError, even though the voice protocol reports it in a
 * separate notification after the command itself has succeeded.
 */
export async function initFileUpload(client, cid, path, size, options = {}) {
    const rows = await query(client, "ftinitupload", [
        ["clientftfid", nextClientFileTransferID()],
        ["name", asPath(path)],
        ["cid", cid],
        ["cpw", options.password ?? ""],
        ["size", size],
        ["overwrite", options.overwrite ?? false],
        ["resume", options.resume ?? false],
        // proto is required: omitting it fails the whole call with 1539
        // (parameter not found) rather than defaulting.
        ["proto", 0],
    ], options, ["cpw"]);
    const row = firstRow(rows, "ftinitupload", "ftkey");
    return {
        fileTransferKey: str(row, "ftkey"),
        port: num(row, "port"),
        size,
        seekPosition: big(row, "seekpos"),
        clientFileTransferID: asClientFileTransferID(uint(row, "clientftfid", U16)),
        serverFileTransferID: asServerFileTransferID(uint(row, "serverftfid", U16)),
    };
}
/**
 * Negotiate a download, returning the key, port and size to dial over TCP.
 *
 * Pass the result to the client's `downloadFileData`. Refusals are thrown as
 * for {@link initFileUpload}.
 */
export async function initFileDownload(client, cid, path, options = {}) {
    const seekPosition = options.seekPosition ?? 0n;
    const rows = await query(client, "ftinitdownload", [
        ["clientftfid", nextClientFileTransferID()],
        ["name", asPath(path)],
        ["cid", cid],
        ["cpw", options.password ?? ""],
        ["seekpos", seekPosition],
        ["proto", 0],
    ], options, ["cpw"]);
    const row = firstRow(rows, "ftinitdownload", "ftkey");
    return {
        fileTransferKey: str(row, "ftkey"),
        port: num(row, "port"),
        size: big(row, "size"),
        seekPosition,
        clientFileTransferID: asClientFileTransferID(uint(row, "clientftfid", U16)),
        serverFileTransferID: asServerFileTransferID(uint(row, "serverftfid", U16)),
    };
}
//# sourceMappingURL=files.js.map