/**
 * A command as the typed layer describes it, before a transport encodes it.
 *
 * The typed commands run on any connection that can execute a command — the
 * voice client today, ServerQuery later — and the two disagree about how some
 * values go on the wire. A channel password is the case that matters: the
 * voice protocol expects `base64(sha1(password))`, while ServerQuery takes the
 * password itself and hashes it server-side. So a request says *which*
 * parameters are passwords and leaves their encoding to the transport.
 */
import { buildCommandOrdered } from "./command.js";
/**
 * Turn a value into its wire form.
 *
 * Returns undefined for values that should be omitted entirely — an unset
 * optional field — because sending `foo=` is not the same as not sending it:
 * for `channel_password` the first clears the password and the second leaves it
 * alone. Callers distinguish "unset" from "empty string" by passing undefined
 * versus "".
 */
function encodeValue(value) {
    if (value === undefined)
        return undefined;
    if (typeof value === "boolean")
        return value ? "1" : "0";
    return String(value);
}
/**
 * Render a request as a command line.
 *
 * `encodePassword` is the transport's rule for password parameters. An empty
 * password is sent as is: it means "no password", in every encoding.
 */
export function encodeRequest(request, encodePassword) {
    const passwords = request.passwords ?? [];
    const encode = (params) => encodeParams(params, passwords, encodePassword);
    const [first = [], ...rest] = request.rows ?? [];
    const line = buildCommandOrdered(request.command, [
        ...encode(request.params ?? []),
        ...encode(first),
    ]);
    // A row is the parameters alone, with no command name before them.
    return [line, ...rest.map((row) => buildCommandOrdered("", encode(row)).slice(1))].join("|");
}
/**
 * A parameter name: letters, digits and underscores, with one leading `-` for a
 * flag such as `-uid`. Every key measured on TeamSpeak 3 and 6, in a command or
 * an answer, is of this form.
 */
const VALID_KEY = /^-?[A-Za-z0-9_]+$/;
function encodeParams(params, passwords, encodePassword) {
    const out = [];
    for (const [key, value] of params) {
        // A key is a protocol identifier, written to the line as it is: one with a
        // space, a newline or a pipe in it would add parameters, rows or a whole
        // command to what the caller meant. Only a key a server could have named
        // is sent.
        if (!VALID_KEY.test(key))
            throw new TypeError(`${JSON.stringify(key)} is not a parameter name`);
        // Flags (`-uid`) are switches: present when true, absent otherwise.
        if (key.startsWith("-")) {
            if (value === true)
                out.push([key, ""]);
            continue;
        }
        if (passwords.includes(key) && typeof value === "string" && value !== "") {
            out.push([key, encodePassword(value)]);
            continue;
        }
        const encoded = encodeValue(value);
        if (encoded !== undefined)
            out.push([key, encoded]);
    }
    return out;
}
//# sourceMappingURL=request.js.map