/**
 * Branded identifiers.
 *
 * TeamSpeak uses one 64-bit integer space for several unrelated kinds of id, so
 * a `bigint` alone cannot tell a channel from a client. Branding makes the
 * mistake a compile error instead of a silent move-to-the-wrong-place, and the
 * brands cost nothing at runtime.
 *
 * The ids the protocol defines as 32 bits or narrower — a clid, a permission,
 * an icon — are `number` brands; the 64-bit ones are `bigint` brands.
 */
const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffff_ffff;
const MAX_UINT64 = (1n << 64n) - 1n;
/** `v` if it is an integer from 0 to `max`; a RangeError otherwise. */
function uintInRange(v, max, what) {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > max) {
        throw new RangeError(`${what} is an integer from 0 to ${max}, not ${String(v)}`);
    }
    return v;
}
/** `v` as a bigint if it is an integer from 0 to 2^64-1; a RangeError otherwise. */
function uint64(v, what) {
    const integer = typeof v === "bigint" || (typeof v === "number" && Number.isInteger(v));
    const value = integer ? BigInt(v) : -1n;
    if (value < 0n || value > MAX_UINT64) {
        throw new RangeError(`${what} is an integer from 0 to 2^64-1, not ${String(v)}`);
    }
    return value;
}
// Every constructor checks its value against the id's wire width and throws a
// RangeError for anything else — a fraction, a negative, a value too wide —
// rather than brand a value no server could mean.
/** Brand a ban id, an integer from 0 to 2^64-1, from a number or a bigint. */
export const asBanID = (v) => uint64(v, "a ban id");
/** Brand an API key id, an integer from 0 to 2^64-1. */
export const asAPIKeyID = (v) => uint64(v, "an API key id");
/** Brand an offline message id, an integer from 0 to 2^64-1. */
export const asMessageID = (v) => uint64(v, "a message id");
/** Brand a virtual server id, an integer from 0 to 2^64-1. */
export const asServerID = (v) => uint64(v, "a server id");
/** Brand the client's id for a file transfer, an integer from 0 to 65535. */
export const asClientFileTransferID = (v) => uintInRange(v, MAX_UINT16, "a client file transfer id");
/** Brand the server's id for a file transfer, an integer from 0 to 65535. */
export const asServerFileTransferID = (v) => uintInRange(v, MAX_UINT16, "a server file transfer id");
/** Brand a channel id, an integer from 0 to 2^64-1, from a number or a bigint. */
export const asChannelID = (v) => uint64(v, "a channel id");
/** Brand a client id, an integer from 0 to 65535: the voice protocol's width. */
export const asClientID = (v) => uintInRange(v, MAX_UINT16, "a client id");
/** Brand a client database id, an integer from 0 to 2^64-1. */
export const asClientDBID = (v) => uint64(v, "a client database id");
/** Brand a server group id, an integer from 0 to 2^64-1. */
export const asServerGroupID = (v) => uint64(v, "a server group id");
/** Brand a channel group id, an integer from 0 to 2^64-1. */
export const asChannelGroupID = (v) => uint64(v, "a channel group id");
/** Brand a permission id, an integer from 0 to 2^32-1. */
export const asPermissionID = (v) => uintInRange(v, MAX_UINT32, "a permission id");
/**
 * Brand an icon id, an integer from -2^31 to 2^32-1. A negative value is taken
 * as the signed form of the same CRC32, which is how the server sometimes
 * sends one, and stored unsigned.
 */
export const asIconID = (v) => {
    if (typeof v !== "number" || !Number.isInteger(v) || v < -(2 ** 31) || v > MAX_UINT32) {
        throw new RangeError(`an icon id is an integer from -2^31 to 2^32-1, not ${String(v)}`);
    }
    return (v >>> 0);
};
/** The smallest negative 32-bit number, sign-extended to 64 bits and read unsigned. */
const SIGN_EXTENDED_MIN = 2n ** 64n - 2n ** 31n;
/**
 * Read an icon id as the server sends it: the CRC32 in one of three forms, all
 * naming the same icon. Measured on TeamSpeak 3 and 6 for one icon:
 * `channelinfo` sends it unsigned (3009859579), `servergrouplist` as a signed
 * 32-bit number (-1285107717), and the voice protocol's `notifychanneledited`
 * as that negative number sign-extended to 64 bits, unsigned
 * (18446744072424443899). Each comes back as the unsigned 32-bit value, which
 * names the icon file; 0, garbage and any other value mean no icon.
 */
export function parseIconID(raw) {
    const text = raw?.trim() ?? "";
    if (!/^-?\d{1,20}$/.test(text))
        return undefined;
    let value = BigInt(text);
    // A negative 32-bit number sign-extended to 64 bits and sent unsigned.
    if (value >= SIGN_EXTENDED_MIN && value < 2n ** 64n)
        value -= 2n ** 64n;
    if (value < -(2n ** 31n) || value >= 2n ** 32n || value === 0n)
        return undefined;
    return asIconID(Number(value));
}
/** Brand a unique identifier. */
export const asUID = (v) => v;
/** Brand a channel's unique identifier. */
export const asChannelUID = (v) => v;
//# sourceMappingURL=ids.js.map