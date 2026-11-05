/**
 * The channels of a server as a tree whose sibling order is exact, and the
 * rules that keep it so across the channel events.
 */
import { type ChannelID } from "./command/ids.js";
import type { Channel } from "./api/command.js";
import type { ChannelCreatedEvent, ChannelDeletedEvent, ChannelEditedEvent, ChannelMovedEvent } from "./events.js";
/**
 * The channels of a server, parents before children and siblings in the
 * server's order. A tree never changes: `applyCreated`, `applyEdited`,
 * `applyMoved` and `applyDeleted` return the next one, so a tree that was
 * handed out stays as it was.
 *
 * The server sorts siblings by naming, for each, the sibling it comes after
 * (`order`, with 0 for first), and it rewrites that name on the sibling that
 * follows a change without telling anyone. So the tree keeps each parent's
 * children as a list and derives `order` from the position in it: the `order`
 * of a channel a tree holds is the id of the channel before it, whatever the
 * row or event it came from said. That is also what the server sends on the
 * next connection.
 *
 * It follows the channel events. A created channel goes after the sibling its
 * `order` names, with 0 for first. A moved channel leaves its old parent and
 * goes after the sibling named in its new one, together with its subchannels.
 * An edit that carries `order` is a move within the parent. A deleted channel
 * is removed.
 *
 * An event the tree cannot place, because it names a channel or a sibling the
 * tree does not hold, puts the channel at the end of its parent (the top level
 * when the parent is unknown) rather than losing it, and `consistent` turns
 * false and stays false. The tree then no longer mirrors the server for
 * certain; building a new one from a fresh listing with `ChannelTree.from`
 * does.
 *
 * To follow a server through a ServerQuery connection, build the tree from
 * `listChannels` and apply the four channel events to it, each with its own method.
 *
 * @experimental New in 1.x and may change in a minor release.
 */
export declare class ChannelTree {
    #private;
    private constructor();
    /**
     * A tree of `channels`, which may come in any order: the voice protocol's
     * welcome sends the ancestors of the client's own channel first. Siblings
     * are ordered by the `order` they name. A set that cannot be a tree, with a
     * channel twice, a parent or a predecessor missing, or a loop, is built
     * anyway and is not `consistent`.
     */
    static from(channels: Iterable<Channel>): ChannelTree;
    /** How many channels the tree holds. */
    get size(): number;
    /**
     * Whether the rows were a tree and every event so far could be placed. Once
     * false it stays false.
     */
    get consistent(): boolean;
    /** The channel, or `undefined` for one the tree does not hold. */
    get(id: ChannelID): Channel | undefined;
    /**
     * The channels directly under `parent`, in sibling order; the top level for
     * `undefined` or 0. Empty for an id the tree does not hold. A new array
     * each call.
     */
    children(parent?: ChannelID): readonly Channel[];
    /**
     * The channel and its ancestors, root first, so the channel is last. Empty
     * for an id the tree does not hold. A new array each call.
     */
    path(id: ChannelID): readonly Channel[];
    /**
     * The tree after a channel is created, which goes after the sibling that
     * `changes.order` names. The tree it is called on is untouched, as it is by
     * the three methods below; so is an event without a channel, which only
     * makes the tree inconsistent.
     */
    applyCreated(event: ChannelCreatedEvent): ChannelTree;
    /**
     * The tree after a channel is edited. An edit that carries `changes.order`
     * is a move within the parent; the parent and the order are otherwise the
     * tree's to keep.
     */
    applyEdited(event: ChannelEditedEvent): ChannelTree;
    /** The tree after a channel moves, with its subchannels, to a place under `parentID`. */
    applyMoved(event: ChannelMovedEvent): ChannelTree;
    /** The tree after a channel is deleted. */
    applyDeleted(event: ChannelDeletedEvent): ChannelTree;
}
//# sourceMappingURL=channel-tree.d.ts.map