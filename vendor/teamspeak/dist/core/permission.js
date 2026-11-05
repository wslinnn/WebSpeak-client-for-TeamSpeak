/**
 * A permission, named by id or by name.
 *
 * The server accepts either — `permid=…` or `permsid=…` — and every command
 * that takes a permission takes exactly one of the two. Two optional
 * parameters let a caller send both or neither; this sends one.
 */
/** Name a permission by its numeric id; it is sent as `permid`. */
export function permissionByID(id) {
    return { id };
}
/**
 * Name a permission by its name, such as
 * `PermissionName.ClientTalkPower` (`"i_client_talk_power"`); it is sent as
 * `permsid`. A name the {@link PermissionName} table lacks is accepted too.
 */
export function permissionByName(name) {
    return { name };
}
//# sourceMappingURL=permission.js.map