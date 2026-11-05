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
import type { ServerSettings } from "./server.js";
import type { CommandExecutor, CommandOptions } from "../command/request.js";
import type { ChannelID, ServerID } from "../command/ids.js";
/** A virtual server, as `serverlist` reports it. */
export interface VirtualServer {
    /** The server's id (`virtualserver_id`). */
    readonly id: ServerID;
    /** The voice port it listens on (`virtualserver_port`). */
    readonly port: number;
    /**
     * Its state, as the server words it (`virtualserver_status`); compare it
     * with `VirtualServerStatus`. A plain string, since a server may send a
     * state that table does not name.
     */
    readonly status: string;
    /** Its name (`virtualserver_name`); "" with `short`. */
    readonly name: string;
    /** Voice clients connected (`virtualserver_clientsonline`); undefined with `short`, and for a server that is not running. */
    readonly clientsOnline: number | undefined;
    /** ServerQuery clients connected (`virtualserver_queryclientsonline`); undefined as `clientsOnline`. */
    readonly queryClientsOnline: number | undefined;
    /** How many clients it accepts (`virtualserver_maxclients`); undefined as `clientsOnline`. */
    readonly maxClients: number | undefined;
    /** How long it has been running, in milliseconds (`virtualserver_uptime`, sent in seconds); undefined as `clientsOnline`. */
    readonly uptimeMs: number | undefined;
    /** Whether it starts with the instance (`virtualserver_autostart`); undefined with `short`. */
    readonly autoStart: boolean | undefined;
    /** The machine id of the instance that runs it, "" for none (`virtualserver_machine_id`); undefined with `short`. */
    readonly machineID: string | undefined;
    /** Its unique identifier, with `uid`; "" otherwise (`virtualserver_unique_identifier`). */
    readonly uid: string;
    /** Its UUID, with `uid`; TS6 only (`virtualserver_uuid`). */
    readonly uuid?: string | undefined;
    /** Whether guests may create channels; TS6 only (`guest_can_create_channels`). */
    readonly guestCanCreateChannels?: boolean | undefined;
    /** Whether guests may create a homebase; TS6 only (`guest_can_create_homebase`). */
    readonly guestCanCreateHomebase?: boolean | undefined;
    /** Whether the server is on the public server list; TS6 only (`virtualserver_weblist_enabled`). */
    readonly weblistEnabled?: boolean | undefined;
}
/** Which servers {@link listServers} reports, and with what. */
export interface ServerListOptions extends CommandOptions {
    /** Include each server's unique identifier (`-uid`). */
    readonly uid?: boolean | undefined;
    /** Leave out everything but the id, port and status (`-short`). */
    readonly short?: boolean | undefined;
    /** List every server in the database, whichever instance's machine id they carry (`-all`). */
    readonly all?: boolean | undefined;
    /** Only the servers that are offline (`-onlyoffline`). */
    readonly onlyOffline?: boolean | undefined;
}
/**
 * The instance's virtual servers. None is an empty list.
 *
 * Needs `b_serverinstance_virtualserver_list`, which a voice client's Server
 * Admin lacks (error 2568). TS6 also reports `guest_can_create_channels`,
 * `guest_can_create_homebase` and `virtualserver_weblist_enabled`, and its
 * UUID with `uid`; TS3 sends none of them.
 */
