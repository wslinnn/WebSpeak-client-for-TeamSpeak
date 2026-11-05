import { ChannelTree, NotConnectedError, TeamspeakError, asChannelID, } from "@honeybbq/teamspeak";
import { parseIconID } from "../core/internal.js";
import { abortReason } from "./abort.js";
/** The values of the table below, before freezing. */
const viewStatusValues = {
    /** This client has not tried to connect. */
    Empty: "empty",
    /**
     * A connection is being made and the server has not finished its welcome.
     * The view holds what has arrived, which is not yet the tree.
     */
    Loading: "loading",
    /** The welcome is complete and the connection is up. The view follows the server's notifications. */
    Live: "live",
    /**
     * The connection ended. The view still holds what it last knew, which no
     * longer changes; the next `connect()` clears it.
     */
    Stale: "stale",
};
/**
 * Where a {@link ServerView} is in a connection's life.
 *
 * @experimental New in 1.x and may change in a minor release.
 */
export const ViewStatus = /* @__PURE__ */ Object.freeze(viewStatusValues);
/**
 * The clients a client knows, by id. Every change to it, whoever makes it, is
 * a change to the view, so it counts them.
 */
export class Roster extends Map {
    #changed = () => { };
    /** Call `changed` after each change from now on. */
    onChange(changed) {
        this.#changed = changed;
    }
    set(id, entry) {
        super.set(id, entry);
        this.#changed();
        return this;
    }
    delete(id) {
        const had = super.delete(id);
        if (had)
            this.#changed();
        return had;
    }
    clear() {
        const had = this.size > 0;
        super.clear();
        if (had)
            this.#changed();
    }
}
const TOP = asChannelID(0n);
/**
 * The `virtualserver_*` properties of `servergetvariables` that change by
 * themselves. A number nothing keeps current would be wrong from the next
 * second, so the view never holds one.
 */
const COUNTERS = new Set([
    "clientsonline",
    "queryclientsonline",
    "channelsonline",
    "uptime",
    "client_connections",
    "query_client_connections",
    "month_bytes_downloaded",
    "month_bytes_uploaded",
    "total_bytes_downloaded",
    "total_bytes_uploaded",
    "total_packetloss_speech",
    "total_packetloss_keepalive",
    "total_packetloss_control",
    "total_packetloss_total",
    "total_ping",
].map((name) => `virtualserver_${name}`));
/** The `virtualserver_*` entries of `params`, less the counters when `counters` is false. */
function serverEntries(params, counters) {
    return Object.entries(params).filter(([key]) => key.startsWith("virtualserver_") && (counters || !COUNTERS.has(key)));
}
/** Whether two records hold the same values under the same keys. */
function sameRecord(a, b) {
    const left = Object.entries(a);
    const right = Object.entries(b);
    return (left.length === right.length &&
        left.every(([key, value], i) => {
            const other = right[i];
            return key === other[0] && Object.is(value, other[1]);
        }));
}
/** Whether two lists hold the same groups in the same order. */
function sameGroups(a, b) {
    if (a.size !== b.size)
        return false;
    const right = [...b];
    let i = 0;
    for (const [id, group] of a) {
        const other = right[i++];
        if (id !== other[0] || !sameRecord(group, other[1]))
            return false;
    }
    return true;
}
/** The channels of `tree`, parents first and siblings in order, in one map. */
function preorder(tree) {
    const out = new Map();
    const walk = (parent) => {
        for (const channel of tree.children(parent)) {
            out.set(channel.id, channel);
            walk(channel.id);
        }
    };
    walk(TOP);
    return out;
}
/**
 * The state behind `client.view`, and its only writer: the client's packet
 * handler. `view` is what the client hands out.
 */
