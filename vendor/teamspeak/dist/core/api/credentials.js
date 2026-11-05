/**
 * API keys and ServerQuery logins.
 *
 * Both are credentials for a query connection, which is why they sit together:
 * an API key is what WebQuery takes in place of a login, and a query login is
 * the name and password `login` takes over raw TCP. The keys and passwords the
 * server generates are returned once, as a property that logging the result
 * does not print (see {@link APIKeyCreated}).
 */
import { nonZero, firstRow, exec, query, list, encodeFields, str, big, date, durationMs, SECOND, } from "./command.js";
import { asAPIKeyID, asClientDBID, asServerID } from "../command/ids.js";
const parseAPIKey = (row) => {
    const unlimited = str(row, "time_left") === "unlimited";
    return {
        id: asAPIKeyID(big(row, "id")),
        serverID: asServerID(big(row, "sid")),
        ownerDatabaseID: asClientDBID(big(row, "cldbid")),
        scope: str(row, "scope"),
        createdAt: date(row, "created_at"),
        expiresAt: unlimited ? undefined : date(row, "expires_at"),
        remainingMs: unlimited ? undefined : durationMs(row, "time_left", SECOND),
        customID: str(row, "custom_id"),
    };
};
const apiKeyNames = {
    lifetimeDays: "lifetime",
    ownerDatabaseID: "cldbid",
};
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
export async function addAPIKey(client, scope, options = {}) {
    const { lifetimeDays } = options;
    if (lifetimeDays !== undefined && (!Number.isInteger(lifetimeDays) || lifetimeDays < 0)) {
        throw new RangeError(`a lifetime is a whole number of days, 0 or more, not ${lifetimeDays}`);
    }
    const rows = await query(client, "apikeyadd", [["scope", scope], ...encodeFields(options, apiKeyNames)], options);
    const row = firstRow(rows, "apikeyadd", "apikey");
    return { ...parseAPIKey(row), key: str(row, "apikey") };
}
const apiKeyListNames = {
    owner: ["cldbid", (owner) => (owner === "all" ? "*" : owner)],
    start: "start",
    limit: "duration",
};
/**
 * API keys, newest last. None is an empty list. Needs
 * `b_virtualserver_apikey_manage`.
 *
 * `-count`, which adds the total number of keys to the first row, is not sent:
 * the function returns the keys, and the total would be a second result.
 */
export async function listAPIKeys(client, options = {}) {
    const rows = await list(client, "apikeylist", encodeFields(options, apiKeyListNames), options);
    return rows.map(parseAPIKey);
}
/**
 * Delete an API key. A client can always delete its own; another's needs
 * `b_virtualserver_apikey_manage`.
 *
 * An id no key has is refused with error 5123 (invalid apikey id). Careful
 * with the id of the key a WebQuery connection itself uses: deleting it ends
 * that connection's access.
 */
export async function deleteAPIKey(client, id, options) {
    await exec(client, "apikeydel", [["id", id]], options);
}
const parseQueryLogin = (row) => ({
    databaseID: asClientDBID(big(row, "cldbid")),
    serverID: asServerID(big(row, "sid")),
    name: str(row, "client_login_name"),
});
const queryLoginListNames = {
    pattern: "pattern",
    start: "start",
    limit: "duration",
};
/**
 * ServerQuery logins of the selected virtual server, or of all of them when
 * none is selected. None is an empty list.
 *
 * ServerQuery only: a voice client gets error 2 (not implemented). Needs
 * `b_serverquery_login_list`.
 */
export async function listQueryLogins(client, options = {}) {
    const rows = await list(client, "queryloginlist", encodeFields(options, queryLoginListNames), options);
    return rows.map(parseQueryLogin);
}
const queryLoginAddNames = {
    databaseID: ["cldbid", nonZero],
};
/**
 * Create a ServerQuery login, or enable one for an existing client; asking
 * again for the same client sets a new password.
 *
 * ServerQuery only: a voice client gets error 2 (not implemented). Needs
 * `b_serverquery_login_create`. Returns the login with its generated
 * password, a secret the server shows once: store it, and do not log it.
 */
export async function addQueryLogin(client, name, options = {}) {
    const rows = await query(client, "queryloginadd", [["client_login_name", name], ...encodeFields(options, queryLoginAddNames)], options);
    const row = firstRow(rows, "queryloginadd", "client_login_password");
    return { ...parseQueryLogin(row), password: str(row, "client_login_password") };
}
/**
 * Delete a client's ServerQuery login. The server refuses a client with none
 * with error 1538 (invalid parameter) and an unknown one with 512.
 *
 * ServerQuery only: a voice client gets error 2 (not implemented). Needs
 * `b_serverquery_login_delete`.
 */
export async function deleteQueryLogin(client, databaseID, options) {
    await exec(client, "querylogindel", [["cldbid", databaseID]], options);
}
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
export async function setQueryLogin(client, name, options) {
    const rows = await query(client, "clientsetserverquerylogin", [["client_login_name", name]], options);
    return str(firstRow(rows, "clientsetserverquerylogin", "client_login_password"), "client_login_password");
}
//# sourceMappingURL=credentials.js.map