export declare function listServers(client: CommandExecutor, options?: ServerListOptions): Promise<VirtualServer[]>;
/** A server as {@link createServer} made it: its id and port, and the administrator's privilege key. */
export interface ServerCreated {
    /** The new server's id (`sid`). */
    readonly id: ServerID;
    /** The voice port it was given (`virtualserver_port`). */
    readonly port: number;
    /**
     * The privilege key that makes its holder the server's administrator
     * (`token`). A secret the server shows only this once: store it, and do not
     * log it.
     */
    readonly token: string;
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
export declare function createServer(client: CommandExecutor, name: string, settings?: ServerSettings, options?: CommandOptions): Promise<ServerCreated>;
/**
 * Start a virtual server. Needs `b_virtualserver_start_any`, or
 * `b_virtualserver_start` for the server the connection is on.
 *
 * Starting a server that cannot start answers error 2816 when the license
 * limit is reached.
 */
export declare function startServer(client: CommandExecutor, sid: ServerID, options?: CommandOptions): Promise<void>;
/** What {@link stopServer} tells the clients. */
export interface ServerStopOptions extends CommandOptions {
    /** A message sent to the clients before they are disconnected (`reasonmsg`); unset or "" sends none. */
    readonly reason?: string | undefined;
}
/**
 * Stop a virtual server, disconnecting its clients. Needs
 * `b_virtualserver_stop_any`, or `b_virtualserver_stop` for the server the
 * connection is on. A server that is not running is refused with error 1033.
 */
export declare function stopServer(client: CommandExecutor, sid: ServerID, options?: ServerStopOptions): Promise<void>;
/** How {@link deleteServer} reports the deletion. */
export interface ServerDeleteOptions extends CommandOptions {
    /** Do not send the `virtualserver destroyed` event to other query clients (`-noevent`). */
    readonly noEvent?: boolean | undefined;
}
/**
 * Delete a virtual server for good: its channels, groups and client records
 * go with it. Needs `b_virtualserver_delete`.
 *
 * The server must be stopped first, and one a query client has selected is
 * refused with error 1035 even then. An id no server has is refused with 1024. `noEvent` is accepted by TS3 and TS6.
 */
export declare function deleteServer(client: CommandExecutor, sid: ServerID, options?: ServerDeleteOptions): Promise<void>;
/**
 * Stop the whole instance: the process exits, every virtual server with it,
 * and nothing here can start it again. Needs `b_serverinstance_stop`.
 *
 * The answer comes before the process ends, and the connection drops after it.
 */
export declare function stopInstance(client: CommandExecutor, options?: ServerStopOptions): Promise<void>;
/**
 * Send a text message to every client on every virtual server of the
 * instance. Needs `b_serverinstance_textmessage_send`.
 */
export declare function sendGlobalMessage(client: CommandExecutor, message: string, options?: CommandOptions): Promise<void>;
/**
 * A snapshot of a virtual server, as `serversnapshotcreate` returns it and
 * `serversnapshotdeploy` takes it back.
 *
 * It holds the server's settings, groups, permissions, channels and the
 * identities of every client it knows, so it is as sensitive as the server's
 * database: store it as such, and do not log it. Without a `password` it is
 * only compressed and encoded; with one it is encrypted.
 */
export interface ServerSnapshot {
    /** The snapshot format's version (`version`); 3 on TS3 3.13 and TS6. */
    readonly version: number;
    /** The salt of the password the snapshot is encrypted with (`salt`); "" when it is not. */
    readonly salt: string;
    /** The snapshot itself (`data`), a base64 string, often several kilobytes. */
    readonly data: string;
}
/** How {@link createServerSnapshot} protects the snapshot. */
export interface ServerSnapshotOptions extends CommandOptions {
    /** Encrypt the snapshot with this password; unset or "" leaves it unencrypted (`password`). */
    readonly password?: string | undefined;
}
/**
 * Take a snapshot of the selected virtual server.
 *
 * Needs `b_virtualserver_snapshot_create`, which a voice client's Server Admin
 * lacks (error 2568). The same answer, `version`, `data` and with a password
 * `salt`, comes over raw TCP, SSH and WebQuery on TS3 and TS6.
 */
export declare function createServerSnapshot(client: CommandExecutor, options?: ServerSnapshotOptions): Promise<ServerSnapshot>;
/** How {@link deployServerSnapshot} restores. */
export interface ServerSnapshotDeployOptions extends CommandOptions {
    /** The password the snapshot was encrypted with; unset or "" for an unencrypted one (`password`). */
    readonly password?: string | undefined;
    /** Keep the files of the channels that exist both on the server and in the snapshot (`-keepfiles`). */
    readonly keepFiles?: boolean | undefined;
    /** Report which new channel each of the snapshot's channels became (`-mapping`). */
    readonly mapping?: boolean | undefined;
}
/** Which channel of a snapshot became which channel on the server, as `-mapping` reports it. */
export interface ChannelMapping {
    /** The channel's id in the snapshot (`ocid`). */
    readonly oldID: ChannelID;
    /** Its id on the server now (`ncid`). */
    readonly newID: ChannelID;
}
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
export declare function deployServerSnapshot(client: CommandExecutor, snapshot: ServerSnapshot, options?: ServerSnapshotDeployOptions): Promise<ChannelMapping[]>;
//# sourceMappingURL=instance.d.ts.map