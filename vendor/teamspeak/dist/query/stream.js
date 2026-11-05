import { LineReader } from "./lines.js";
/** How long `close()` waits for the server to end the session after `quit`. */
const QUIT_WAIT_MS = 1_000;
/**
 * A {@link QueryTransport} over a byte stream: raw TCP, or an SSH shell.
 *
 * Both greet with a two-line banner, `TS3` and a welcome sentence, before any
 * answer. It is skipped, so the client sees only answers and notifications.
 */
export class StreamTransport {
    /** A raw TCP connection and an SSH session both carry pushed notifications. */
    supportsNotifications = true;
    onLine = null;
    onClose = null;
    #stream;
    #reader = new LineReader();
    #onEnd;
    /** How many of the two banner lines are still to come. */
    #banner = 2;
    #closing = false;
    #ended = false;
    /** Wakes a `close()` that is waiting for the server to end the session. */
    #onEnded;
    #error;
    #identity;
    #openedAt = new Date();
    #bytesSent = 0;
    #bytesReceived = 0;
    /**
     * `onEnd` runs once the stream is closed, to release what the stream sits
     * on: an SSH session's connection, say. `identity` says which kind of
     * connection this is and where it points, for {@link StreamTransport.stats}.
     */
    constructor(stream, onEnd, identity) {
        this.#stream = stream;
        this.#onEnd = onEnd;
        this.#identity = identity;
        stream.on("data", (chunk) => this.#handleData(chunk));
        stream.on("error", (error) => {
            this.#error = error;
        });
        stream.on("close", () => this.#handleClose());
    }
    send(line) {
        if (this.#ended)
            return Promise.reject(new Error("the query connection is closed"));
        return new Promise((resolve, reject) => {
            this.#stream.write(`${line}\n`, (error) => {
                if (error)
                    reject(error);
                else {
                    this.#bytesSent += Buffer.byteLength(line) + 1;
                    resolve();
                }
            });
        });
    }
    stats() {
        return {
            connectedAt: this.#openedAt,
            transport: this.#identity?.transport,
            address: this.#identity?.address ?? "",
            bytesSent: this.#bytesSent,
            bytesReceived: this.#bytesReceived,
        };
    }
    /**
     * Say `quit`, give the server a moment to end the session, and close.
     *
     * Ending the connection without it is not always noticed: a TeamSpeak 3
     * server can keep an SSH session, and its slot among the few each address
     * gets, long after the client has gone. `quit` is the command that ends a
     * session, and the server answers it by closing the stream.
     */
    async close() {
        if (this.#ended)
            return;
        this.#closing = true;
        // Whatever the server still says, it is no longer anyone's answer.
        this.onLine = null;
        const closed = new Promise((resolve) => {
            this.#onEnded = resolve;
        });
        const said = await this.send("quit").then(() => true, () => false);
        if (said) {
            let timer;
            const patience = new Promise((resolve) => {
                timer = setTimeout(resolve, QUIT_WAIT_MS);
            });
            await Promise.race([closed, patience]);
            clearTimeout(timer);
        }
        if (this.#ended)
            return;
        // Ending the stream is not enough to hear it close. An SSH session channel
        // is half-open, so `end()` sends EOF and stops there without reporting
        // 'close', and the hook that releases the connection underneath would never
        // run; the close is owed here as well as from the stream's own event.
        this.#stream.end();
        this.#handleClose();
    }
    #handleData(chunk) {
        if (this.#ended)
            return;
        this.#bytesReceived += chunk.byteLength;
        let lines;
        try {
            lines = this.#reader.push(chunk);
        }
        catch (error) {
            // A server that is not speaking ServerQuery: nothing more is read, and
            // the connection ends with the reason.
            this.#error = error;
            this.onLine = null;
            if (this.#stream.destroy === undefined)
                this.#stream.end();
            else
                this.#stream.destroy();
            this.#handleClose();
            return;
        }
        for (const line of lines) {
            if (this.#banner > 0) {
                this.#banner--;
                continue;
            }
            this.onLine?.(line);
        }
    }
    #handleClose() {
        if (this.#ended)
            return;
        this.#ended = true;
        this.#onEnded?.();
        this.#onEnd?.();
        this.onClose?.(this.#closing ? undefined : this.#error);
    }
}
//# sourceMappingURL=stream.js.map