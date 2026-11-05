import { type Channel, type ChannelCreatedEvent, type ChannelDeletedEvent, type ChannelEditedEvent, type ChannelID, type ChannelMovedEvent, type ClientEntry, type ChannelGroup, type ChannelGroupID, type ClientID, type IconID, type Logger, type ServerGroup, type ServerGroupID } from "@honeybbq/teamspeak";
/** The values of the table below, before freezing. */
declare const viewStatusValues: {
    /** This client has not tried to connect. */
    readonly Empty: "empty";
    /**
     * A connection is being made and the server has not finished its welcome.
     * The view holds what has arrived, which is not yet the tree.
     */
    readonly Loading: "loading";
    /** The welcome is complete and the connection is up. The view follows the server's notifications. */
    readonly Live: "live";
    /**
     * The connection ended. The view still holds what it last knew, which no
     * longer changes; the next `connect()` clears it.
     */
    readonly Stale: "stale";
};
/**
 * Where a {@link ServerView} is in a connection's life.
 *
 * @experimental New in 1.x and may change in a minor release.
 */
export declare const ViewStatus: typeof viewStatusValues;
/**
 * One of {@link ViewStatus}.
 *
 * @experimental New in 1.x and may change in a minor release.
 */
export type ViewStatus = (typeof ViewStatus)[keyof typeof ViewStatus];
/**
 * What `viewReady` delivers.
 *
 * @experimental New in 1.x and may change in a minor release.
 */
export interface ViewReadyEvent {
    /** The view's `revision` when it became live. */
    readonly revision: number;
}
/**
 * What `viewChanged` delivers.
 *
 * @experimental New in 1.x and may change in a minor release.
 */
export interface ViewChangedEvent {
    /** The view's `revision` when the event was delivered. */
    readonly revision: number;
}
/**
 * What a connected client knows of the server: the channels in the server's
 * order, the clients it has been told about, and itself. It is read-only and
 * always on; `client.view` is the one view a client has, for all its
 * connections.
 *
 * The view is changed by the packet handler, before the typed event that
 * reports the change is queued, and events are delivered after the packet is
 * handled. So a listener sees a view at least as new as its event: with two
 * notifications in one packet, the first listener already sees both. A caller
 * that needs the state at each event follows the events; a caller that shows
 * the state now reads the view.
 *
 * Nothing the view returned is changed afterwards: a channel or client
 * record, and each array and `channels` map, stays as it was when it was
 * read, and a change replaces it, `clients` and `channels` maps included.
 * `revision` tells whether anything changed.
 *
 * What is known differs by part:
 *
 * - The channels are exact, for the channels the server shows this client.
 *   Their order is derived from the events, because the server changes the
 *   order of a sibling without announcing it. See `ChannelTree`.
 * - The clients are those the server announced and has not since withdrawn:
 *   the ones in the channels this client is subscribed to: the one it joined,
 *   every one it moved into (leaving keeps the subscription), and every one it
 *   subscribed to. The server does not say who is in the others,
 *   and does not say when a subscription ends, so the view drops a channel's
 *   clients when it sees `channelUnsubscribed`. It is not a list of everyone on
 *   the server; `listClients` is, for the moment it is called.
 * - The group definitions are the server's last full list of each kind, which
 *   it sends again whole after any group is added, renamed, copied or deleted.
 *   A change to a group's permissions is not announced, and is not in the view.
 * - The server's properties are exact for those the server announces when
 *   they change, and as of the last `getServerVariables` for the others.
 *
 * @experimental New in 1.x and may change in a minor release: the shape of the
 * view and its names are still settling.
 */
