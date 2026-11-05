import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { TeamspeakError } from "@honeybbq/teamspeak";
import { buildCommandOrdered, parseCommand, splitCommandRows } from "../core/internal.js";
import { trimTrailingSlashes } from "./trim.js";
/**
 * A WebQuery request that failed with an HTTP status and no TeamSpeak error in
 * its answer: a wrong or missing api key, a server that is not a WebQuery. A
 * refusal from the server itself carries a TeamSpeak code and is a
 * `ServerError` instead.
 */
export class WebQueryHttpError extends TeamspeakError {
    /** {@inheritDoc @honeybbq/teamspeak!TeamspeakError.kind} */
    static kind = "WebQueryHttpError";
    static {
        Object.defineProperty(this.prototype, "name", {
            value: "WebQueryHttpError",
            writable: true,
            configurable: true,
            enumerable: false,
        });
    }
    /** The HTTP status. */
    status;
    constructor(status, statusText) {
        super(`WebQuery answered HTTP ${status}${statusText === "" ? "" : ` ${statusText}`}`);
        this.status = status;
    }
}
/**
 * A {@link QueryTransport} over WebQuery, the HTTP interface of TeamSpeak 3
 * (3.12 and later) and TeamSpeak 6.
 *
 * Each command line becomes one request, `POST /<server>/<command>` with the
 * parameters as JSON, and the JSON answer is turned back into what a raw
 * connection would have sent: one line per row, then `error id=… msg=…`. The
 * client above sees one answer shape.
 *
 * WebQuery has no session, so two things differ. The api key replaces `login`,
 * which the server refuses; and `use` is answered here, by changing the server
 * the following requests address, since the server has no `use` either. It
 * also sends no notifications, so there is nothing to register for.
 */
