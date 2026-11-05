import { TeamspeakError } from "@honeybbq/teamspeak";
import type { QueryTransport, QueryTransportStats } from "./transport.js";
/**
 * A WebQuery request that failed with an HTTP status and no TeamSpeak error in
 * its answer: a wrong or missing api key, a server that is not a WebQuery. A
 * refusal from the server itself carries a TeamSpeak code and is a
 * `ServerError` instead.
 */
export declare class WebQueryHttpError extends TeamspeakError {
    /** {@inheritDoc @honeybbq/teamspeak!TeamspeakError.kind} */
    static readonly kind: string;
    /** The HTTP status. */
    readonly status: number;
    constructor(status: number, statusText: string);
}
/**
 * Who a WebQuery request is made as: the owner of an api key, or a guest.
 *
 * TeamSpeak 6 beta13 and later run a request that carries no api key in the
 * `guest` scope, with the Guest Server Query group's permissions: `version`
 * and `whoami` answer, and a command outside the guest scope is refused with
 * 5120 ("command not allowed for guest access") over HTTP 401. A server
 * started with `--query-http-allow-guest=0` refuses a request without a key.
 *
 * A guest connection is a choice made out loud: a missing or empty `apiKey`
 * is an error and never becomes one.
 *
 * @experimental Part of the `@honeybbq/teamspeak/query` entry, which may
 * change in a minor release.
 */
export type WebCredentials = {
    /** The api key, sent as `x-api-key`; it replaces `login`. */
    readonly apiKey: string;
    /** Left out: an api key is not a guest's. */
    readonly guest?: never;
} | {
    /** Only `true` is a value: send no api key and run as the server's guest. */
    readonly guest: true;
    /** Left out: a guest sends no api key. */
    readonly apiKey?: never;
};
/** How a WebQuery is reached. */
export type WebQueryOptions = WebCredentials & {
    /**
     * The server's base URL, such as `http://127.0.0.1:10080` or
     * `https://ts.example.com:10443`. The default `fetch` speaks `http:` and
     * `https:` and refuses any other scheme.
     */
    readonly url: string;
    /**
     * The virtual server to address; `use` changes it. Unset leaves the server out
     * of the path, which TeamSpeak 6 reads as the instance. TeamSpeak 3 runs every
     * command on a virtual server even then, so an instance command such as
     * `queryloginadd client_login_name=…` answers 1539 there.
     */
    readonly serverID?: number | bigint | undefined;
    /**
     * The `fetch` to use. By default a small one over `node:http` for an `http:`
     * URL and `node:https` for an `https:` one: the global `fetch` refuses port
     * 10080, WebQuery's own default, as a port the Fetch standard blocks.
     *
     * Over HTTPS the default verifies the server's certificate against the
     * trust store Node uses, and never skips that. A server whose certificate
     * comes from a private CA, or is self-signed, is trusted one of two ways:
     * start Node with `NODE_EXTRA_CA_CERTS=ca.pem`, or pass a `fetch` that
     * trusts the CA, such as one over `node:https` with an `https.Agent` whose
     * `ca` is that certificate.
     */
    readonly fetch?: typeof fetch | undefined;
};
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
export declare class WebQueryTransport implements QueryTransport {
    #private;
    /** WebQuery has no session for the server to push a notification to. */
    readonly supportsNotifications = false;
    onLine: ((line: string) => void) | null;
    onClose: ((error: Error | undefined) => void) | null;
    constructor(options: WebQueryOptions);
    send(line: string, options?: {
        readonly signal?: AbortSignal;
    }): Promise<void>;
    stats(): QueryTransportStats;
    close(): Promise<void>;
}
//# sourceMappingURL=web.d.ts.map