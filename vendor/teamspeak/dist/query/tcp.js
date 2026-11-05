import { createConnection } from "node:net";
import { StreamTransport } from "./stream.js";
/**
 * Open a raw ServerQuery connection (`node:net`, 10011 by default).
 *
 * Resolves once the stream is connected; the server's banner is read and
 * dropped by the transport.
 */
export async function connectTcp(options) {
    const { host, port = 10011, signal, connect = defaultConnect } = options;
    signal?.throwIfAborted();
    const stream = await connect(host, port);
    await opened(stream, signal);
    return new StreamTransport(stream, undefined, { transport: "tcp", address: `${host}:${port}` });
}
/** A connected `node:net` socket, with whole lines sent as they are written. */
function defaultConnect(host, port) {
    const socket = createConnection({ host, port });
    // Whole lines are sent, and a query's answers are small: no waiting to
    // coalesce.
    socket.setNoDelay(true);
    return socket;
}
/**
 * Wait until the stream is connected, if it is not already.
 *
 * A `Duplex` a caller handed back may be open, still opening, or a test double
 * that is neither — `connecting` says which, and a stream without it counts as
 * open, since nothing else could report the moment it becomes usable.
 */
function opened(stream, signal) {
    const connecting = stream.connecting;
    if (connecting !== true)
        return Promise.resolve();
    return new Promise((resolve, reject) => {
        const failed = (error) => {
            signal?.removeEventListener("abort", onAbort);
            reject(error);
        };
        const onAbort = () => {
            stream.destroy();
            failed(signal.reason);
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        stream.once("error", failed);
        stream.once("connect", () => {
            stream.off("error", failed);
            signal?.removeEventListener("abort", onAbort);
            resolve();
        });
    });
}
//# sourceMappingURL=tcp.js.map