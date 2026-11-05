/**
 * Virtual servers, snapshots and the instance process.
 *
 * These address the instance rather than one virtual server, so they need the
 * `b_serverinstance_*` and `b_virtualserver_*` permissions of an instance
 * administrator, which not even a virtual server's Server Admin holds: over the
 * voice protocol they answer error 2568. They are for a ServerQuery connection
 * logged in as the instance's administrator; for most of them, one with no
 * virtual server selected. Both TS3 and TS6 limit an unlicensed instance to one
 * running virtual server, and refuse another with error 2816 (virtualserver
 * limit reached).
 */
import { firstRow, exec, query, list, encodeFields, rawProperties, nonEmpty, str, big, num, bool, durationMs, SECOND, } from "./command.js";
import { asChannelID, asServerID } from "../command/ids.js";
const optional = (row, key, read) => row[key] === undefined ? undefined : read();
const parseVirtualServer = (row) => ({
    id: asServerID(big(row, "virtualserver_id")),
    port: num(row, "virtualserver_port"),
    status: str(row, "virtualserver_status"),
    name: str(row, "virtualserver_name"),
    clientsOnline: optional(row, "virtualserver_clientsonline", () => num(row, "virtualserver_clientsonline")),
    queryClientsOnline: optional(row, "virtualserver_queryclientsonline", () => num(row, "virtualserver_queryclientsonline")),
    maxClients: optional(row, "virtualserver_maxclients", () => num(row, "virtualserver_maxclients")),
    uptimeMs: optional(row, "virtualserver_uptime", () => durationMs(row, "virtualserver_uptime", SECOND)),
    autoStart: optional(row, "virtualserver_autostart", () => bool(row, "virtualserver_autostart")),
    machineID: row["virtualserver_machine_id"],
    uid: str(row, "virtualserver_unique_identifier"),
    uuid: row["virtualserver_uuid"],
    guestCanCreateChannels: optional(row, "guest_can_create_channels", () => bool(row, "guest_can_create_channels")),
    guestCanCreateHomebase: optional(row, "guest_can_create_homebase", () => bool(row, "guest_can_create_homebase")),
    weblistEnabled: optional(row, "virtualserver_weblist_enabled", () => bool(row, "virtualserver_weblist_enabled")),
});
const serverListFlags = {
    uid: "-uid",
    short: "-short",
    all: "-all",
    onlyOffline: "-onlyoffline",
};
/**
 * The instance's virtual servers. None is an empty list.
 *
 * Needs `b_serverinstance_virtualserver_list`, which a voice client's Server
 * Admin lacks (error 2568). TS6 also reports `guest_can_create_channels`,
 * `guest_can_create_homebase` and `virtualserver_weblist_enabled`, and its
 * UUID with `uid`; TS3 sends none of them.
 */
export async function listServers(client, options = {}) {
    const rows = await list(client, "serverlist", encodeFields(options, serverListFlags), options);
    return rows.map(parseVirtualServer);
}
/**
 * Create a virtual server and start it.
 *
 * `settings` are raw `virtualserver_*` properties, passed through as given for
 * the reasons {@link editServer} gives; `virtualserver_port` picks the port,
 * and the server takes the first free one from 9987 up when it is unset. Needs
 * `b_virtualserver_create`. An instance without a license that already runs a
 * server refuses with error 2816. The result's `token` is a secret shown only
 * once: store it, and do not log it.
 */
export async function createServer(client, name, settings = {}, options) {
    const rows = await query(client, "servercreate", [["virtualserver_name", name], ...rawProperties(settings)], options);
    const row = firstRow(rows, "servercreate", "sid");
    return {
        id: asServerID(big(row, "sid")),
        port: num(row, "virtualserver_port"),
        token: str(row, "token"),
    };
}
/**
 * Start a virtual server. Needs `b_virtualserver_start_any`, or
 * `b_virtualserver_start` for the server the connection is on.
 *
 * Starting a server that cannot start answers error 2816 when the license
 * limit is reached.
 */
