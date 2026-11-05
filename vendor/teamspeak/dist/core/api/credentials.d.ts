/**
 * API keys and ServerQuery logins.
 *
 * Both are credentials for a query connection, which is why they sit together:
 * an API key is what WebQuery takes in place of a login, and a query login is
 * the name and password `login` takes over raw TCP. The keys and passwords the
 * server generates are returned once, as a property that logging the result
 * does not print (see {@link APIKeyCreated}).
 */
import type { CommandExecutor, CommandOptions } from "../command/request.js";
import type { APIKeyID, ClientDBID, ServerID } from "../command/ids.js";
import type { APIKeyScope } from "../enums.js";
/**
 * An API key, as `apikeylist` reports it. The key itself is not listed: the
 * server shows it once, when it is created.
 */
export interface APIKey {
    /** The key's id, which {@link deleteAPIKey} takes (`id`). */
    readonly id: APIKeyID;
    /** The virtual server the key belongs to (`sid`); 0 for the instance. */
    readonly serverID: ServerID;
    /** The client the key acts as (`cldbid`). */
    readonly ownerDatabaseID: ClientDBID;
    /** What the key may do, one of {@link APIKeyScope} (`scope`). */
    readonly scope: string;
    /** When the key was created (`created_at`). */
    readonly createdAt: Date | undefined;
    /**
     * When the key stops working (`expires_at`); undefined for a key that never
     * does. The server sends `expires_at` equal to `created_at` for such a key,
     * and `time_left=unlimited`, which is what this follows.
     */
    readonly expiresAt: Date | undefined;
    /**
     * How long the key has left, in milliseconds (`time_left`, sent in
     * seconds); undefined for a key that never expires.
     */
    readonly remainingMs: number | undefined;
    /** The key's custom id (`custom_id`): TS6 sends one, TS3 none, which reads as "". */
    readonly customID: string;
}
/** A key as {@link addAPIKey} creates it: the record, and the key itself. */
export interface APIKeyCreated extends APIKey {
    /**
     * The key, to send as the `x-api-key` of a WebQuery request (`apikey`). A
     * secret the server shows only this once: store it where it is needed, and do
     * not log it.
     */
    readonly key: string;
}
/** How {@link addAPIKey} creates a key. */
export interface APIKeyOptions extends CommandOptions {
    /**
     * How many days the key works; 0 for a key that never expires, unset for the
     * server's default of 14 (`lifetime`).
     */
    readonly lifetimeDays?: number | undefined;
    /**
     * The client the key acts as; unset for the connection's own client, and
     * another client's needs `b_virtualserver_apikey_manage` (`cldbid`).
     */
    readonly ownerDatabaseID?: ClientDBID | undefined;
}
/**
 * Create an API key with the given scope.
 *
 * Needs `b_virtualserver_apikey_add`. Over ServerQuery, with the owner left
 * unset, the key belongs to the query client's login. Over the voice protocol
 * the answer arrives as a notification, which the client pairs with this
 * command. TS6 also reports a `custom_id`.
 *
 * Returns the key with its record. The key grants access to the server and is
 * shown only this once: store it, and do not log it.
 *
 * A NoDataError from this means the command took effect: TS6 WebQuery answers
 * a successful create with no data while a Server Admin voice client is
 * connected (6.0.0-beta13.1). The key exists but its
 * secret is lost, since a key's secret is never listed, and a retry makes a
 * second key. Find the orphan with {@link listAPIKeys} and remove it with
 * {@link deleteAPIKey}.
 */
export declare function addAPIKey(client: CommandExecutor, scope: APIKeyScope, options?: APIKeyOptions): Promise<APIKeyCreated>;
/** Which keys {@link listAPIKeys} reports, and how many. */
export interface APIKeyListOptions extends CommandOptions {
    /**
     * Whose keys: a client's database id, or "all" for every client's; unset
     * for the connection's own. Anyone else's needs
     * `b_virtualserver_apikey_manage` (`cldbid`, `*` for "all").
     */
    readonly owner?: ClientDBID | "all" | undefined;
    /** Skip this many keys (`start`). */
    readonly start?: number | undefined;
    /** Report at most this many keys (`duration`). */
    readonly limit?: number | undefined;
}
/**
 * API keys, newest last. None is an empty list. Needs
 * `b_virtualserver_apikey_manage`.
 *
 * `-count`, which adds the total number of keys to the first row, is not sent:
 * the function returns the keys, and the total would be a second result.
 */