export interface ServerView {
    /** Where the view is in the connection's life. */
    readonly status: ViewStatus;
    /**
     * A number that increases with every change to the view: a channel, a
     * client, or `status`. It never goes back, a new connection included, so a
     * caller can compare it to skip work.
     */
    readonly revision: number;
    /**
     * Resolves once `status` is `"live"`, and at once when it already is.
     * Rejects with the connection's error when the connection ends first, as it
     * does when `status` is `"stale"`, and with the signal's reason when
     * `signal` aborts. While `"empty"` or `"loading"` it waits.
     */
    whenReady(options?: {
        readonly signal?: AbortSignal | undefined;
    }): Promise<void>;
    /**
     * Every channel the server showed this client, parents before children and
     * siblings in order, so `[...view.channels.values()]` is the order to
     * display them in.
     *
     * A record's `order` is the channel before it among its siblings, derived
     * from the events, and its `totalClients` and `totalFamilyClients` are
     * `undefined`: the server counts the clients in a channel once, in the
     * welcome, and sends nothing after, so a count held here would be wrong
     * from the first client that moved. Count `clientsIn` instead.
     */
    readonly channels: ReadonlyMap<ChannelID, Channel>;
    /** The channel, or `undefined` for one the view does not hold. */
    channel(id: ChannelID): Channel | undefined;
    /**
     * The channels directly under `parent`, in sibling order; the top level for
     * `undefined` or 0. Empty for an id the view does not hold.
     */
    children(parent?: ChannelID): readonly Channel[];
    /**
     * The channel and its ancestors, root first, so the channel is last. Empty
     * for an id the view does not hold.
     */
    path(id: ChannelID): readonly Channel[];
    /**
     * The clients this client knows of, which is not every client on the
     * server: see {@link ServerView}. The same records the client's events and
     * `invokerGroups` read. The map is as the clients were when it was read: a
     * change makes the next read a new map.
     */
    readonly clients: ReadonlyMap<ClientID, ClientEntry>;
    /** The client, or `undefined` for one the view does not know of. */
    client(id: ClientID): ClientEntry | undefined;
    /** The known clients in the channel, by id. */
    clientsIn(id: ChannelID): readonly ClientEntry[];
    /** This client's own record; `undefined` until the welcome has delivered it. */
    readonly self: ClientEntry | undefined;
    /**
     * The server groups, in the server's order, which is ascending id. A change
     * to the list makes the next read a new map; a client's `serverGroups` can
     * name an id that is not in it for a moment, so look ups must allow for a
     * miss. Empty until `groupsLoaded`.
     */
    readonly serverGroups: ReadonlyMap<ServerGroupID, ServerGroup>;
    /** The channel groups, as `serverGroups` is for server groups. */
    readonly channelGroups: ReadonlyMap<ChannelGroupID, ChannelGroup>;
    /**
     * True once both group lists of this connection have arrived. The server
     * sends them right after the welcome, so `viewReady` can come first: the
     * `viewChanged` that follows reports them. It is `false` again from the next
     * `connect()` and stays `true` once `"stale"`.
     */
    readonly groupsLoaded: boolean;
    /**
     * The server's `virtualserver_*` properties by wire name, the keys
     * `getServerInfo` returns and `PropertyName` names. A change makes the next
     * read a new object.
     *
     * It starts from what the server says on joining. It then follows the edits
     * the server announces, and merges every `getServerVariables` answer. The
     * server announces an edit only to a property that answer does not carry; a
     * change to the welcome message, the host message or the maximum number of
     * clients, among others, arrives as an empty `serverEdited`. Call
     * `getServerVariables` after one to bring those up to date. The counters and
     * statistics that change by themselves (clients online, uptime, traffic) are
     * never held.
     */
    readonly server: Readonly<Record<string, string>>;
    /**
     * The virtual server's name (`virtualserver_name`), as `server` holds it now;
     * empty before the server has said.
     */
    readonly serverName: string;
    /**
     * The server's icon (`virtualserver_icon_id`) as `server` holds it now, or
     * `undefined` for none. The server sends the icon's CRC32, sometimes as a
     * negative 32-bit number; this is the unsigned value, which names the icon
     * file.
     */
    readonly serverIconID: IconID | undefined;
    /**
     * The host banner image's URL (`virtualserver_hostbanner_gfx_url`) as
     * `server` holds it now, or `undefined` when none is set.
     */
    readonly serverBannerImageURL: string | undefined;
}
/**
 * The clients a client knows, by id. Every change to it, whoever makes it, is
 * a change to the view, so it counts them.
 */
export declare class Roster extends Map<number, ClientEntry> {
    #private;
    /** Call `changed` after each change from now on. */
    onChange(changed: () => void): void;
    set(id: number, entry: ClientEntry): this;
    delete(id: number): boolean;
    clear(): void;
}
/**
 * The state behind `client.view`, and its only writer: the client's packet
 * handler. `view` is what the client hands out.
 */
export declare class ViewStore {
    #private;
    /** The clients, shared with the client's own roster. */
    readonly roster: Roster;
    readonly view: ServerView;
    /** `changed` is called when the revision moves outside a loading view, so an event can follow. */
    constructor(logger: Logger, selfID: () => number, changed?: () => void);
    /** A connection begins: what the last one left is cleared. */
    reset(): void;
    /**
     * The revision to announce with `viewChanged`, or `undefined` when there is
     * nothing to say: the view is loading, or it is as it was when the last
     * `viewReady` or `viewChanged` reported it.
     */
    announce(): number | undefined;
    /** A `channellist` row of the welcome. */
    collect(row: Channel): void;
    /**
     * The welcome's last row has arrived: the tree is built and the view is live.
     * Returns the revision it became live at, or `undefined` when it was not
     * waiting for the welcome.
     */
    finish(): number | undefined;
    /** A channel being created, applied to the tree. */
    applyCreated(event: ChannelCreatedEvent): void;
    /** A channel being edited, applied to the tree. */
    applyEdited(event: ChannelEditedEvent): void;
    /** A channel being moved, applied to the tree. */
    applyMoved(event: ChannelMovedEvent): void;
    /** A channel being deleted, applied to the tree. */
    applyDeleted(event: ChannelDeletedEvent): void;
    /**
     * The server stopped telling this client about a channel's clients, and did
     * not say they left: forget them. This client's own record stays.
     */
    dropChannel(channelID: ChannelID): void;
    /**
     * The server's list of its server groups, one line of rows. It replaces the
     * set, so a group the line lacks is gone; a row without an id is skipped.
     */
    setServerGroups(groups: readonly ServerGroup[]): void;
    /** The server's list of its channel groups; see {@link ViewStore.setServerGroups}. */
    setChannelGroups(groups: readonly ChannelGroup[]): void;
    /** The `initserver` parameters: the server's own properties are kept, nothing of the client's. */
    seedServer(params: Readonly<Record<string, string>>): void;
    /** An edit the server announced. */
    patchServer(changes: Readonly<Record<string, string>>): void;
    /** An answer to `servergetvariables`, whoever asked: merged, less the counters. */
    mergeServer(params: Readonly<Record<string, string>>): void;
    /** The channel as the view holds it, for the event that reports its deletion. */
    channelBeforeDeletion(id: ChannelID): Channel | undefined;
    /** The connection ended, for `error`; undefined for a disconnect. */
    end(error: unknown): void;
}
export {};
//# sourceMappingURL=view.d.ts.map