export async function startServer(client, sid, options) {
    await exec(client, "serverstart", [["sid", sid]], options);
}
const stopNames = { reason: ["reasonmsg", nonEmpty] };
/**
 * Stop a virtual server, disconnecting its clients. Needs
 * `b_virtualserver_stop_any`, or `b_virtualserver_stop` for the server the
 * connection is on. A server that is not running is refused with error 1033.
 */
export async function stopServer(client, sid, options = {}) {
    await exec(client, "serverstop", [["sid", sid], ...encodeFields(options, stopNames)], options);
}
const deleteFlags = { noEvent: "-noevent" };
/**
 * Delete a virtual server for good: its channels, groups and client records
 * go with it. Needs `b_virtualserver_delete`.
 *
 * The server must be stopped first, and one a query client has selected is
 * refused with error 1035 even then. An id no server has is refused with 1024. `noEvent` is accepted by TS3 and TS6.
 */
export async function deleteServer(client, sid, options = {}) {
    await exec(client, "serverdelete", [["sid", sid], ...encodeFields(options, deleteFlags)], options);
}
/**
 * Stop the whole instance: the process exits, every virtual server with it,
 * and nothing here can start it again. Needs `b_serverinstance_stop`.
 *
 * The answer comes before the process ends, and the connection drops after it.
 */
export async function stopInstance(client, options = {}) {
    await exec(client, "serverprocessstop", encodeFields(options, stopNames), options);
}
/**
 * Send a text message to every client on every virtual server of the
 * instance. Needs `b_serverinstance_textmessage_send`.
 */
export async function sendGlobalMessage(client, message, options) {
    await exec(client, "gm", [["msg", message]], options);
}
const snapshotNames = { password: ["password", nonEmpty] };
/**
 * Take a snapshot of the selected virtual server.
 *
 * Needs `b_virtualserver_snapshot_create`, which a voice client's Server Admin
 * lacks (error 2568). The same answer, `version`, `data` and with a password
 * `salt`, comes over raw TCP, SSH and WebQuery on TS3 and TS6.
 */
export async function createServerSnapshot(client, options = {}) {
    const rows = await query(client, "serversnapshotcreate", encodeFields(options, snapshotNames), options);
    const row = firstRow(rows, "serversnapshotcreate", "data");
    return { version: num(row, "version"), salt: str(row, "salt"), data: str(row, "data") };
}
const deployNames = {
    password: ["password", nonEmpty],
    keepFiles: "-keepfiles",
    mapping: "-mapping",
};
/**
 * Restore a virtual server from a snapshot.
 *
 * With a server selected, the snapshot replaces that server's settings,
 * groups, channels and client records; the channels get new ids, which
 * `mapping` reports as one entry per channel (the result is `[]` without it).
 * With none selected, the server makes a new virtual server from it, which an
 * unlicensed instance that is already running one refuses with error 2816. The
 * server does not check permissions while deploying, so the right to do it is
 * the right to give oneself any permission: needs
 * `b_virtualserver_snapshot_deploy`, which a voice client's Server Admin lacks
 * (error 2568).
 *
 * Over raw TCP and SSH the virtual server restarts, which ends the
 * connection's selection of it: the next command is refused with error 1024
 * until the connection selects it again with `use`. An encrypted snapshot
 * with the wrong password is refused with error 1538; an unencrypted one
 * ignores the password.
 */
export async function deployServerSnapshot(client, snapshot, options = {}) {
    const rows = await query(client, "serversnapshotdeploy", [
        ...encodeFields(options, deployNames),
        ["version", snapshot.version],
        ["salt", nonEmpty(snapshot.salt ?? "")],
        ["data", snapshot.data],
    ], options);
    return rows.flatMap((row) => row["ocid"] === undefined
        ? []
        : [{ oldID: asChannelID(big(row, "ocid")), newID: asChannelID(big(row, "ncid")) }]);
}
//# sourceMappingURL=instance.js.map