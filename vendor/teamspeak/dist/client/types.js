/** The values of the table below, before freezing. */
const groupWhisperTypeValues = {
    /** The members of one server group; the target names the group. */
    ServerGroup: 0,
    /** The holders of one channel group; the target names the group. */
    ChannelGroup: 1,
    /** The clients that are channel commanders. Unmeasured: a test client was not one. */
    ChannelCommander: 2,
    /** Every client. */
    AllClients: 3,
};
/**
 * Which clients a group whisper reaches (`GroupWhisperType` in the packet).
 * Server group, channel group and all clients were measured on TeamSpeak 3
 * and 6; channel commander was not.
 */
export const GroupWhisperType = 
/* @__PURE__ */ Object.freeze(groupWhisperTypeValues);
/** The values of the table below, before freezing. */
const groupWhisperScopeValues = {
    /** Every channel. */
    AllChannels: 0,
    /** The channel the sender is in. */
    CurrentChannel: 1,
    /** The parent of the sender's channel. Unmeasured. */
    ParentChannel: 2,
    /** Every ancestor of the sender's channel. Unmeasured. */
    AllParentChannels: 3,
    /** The sender's channel and its subchannels. Unmeasured. */
    ChannelFamily: 4,
    /** The sender's ancestors, its channel and its subchannels. Unmeasured. */
    CompleteChannelFamily: 5,
    /** The subchannels of the sender's channel. Unmeasured. */
    Subchannels: 6,
};
/**
 * Which channels a group whisper reaches (`GroupWhisperTarget` in the
 * packet). All channels and the current channel were measured on TeamSpeak 3
 * and 6; the others carry the packet's names and were not.
 */
export const GroupWhisperScope = 
/* @__PURE__ */ Object.freeze(groupWhisperScopeValues);
/** The values of the table below, before freezing. */
const eventNameValues = {
    /** A text message to this client, its channel or the server. */
    TextMessage: "textMessage",
    /** A client coming into view, including every client already there on connecting. */
    ClientEnter: "clientEnter",
    /** A client going out of view. */
    ClientLeave: "clientLeave",
    /** A client changing channel. */
    ClientMoved: "clientMoved",
    /** A channel being created. */
    ChannelCreated: "channelCreated",
    /** A channel's properties being edited. */
    ChannelEdited: "channelEdited",
    /** A channel being moved or reordered. */
    ChannelMoved: "channelMoved",
    /** A channel being deleted. */
    ChannelDeleted: "channelDeleted",
    /** A channel's description changing; the text is not in it. */
    ChannelDescriptionChanged: "channelDescriptionChanged",
    /** A channel's password being set, changed or removed. */
    ChannelPasswordChanged: "channelPasswordChanged",
    /** The server's settings being edited. */
    ServerEdited: "serverEdited",
    /** A client's properties changing; carries only the changed ones. */
    ClientUpdated: "clientUpdated",
    /** A client added to a server group. */
    ClientServerGroupAdded: "clientServerGroupAdded",
    /** A client removed from a server group. */
    ClientServerGroupRemoved: "clientServerGroupRemoved",
    /** A client's channel group changing in a channel. */
    ClientChannelGroupChanged: "clientChannelGroupChanged",
    /** This client being subscribed to a channel. */
    ChannelSubscribed: "channelSubscribed",
    /** This client no longer being subscribed to a channel. */
    ChannelUnsubscribed: "channelUnsubscribed",
    /** A plugin command from a client. */
    PluginCommand: "pluginCommand",
    /** A client typing a private message to this client. */
    ClientChatComposing: "clientChatComposing",
    /** A client closing its private chat with this client. */
    ClientChatClosed: "clientChatClosed",
    /** The view being complete; see `ServerView`. */
    ViewReady: "viewReady",
    /** The view changing; see `ServerView`. */
    ViewChanged: "viewChanged",
    /** This client being poked. */
    Poked: "poked",
    /** Audio from another client. Only decoded with a listener or event middleware. */
    VoiceData: "voiceData",
    /**
     * Every notification the server sends, modelled or not, after any event it
     * produces; one with a typed event arrives here as well, not only there.
     */
    Notification: "notification",
    /** The handshake completing, on `connect()` and on every reconnection. */
    Connected: "connected",
    /** The connection ending, with its cause and whether a reconnection follows. */
    Disconnected: "disconnected",
    /** A kick from the server, which also ends the connection. */
    Kicked: "kicked",
};
/**
 * The names of the events `Client.on()` takes, as constants. `on(EventName.TextMessage, ...)`
 * and `on("textMessage", ...)` are the same call, and both give the listener
 * the same payload type.
 */
export const EventName = /* @__PURE__ */ Object.freeze(eventNameValues);
// Each direction fails to compile when `EventMap` and `EventName` drift: an
// event without a name, and a name that is not an event.
const eventNamesCoverEventMap = true;
const eventMapCoversEventNames = true;
void eventNamesCoverEventMap;
void eventMapCoversEventNames;
// ---- Resolved address (from discovery) --------------------------------------
/** The values of the table below, before freezing. */
const resolveSourceValues = {
    /** A `_ts3._udp` SRV record of the host named the address. */
    SRV: "SRV",
    /**
     * A TSDNS server, found through a `_tsdns._tcp` SRV record of the host's
     * domain, named the address.
     */
    TSDNSSRV: "TSDNS-SRV",
    /** A TSDNS server on the host's domain, at its default port, named the address. */
    TSDNSDirect: "TSDNS-Direct",
    /**
     * The address as given: an IP address, a name nothing else answered for, or
     * any name once resolution ran out of time.
     */
    Direct: "Direct",
};
/** How the built-in resolver found an address, as `ResolvedAddr` records it. */
export const ResolveSource = 
/* @__PURE__ */ Object.freeze(resolveSourceValues);
//# sourceMappingURL=types.js.map