export class ViewStore {
    /** The clients, shared with the client's own roster. */
    roster = new Roster();
    view;
    #logger;
    #selfID;
    #status = ViewStatus.Empty;
    #revision = 0;
    #tree = ChannelTree.from([]);
    /** The `channellist` rows of the welcome in progress, in arrival order. */
    #rows = [];
    #known;
    #ordered;
    #serverGroups = new Map();
    #channelGroups = new Map();
    #serverGroupsSeen = false;
    #channelGroupsSeen = false;
    #server = {};
    /** The revision `viewReady` or `viewChanged` last reported. */
    #announced = 0;
    #changed;
    #waiters = new Set();
    /** Why the last connection ended. */
    #endedBy;
    /** `changed` is called when the revision moves outside a loading view, so an event can follow. */
    constructor(logger, selfID, changed = () => { }) {
        this.#logger = logger;
        this.#selfID = selfID;
        this.#changed = changed;
        this.#ordered = { tree: this.#tree, channels: new Map() };
        this.#known = { revision: this.#revision, clients: new Map() };
        this.roster.onChange(() => this.#bump());
        // oxlint-disable-next-line no-this-alias -- accessors cannot be arrow functions
        const store = this;
        this.view = {
            get status() {
                return store.#status;
            },
            get revision() {
                return store.#revision;
            },
            whenReady: (options) => this.#whenReady(options?.signal),
            get channels() {
                if (store.#ordered.tree !== store.#tree) {
                    store.#ordered = { tree: store.#tree, channels: preorder(store.#tree) };
                }
                return store.#ordered.channels;
            },
            channel: (id) => this.#tree.get(id),
            children: (parent) => this.#tree.children(parent),
            path: (id) => this.#tree.path(id),
            get clients() {
                if (store.#known.revision !== store.#revision) {
                    store.#known = {
                        revision: store.#revision,
                        clients: new Map(store.roster),
                    };
                }
                return store.#known.clients;
            },
            client: (id) => this.roster.get(id),
            clientsIn: (id) => [...this.roster.values()]
                .filter((entry) => entry.channelID === id)
                .sort((a, b) => a.id - b.id),
            get self() {
                const id = store.#selfID();
                return id === 0 ? undefined : store.roster.get(id);
            },
            get serverGroups() {
                return store.#serverGroups;
            },
            get channelGroups() {
                return store.#channelGroups;
            },
            get groupsLoaded() {
                return store.#groupsLoaded();
            },
            get server() {
                return store.#server;
            },
            get serverName() {
                return store.#server["virtualserver_name"] ?? "";
            },
            get serverIconID() {
                return parseIconID(store.#server["virtualserver_icon_id"]);
            },
            get serverBannerImageURL() {
                return store.#server["virtualserver_hostbanner_gfx_url"]?.trim() || undefined;
            },
        };
    }
    /** A connection begins: what the last one left is cleared. */
    reset() {
        this.roster.clear();
        this.#rows = [];
        this.#tree = ChannelTree.from([]);
        this.#serverGroups = new Map();
        this.#channelGroups = new Map();
        this.#serverGroupsSeen = false;
        this.#channelGroupsSeen = false;
        this.#server = {};
        this.#status = "loading";
        this.#bump();
    }
    /** The revision moved. */
    #bump() {
        this.#revision++;
        if (this.#status !== "loading")
            this.#changed();
    }
    /**
     * The revision to announce with `viewChanged`, or `undefined` when there is
     * nothing to say: the view is loading, or it is as it was when the last
     * `viewReady` or `viewChanged` reported it.
     */
    announce() {
        if (this.#status === "loading" || this.#status === "empty")
            return undefined;
        if (this.#revision === this.#announced)
            return undefined;
        this.#announced = this.#revision;
        return this.#revision;
    }
    /** A `channellist` row of the welcome. */
    collect(row) {
        if (this.#status === "loading")
            this.#rows.push(row);
    }
    /**
     * The welcome's last row has arrived: the tree is built and the view is live.
     * Returns the revision it became live at, or `undefined` when it was not
     * waiting for the welcome.
     */
    finish() {
        if (this.#status !== "loading")
            return undefined;
        // The server counts a channel's clients once, in the welcome.
        const rows = this.#rows.map((row) => ({
            ...row,
            totalClients: undefined,
            totalFamilyClients: undefined,
        }));
        this.#rows = [];
        this.#tree = ChannelTree.from(rows);
        if (!this.#tree.consistent)
            this.#logger.debug("the channel list is not a tree");
        this.#status = "live";
        this.#bump();
        this.#announced = this.#revision;
        for (const waiter of this.#waiters)
            waiter.resolve();
        return this.#revision;
    }
    /** A channel being created, applied to the tree. */
    applyCreated(event) {
        this.#change("channelCreated", event.channelID, (tree) => tree.applyCreated(event));
    }
    /** A channel being edited, applied to the tree. */
    applyEdited(event) {
        this.#change("channelEdited", event.channelID, (tree) => tree.applyEdited(event));
    }
    /** A channel being moved, applied to the tree. */
    applyMoved(event) {
        this.#change("channelMoved", event.channelID, (tree) => tree.applyMoved(event));
    }
    /** A channel being deleted, applied to the tree. */
    applyDeleted(event) {
        this.#change("channelDeleted", event.channelID, (tree) => tree.applyDeleted(event));
    }
    #change(name, channelID, next) {
        if (this.#status !== "live")
            return;
        const before = this.#tree;
        this.#tree = next(before);
        this.#bump();
        if (before.consistent && !this.#tree.consistent) {
            this.#logger.debug("a channel event could not be placed", {
                event: name,
                channel: String(channelID),
            });
        }
    }
    /**
     * The server stopped telling this client about a channel's clients, and did
     * not say they left: forget them. This client's own record stays.
     */
    dropChannel(channelID) {
        const self = this.#selfID();
        for (const [id, entry] of this.roster) {
            if (entry.channelID === channelID && id !== self)
                this.roster.delete(id);
        }
    }
    /**
     * The server's list of its server groups, one line of rows. It replaces the
     * set, so a group the line lacks is gone; a row without an id is skipped.
     */
    setServerGroups(groups) {
        if (!this.#accepting())
            return;
        const loaded = this.#groupsLoaded();
        const next = new Map();
        for (const group of groups)
            next.set(group.id, group);
        this.#serverGroupsSeen = true;
        const changed = !sameGroups(this.#serverGroups, next);
        if (changed)
            this.#serverGroups = next;
        if (changed || loaded !== this.#groupsLoaded())
            this.#bump();
    }
    /** The server's list of its channel groups; see {@link ViewStore.setServerGroups}. */
    setChannelGroups(groups) {
        if (!this.#accepting())
            return;
        const loaded = this.#groupsLoaded();
        const next = new Map();
        for (const group of groups)
            next.set(group.id, group);
        this.#channelGroupsSeen = true;
        const changed = !sameGroups(this.#channelGroups, next);
        if (changed)
            this.#channelGroups = next;
        if (changed || loaded !== this.#groupsLoaded())
            this.#bump();
    }
    #groupsLoaded() {
        return this.#serverGroupsSeen && this.#channelGroupsSeen;
    }
    /** The `initserver` parameters: the server's own properties are kept, nothing of the client's. */
    seedServer(params) {
        this.#mergeServer(serverEntries(params, true));
    }
    /** An edit the server announced. */
    patchServer(changes) {
        this.#mergeServer(serverEntries(changes, true));
    }
    /** An answer to `servergetvariables`, whoever asked: merged, less the counters. */
    mergeServer(params) {
        this.#mergeServer(serverEntries(params, false));
    }
    #mergeServer(entries) {
        if (!this.#accepting())
            return;
        if (entries.every(([key, value]) => this.#server[key] === value))
            return;
        this.#server = { ...this.#server, ...Object.fromEntries(entries) };
        this.#bump();
    }
    /** Group lists and server properties are taken while loading and live, not once stale. */
    #accepting() {
        return this.#status === "loading" || this.#status === "live";
    }
    /** The channel as the view holds it, for the event that reports its deletion. */
    channelBeforeDeletion(id) {
        return this.#status === "live" ? this.#tree.get(id) : undefined;
    }
    /** The connection ended, for `error`; undefined for a disconnect. */
    end(error) {
        if (this.#status !== "loading" && this.#status !== "live")
            return;
        this.#status = "stale";
        this.#bump();
        this.#endedBy =
            error === undefined
                ? new NotConnectedError()
                : error instanceof Error
                    ? error
                    : new TeamspeakError("the connection ended", { cause: error });
        for (const waiter of this.#waiters)
            waiter.reject(this.#endedBy);
    }
    #whenReady(signal) {
        if (signal?.aborted)
            return Promise.reject(abortReason(signal));
        if (this.#status === "live")
            return Promise.resolve();
        if (this.#status === "stale")
            return Promise.reject(this.#endedBy ?? new NotConnectedError());
        return new Promise((resolve, reject) => {
            const settle = () => {
                signal?.removeEventListener("abort", onAbort);
                this.#waiters.delete(waiter);
            };
            const waiter = {
                resolve: () => {
                    settle();
                    resolve();
                },
                reject: (error) => {
                    settle();
                    reject(error);
                },
            };
            const onAbort = () => waiter.reject(abortReason(signal));
            signal?.addEventListener("abort", onAbort, { once: true });
            this.#waiters.add(waiter);
        });
    }
}
//# sourceMappingURL=view.js.map