export declare function listAPIKeys(client: CommandExecutor, options?: APIKeyListOptions): Promise<APIKey[]>;
/**
 * Delete an API key. A client can always delete its own; another's needs
 * `b_virtualserver_apikey_manage`.
 *
 * An id no key has is refused with error 5123 (invalid apikey id). Careful
 * with the id of the key a WebQuery connection itself uses: deleting it ends
 * that connection's access.
 */
export declare function deleteAPIKey(client: CommandExecutor, id: APIKeyID, options?: CommandOptions): Promise<void>;
/** A ServerQuery login, as `queryloginlist` reports it. */
export interface QueryLogin {
    /** The client the login belongs to (`cldbid`). */
    readonly databaseID: ClientDBID;
    /** The virtual server it belongs to (`sid`); 0 for a login of the instance. */
    readonly serverID: ServerID;
    /** The login name (`client_login_name`). */
    readonly name: string;
}
/** A login as {@link addQueryLogin} creates it: the record, and its password. */
export interface QueryLoginCreated extends QueryLogin {
    /**
     * The generated password (`client_login_password`). A secret the server shows
     * only this once: store it where it is needed, and do not log it.
     */
    readonly password: string;
}
/** Which logins {@link listQueryLogins} reports. */
export interface QueryLoginListOptions extends CommandOptions {
    /** Only names matching this pattern, which may hold the SQL wildcard `%` (`pattern`). */
    readonly pattern?: string | undefined;
    /** Skip this many logins (`start`). */
    readonly start?: number | undefined;
    /** Report at most this many logins (`duration`). */
    readonly limit?: number | undefined;
}
/**
 * ServerQuery logins of the selected virtual server, or of all of them when
 * none is selected. None is an empty list.
 *
 * ServerQuery only: a voice client gets error 2 (not implemented). Needs
 * `b_serverquery_login_list`.
 */
export declare function listQueryLogins(client: CommandExecutor, options?: QueryLoginListOptions): Promise<QueryLogin[]>;
/** For which client {@link addQueryLogin} creates a login. */
export interface QueryLoginAddOptions extends CommandOptions {
    /**
     * The client to enable the login for (`cldbid`; 0 is unset). With a virtual
     * server selected it is required, and names a client already in that
     * server's database: a login is attached to one. With none selected the
     * login is the instance's own, and the server makes the client. Left out
     * while a server is selected, the server refuses it with 1539.
     */
    readonly databaseID?: ClientDBID | undefined;
}
/**
 * Create a ServerQuery login, or enable one for an existing client; asking
 * again for the same client sets a new password.
 *
 * ServerQuery only: a voice client gets error 2 (not implemented). Needs
 * `b_serverquery_login_create`. Returns the login with its generated
 * password, a secret the server shows once: store it, and do not log it.
 */
export declare function addQueryLogin(client: CommandExecutor, name: string, options?: QueryLoginAddOptions): Promise<QueryLoginCreated>;
/**
 * Delete a client's ServerQuery login. The server refuses a client with none
 * with error 1538 (invalid parameter) and an unknown one with 512.
 *
 * ServerQuery only: a voice client gets error 2 (not implemented). Needs
 * `b_serverquery_login_delete`.
 */
export declare function deleteQueryLogin(client: CommandExecutor, databaseID: ClientDBID, options?: CommandOptions): Promise<void>;
/**
 * Set this client's own ServerQuery login name, and return the password the
 * server generates for it.
 *
 * Works over the voice protocol, where the answer is a notification the
 * client pairs with this command. A ServerQuery connection gets error 512 on
 * TS3 and TS6 alike: its own client has no database record to attach the login
 * to; use {@link addQueryLogin} there. Needs
 * `b_client_create_modify_serverquery_login`. The password is a secret the
 * server shows only this once: store it, and do not log it.
 */
export declare function setQueryLogin(client: CommandExecutor, name: string, options?: CommandOptions): Promise<string>;
//# sourceMappingURL=credentials.d.ts.map