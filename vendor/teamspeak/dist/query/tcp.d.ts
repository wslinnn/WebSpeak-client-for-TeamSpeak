import type { Duplex } from "node:stream";
import { StreamTransport } from "./stream.js";
/**
 * Opens the byte stream a raw ServerQuery connection runs over.
 *
 * Returns a `Duplex` rather than a `node:net` socket: naming a concrete
 * platform type here would bind the interface to Node's socket class for good,
 * and a caller supplying a TLS socket, a SOCKS proxy's socket or a test double
 * has no reason to hand back that particular class.
 */
export type TcpConnector = (host: string, port: number) => Duplex | Promise<Duplex>;
/** Where a raw ServerQuery listens. */
export interface TcpOptions {
    /** The server's host. */
    readonly host: string;
    /** The raw query port; 10011 by default. */
    readonly port?: number | undefined;
    /** Abandons the connection attempt. */
    readonly signal?: AbortSignal | undefined;
    /**
     * Opens the connection. `net.createConnection` by default.
     *
     * The seam into the transport: supplying one lets an application route the
     * session through a TLS terminator or a SOCKS proxy, or drive it from
     * something that is not a socket at all. It is deliberately narrow, so that
     * a later release can widen what it hands back without breaking an
     * implementation written today.
     */
    readonly connect?: TcpConnector | undefined;
}
/**
 * Open a raw ServerQuery connection (`node:net`, 10011 by default).
 *
 * Resolves once the stream is connected; the server's banner is read and
 * dropped by the transport.
 */
export declare function connectTcp(options: TcpOptions): Promise<StreamTransport>;
//# sourceMappingURL=tcp.d.ts.map