export class WebQueryTransport {
    /** WebQuery has no session for the server to push a notification to. */
    supportsNotifications = false;
    onLine = null;
    onClose = null;
    #base;
    #apiKey;
    #prefix;
    #fetch;
    #closed = false;
    #inFlight = new Set();
    #openedAt = new Date();
    #bytesSent = 0;
    #bytesReceived = 0;
    constructor(options) {
        this.#base = trimTrailingSlashes(options.url);
        if (options.guest === true) {
            if (options.apiKey !== undefined) {
                throw new TypeError("apiKey and guest were given together; a guest sends no api key");
            }
        }
        else if (typeof options.apiKey !== "string" || options.apiKey === "") {
            throw new TypeError("apiKey is a non-empty string; to connect without one, as a guest, set guest to true");
        }
        this.#apiKey = options.apiKey;
        this.#prefix = options.serverID === undefined ? "" : `/${options.serverID}`;
        if (options.fetch === undefined) {
            const { protocol } = new URL(options.url);
            if (protocol !== "http:" && protocol !== "https:") {
                throw new TypeError(`WebQuery is reached over http: or https:, not ${protocol}; pass a fetch to use another scheme`);
            }
        }
        this.#fetch = options.fetch ?? nodeFetch;
    }
    async send(line, options) {
        if (this.#closed)
            throw new Error("the query connection is closed");
        const rows = splitCommandRows(line)
            .map((row) => parseCommand(row))
            .filter((row) => row !== null);
        const name = rows[0]?.name ?? "";
        if (name === "use") {
            this.#use(rows[0].params);
            return;
        }
        const params = rows.map((row) => ({ ...row.params }));
        const body = JSON.stringify(params.length === 1 ? params[0] : params);
        // One controller per request: the command's own signal and `close()` both
        // end it, so a request nobody waits for any more is not left running.
        const abort = new AbortController();
        this.#inFlight.add(abort);
        const onAbort = () => abort.abort(options?.signal?.reason);
        if (options?.signal?.aborted === true)
            onAbort();
        else
            options?.signal?.addEventListener("abort", onAbort, { once: true });
        let response;
        let answer;
        try {
            response = await this.#fetch(`${this.#base}${this.#prefix}/${name}`, {
                method: "POST",
                headers: {
                    ...(this.#apiKey === undefined ? {} : { "x-api-key": this.#apiKey }),
                    "content-type": "application/json",
                },
                body,
                // The api key is a header, and a followed redirect would carry it to
                // whatever host the answer names: the 3xx is the answer.
                redirect: "manual",
                signal: abort.signal,
            });
            this.#bytesSent += Buffer.byteLength(body);
            let text;
            try {
                text = await response.text();
            }
            catch (error) {
                // An abort is the command's end, not an answer that was not JSON.
                if (abort.signal.aborted)
                    throw error;
            }
            if (text !== undefined) {
                this.#bytesReceived += Buffer.byteLength(text);
                try {
                    answer = JSON.parse(text);
                }
                catch {
                    // Not JSON: nothing the server said about the command.
                }
            }
            // A fetch that ignores its signal still answers late. The command that
            // asked has given up, and the client may be waiting on the next one: its
            // lines must not be this answer's.
            if (abort.signal.aborted)
                throw abortReason(abort.signal);
        }
        finally {
            options?.signal?.removeEventListener("abort", onAbort);
            this.#inFlight.delete(abort);
        }
        const code = answer?.status?.code;
        if (typeof code !== "number")
            throw new WebQueryHttpError(response.status, response.statusText);
        const rowsBody = answer?.body;
        for (const row of Array.isArray(rowsBody) ? rowsBody : []) {
            if (typeof row === "object" && row !== null)
                this.onLine?.(rowLine(row));
        }
        const message = answer?.status?.message;
        const extra = answer?.status?.extra_message;
        const failed = answer?.status?.failed_permission;
        const tail = {
            ...(typeof extra === "string" && extra !== "" ? { extra_msg: extra } : {}),
            // WebQuery names the permission; a raw ServerQuery line carries an id.
            ...(typeof failed === "string" && failed !== "" ? { failed_permission: failed } : {}),
        };
        this.onLine?.(buildCommandOrdered("error", [
            ["id", String(code)],
            ["msg", typeof message === "string" ? message : ""],
            ...Object.entries(tail),
        ]));
    }
    stats() {
        // The base URL as given, without a user or password a caller put in it.
        const url = new URL(this.#base);
        url.username = "";
        url.password = "";
        return {
            connectedAt: this.#openedAt,
            transport: "web",
            address: trimTrailingSlashes(url.toString()),
            bytesSent: this.#bytesSent,
            bytesReceived: this.#bytesReceived,
        };
    }
    close() {
        if (this.#closed)
            return Promise.resolve();
        this.#closed = true;
        // Nothing is waiting for these any more, and none may deliver a line.
        for (const request of this.#inFlight)
            request.abort(new Error("the query connection is closed"));
        this.onClose?.(undefined);
        return Promise.resolve();
    }
    /** `use sid=1`, or `use port=9987`, which WebQuery addresses as `/byport/9987`. */
    #use(params) {
        const sid = params["sid"];
        const port = params["port"];
        if (sid !== undefined && /^\d+$/.test(sid))
            this.#prefix = `/${sid}`;
        else if (port !== undefined && /^\d+$/.test(port))
            this.#prefix = `/byport/${port}`;
        else {
            this.onLine?.(buildCommandOrdered("error", [
                ["id", "1538"],
                ["msg", "invalid parameter"],
            ]));
            return;
        }
        this.onLine?.("error id=0 msg=ok");
    }
}
/** Why an aborted request ended: the signal's own reason, as an error. */
function abortReason(signal) {
    const reason = signal.reason;
    return reason instanceof Error ? reason : new Error("the WebQuery request was aborted");
}
/**
 * One JSON value as the text a command line carries: a string as it is, a
 * number as written, a boolean as `1` or `0`, and anything else (a null, a
 * nested object) as empty, which is a field the row did not carry. WebQuery
 * sends every value as a string, measured on TeamSpeak 3 and 6; this is for
 * a server that does not.
 */
function valueText(value) {
    if (typeof value === "string")
        return value;
    if (typeof value === "number" || typeof value === "bigint")
        return String(value);
    if (typeof value === "boolean")
        return value ? "1" : "0";
    return "";
}
/** One answer row as a line of `key=value` fields. */
function rowLine(row) {
    const fields = Object.entries(row).map(([key, value]) => [key, valueText(value)]);
    // buildCommandOrdered writes a name first; a row has none.
    return buildCommandOrdered("", fields).slice(1);
}
/**
 * The part of `fetch` this transport uses, over `node:http` or `node:https`
 * by the URL's scheme: a POST with a string body, answered with a `Response`.
 * An HTTPS certificate is verified the way Node does by default.
 */
const nodeFetch = ((url, init) => new Promise((resolve, reject) => {
    const request = new URL(url).protocol === "https:" ? httpsRequest : httpRequest;
    const req = request(url, {
        method: init.method,
        headers: init.headers,
        ...(init.signal ? { signal: init.signal } : {}),
    }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () => resolve(new Response(Buffer.concat(chunks), {
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? "",
        })));
    });
    req.on("error", reject);
    req.end(init.body);
}));
//# sourceMappingURL=web.js.map