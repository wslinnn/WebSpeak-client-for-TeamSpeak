/** The values of the table below, before freezing. */
declare const reasonValues: {
    /** A client joining, or moving of its own accord. */
    readonly None: 0;
    /** A client moved by someone else. */
    readonly Moved: 1;
    /** A client coming into or out of view because a channel was (un)subscribed. */
    readonly Subscription: 2;
    /** A client that timed out. */
    readonly LostConnection: 3;
    /** A client kicked from its channel. */
    readonly KickChannel: 4;
    /** A client kicked from the server. */
    readonly KickServer: 5;
    /** A client banned from the server. */
    readonly KickServerBan: 6;
    /** The virtual server stopping. */
    readonly ServerStop: 7;
    /** A client that left the server. */
    readonly Disconnect: 8;
    /** A change to a channel the client can see. */
    readonly ChannelUpdate: 9;
    /** A channel edited by someone. */
    readonly ChannelEdit: 10;
    /** The server instance shutting down. */
    readonly ServerShutdown: 11;
};
/**
 * Why a client moved or left view, as the server reports it (`reasonid`).
 *
 * The names are the ones `Reason` has in teamspeak-go.
 * Events carry the reason as a plain number, since a server may send one this
 * table does not name.
 */
export declare const Reason: typeof reasonValues;
/** A known reason. */
export type Reason = (typeof Reason)[keyof typeof Reason];
export {};
//# sourceMappingURL=reason.d.ts.map