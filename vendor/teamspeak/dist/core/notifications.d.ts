/**
 * The notifications a server pushes, read as the events every client
 * delivers.
 *
 * The voice protocol and ServerQuery carry the same notifications — a move is
 * `notifyclientmoved` on both — and only their framing differs, which each
 * client's own reader takes care of. So the parsing lives here, and both
 * clients call it rather than keeping a copy each.
 *
 * A result is one notification's worth: the event it makes, plus what only the
 * client can decide, such as whether a client that left view was itself.
 */
import type { Command } from "./command/command.js";
import type { ClientEntry } from "./api/clients.js";
import type { ChannelCreatedEvent, ChannelDeletedEvent, ChannelDescriptionChangedEvent, ChannelEditedEvent, ChannelMovedEvent, ChannelPasswordChangedEvent, ChannelSubscribedEvent, ChannelUnsubscribedEvent, ClientChatClosedEvent, ClientChatComposingEvent, ClientEnterEvent, ClientChannelGroupChangedEvent, ClientLeaveEvent, ClientMovedEvent, ClientServerGroupAddedEvent, ClientServerGroupRemovedEvent, ClientUpdatedEvent, PluginCommandEvent, PokeEvent, ServerEditedEvent, TextMessageEvent } from "./events.js";
/** What one notification amounts to. */
export type NotificationResult = {
    kind: "clientEnter";
    info: ClientEnterEvent;
} | {
    kind: "clientLeave";
    event: ClientLeaveEvent;
    isSelf: boolean;
} | {
    kind: "clientMoved";
    event: ClientMovedEvent;
} | {
    kind: "textMessage";
    message: TextMessageEvent;
} | {
    kind: "poked";
    event: PokeEvent;
} | {
    kind: "clientUpdated";
    event: ClientUpdatedEvent;
} | {
    kind: "clientServerGroupAdded";
    event: ClientServerGroupAddedEvent;
} | {
    kind: "clientServerGroupRemoved";
    event: ClientServerGroupRemovedEvent;
} | {
    kind: "clientChannelGroupChanged";
    event: ClientChannelGroupChangedEvent;
} | {
    kind: "channelCreated";
    event: ChannelCreatedEvent;
} | {
    kind: "channelEdited";
    event: ChannelEditedEvent;
} | {
    kind: "channelMoved";
    event: ChannelMovedEvent;
} | {
    kind: "channelDeleted";
    event: ChannelDeletedEvent;
} | {
    kind: "channelDescriptionChanged";
    event: ChannelDescriptionChangedEvent;
} | {
    kind: "channelPasswordChanged";
    event: ChannelPasswordChangedEvent;
} | {
    kind: "serverEdited";
    event: ServerEditedEvent;
} | {
    kind: "channelSubscribed";
    event: ChannelSubscribedEvent;
} | {
    kind: "channelUnsubscribed";
    event: ChannelUnsubscribedEvent;
} | {
    kind: "pluginCommand";
    event: PluginCommandEvent;
} | {
    kind: "clientChatComposing";
    event: ClientChatComposingEvent;
} | {
    kind: "clientChatClosed";
    event: ClientChatClosedEvent;
} | {
    kind: "unknown";
};
/**
 * Read a notification. `cmd` is the parsed notification line, `selfCLID` this
 * client's own id (0 when it is not known yet), and `clients` the clients the
 * caller knows, which the enter, leave, move, update and channel group
 * notifications keep current and the others read: a text message carries no
 * groups, and a move carries no `cfid` on TS3. An entry is
 * replaced, never edited, so an event that holds one stays as it was.
 *
 * The server-group notifications leave the clients alone: the update that
 * accompanies them carries the whole new list, in either order, and is the
 * only writer of it.
 */
export declare function handleNotification(cmd: Command, selfCLID: number, clients: Map<number, ClientEntry>): NotificationResult;
//# sourceMappingURL=notifications.d.ts.map