import { createStore } from "zustand/vanilla";
import type { ServerMessage } from "@shared/server-messages";
import type { ChannelInfo, ChannelMember, ChatMessage, ServerEvent } from "@shared/voice-models";

interface SessionStateOptions {
  selfId(): number;
  onMemberRemoved(id: number): void;
  onMembersChanged(): void;
  /** The TS server itself moved our client (admin action, channel deletion);
   *  the roster delta alone leaves the UI's channel selection stale. */
  onSelfMoved?(channelId: string): void;
}

// A hours-long session must not grow the chat array without bound; the visible
// pane only ever renders the tail, so trimming from the head loses nothing.
const CHAT_HISTORY_LIMIT = 500;
// Same bound for the server event log: busy rooms emit ~1 join/leave/move per
// second, and the events tab renders every entry it is handed.
const SERVER_EVENTS_LIMIT = 500;

export interface PokeNotification {
  id: string;
  invokerId: number;
  invokerUid: string;
  invokerName: string;
  message: string;
  timestamp: number;
}

/** Public session snapshot. Arrays are replaced (never mutated) on change and
 *  member/channel objects are swapped for fresh objects when a field changes,
 *  so consumer memoization can rely on reference identity. */
export interface VoiceSessionSnapshot {
  members: ChannelMember[];
  channels: ChannelInfo[];
  chatMessages: ChatMessage[];
  serverEvents: ServerEvent[];
  pokeNotifications: PokeNotification[];
  epoch: number;
  /** Bumped with every roster or chat sync: conversation-key mappings can
   *  change on both paths (known sender joins / unknown sender appears). */
  conversationKeysVersion: number;
}

export function createVoiceSessionState(options: SessionStateOptions) {
  const store = createStore<VoiceSessionSnapshot>(() => ({
    members: [], channels: [], chatMessages: [], serverEvents: [], pokeNotifications: [], epoch: 0,
    conversationKeysVersion: 0,
  }));
  let sequence = 0;
  const memberKeys = new Map<number, string>();
  const unknownSenders = new Map<number, string>();
  // Avatars arrive as capability URLs (avatarSnapshot / avatarUpdate) and
  // render as background-image URLs — the browser's HTTP cache absorbs every
  // refetch across refreshes and resumes, so the page never re-hauls bytes.
  // A URL only enters state after an Image probe loads: a miss (evicted
  // cache, stale id) keeps the initial-letter fallback instead of a blank
  // box. Keyed by uid so reconnects and later joins restore images without
  // any gateway traffic; a bounded LRU caps a long-lived page's memory.
  const avatars = new Map<string, string>();
  const AVATAR_CACHE_LIMIT = 200;

  // Live mutable working arrays; the public snapshot carries copies so
  // consumers see one consistent replacement per message.
  const members: ChannelMember[] = [];
  const channels: ChannelInfo[] = [];
  const chatMessages: ChatMessage[] = [];
  const serverEvents: ServerEvent[] = [];
  const pokeNotifications: PokeNotification[] = [];

  const syncRoster = (): void => {
    store.setState({
      members: [...members],
      channels: channels.map(channel => ({ ...channel, ...(channel.members ? { members: [...channel.members] } : {}) })),
      conversationKeysVersion: store.getState().conversationKeysVersion + 1,
    });
  };
  const syncChat = (): void => {
    store.setState({ chatMessages: [...chatMessages] });
  };
  const syncEvents = (): void => {
    store.setState({ serverEvents: [...serverEvents] });
  };
  const syncPokes = (): void => {
    store.setState({ pokeNotifications: [...pokeNotifications] });
  };

  const getAvatar = (uid: string): string | undefined => {
    const cached = avatars.get(uid);
    if (cached !== undefined) {
      avatars.delete(uid);
      avatars.set(uid, cached);
    }
    return cached;
  };
  // Member objects are shared between `members` and channel rosters; a field
  // change swaps in a fresh object at both positions so reference-based
  // rendering sees the update.
  const replaceMemberRef = (next: ChannelMember): void => {
    const index = members.findIndex(candidate => candidate.id === next.id);
    if (index >= 0) members[index] = next;
    for (const channel of channels) {
      const position = channel.members?.findIndex(candidate => candidate.id === next.id) ?? -1;
      if (position >= 0 && channel.members) channel.members[position] = next;
    }
  };
  const applyAvatar = (uid: string, url: string): void => {
    if (avatars.get(uid) === url) return;
    avatars.delete(uid);
    while (avatars.size >= AVATAR_CACHE_LIMIT) avatars.delete(avatars.keys().next().value!);
    avatars.set(uid, url);
    for (const member of members) {
      if (member.uid === uid && member.avatar !== url) replaceMemberRef({ ...member, avatar: url });
    }
    syncRoster();
  };
  // F10（报告 21）：同一头像 URL 只做一次 Image 探测，并飞行中的重复探测合并
  // ——HTTP 缓存只省字节，解码仍逐次发生；全服共享头像（ clan 头像）此前按
  // 成员数各解码一次。URL 带内容 hash 版本，换图即换 URL，集合无需失效逻辑。
  const validatedAvatarUrls = new Set<string>();
  const pendingAvatarProbes = new Map<string, Array<(applied: boolean) => void>>();
  const storeAvatar = (uid: string, url: string): void => {
    if (avatars.get(uid) === url) return;
    if (typeof Image === "undefined") { applyAvatar(uid, url); return; }
    if (validatedAvatarUrls.has(url)) { applyAvatar(uid, url); return; }
    const inflight = pendingAvatarProbes.get(url);
    if (inflight) {
      inflight.push((applied) => { if (applied) applyAvatar(uid, url); });
      return;
    }
    const waiters: Array<(applied: boolean) => void> = [(applied) => { if (applied) applyAvatar(uid, url); }];
    pendingAvatarProbes.set(url, waiters);
    const probe = new Image();
    probe.onload = () => {
      validatedAvatarUrls.add(url);
      pendingAvatarProbes.delete(url);
      applyAvatar(uid, url);
      for (const waiter of waiters.splice(0)) waiter(true);
    };
    probe.onerror = () => {
      pendingAvatarProbes.delete(url);
      for (const waiter of waiters.splice(0)) waiter(false); // keep the initial-letter fallback
    };
    probe.src = url;
  };
  const nextId = (kind: string) => `${kind}-${store.getState().epoch}-${sequence++}`;
  const normalize = (member: ChannelMember): ChannelMember => {
    const cached = !member.avatar && member.uid ? getAvatar(member.uid) : undefined;
    return { ...member, ...(cached ? { avatar: cached } : {}), isSelf: member.id === options.selfId() };
  };
  function conversationKey(id: number, uid?: string): string {
    if (uid) return `uid:${uid}`;
    const key = memberKeys.get(id) ?? nextId("member");
    memberKeys.set(id, key);
    return key;
  }
  function incomingConversationKey(id: number, uid?: string): string {
    if (uid) return `uid:${uid}`;
    const known = memberKeys.get(id);
    if (known) return known;
    const key = unknownSenders.get(id) ?? nextId("unknown-member");
    unknownSenders.set(id, key);
    return key;
  }

  function replaceMembers(next: ChannelMember[]): void {
    const byId = new Map(next.map(member => [member.id, normalize(member)]));
    for (const member of members) {
      const replacement = byId.get(member.id);
      if (!replacement || replacement.uid !== member.uid) {
        options.onMemberRemoved(member.id);
        memberKeys.delete(member.id);
      }
    }
    for (const member of byId.values()) memberKeys.set(member.id, conversationKey(member.id, member.uid));
    members.splice(0, members.length, ...byId.values());
    options.onMembersChanged();
  }

  function applyChannels(snapshot: ChannelInfo[]): void {
    // Current gateways send complete directories. Older gateways may omit a
    // channel's members; absence is unknown, not an authoritative empty list.
    const complete = snapshot.every(channel => Array.isArray(channel.members));
    const next = new Map((complete ? [] : members).map(member => [member.id, member]));
    for (const channel of snapshot) {
      for (const member of channel.members ?? []) next.set(member.id, member);
    }
    const previous = new Map(channels.map(channel => [channel.id, channel]));
    replaceMembers([...next.values()]);
    const canonical = new Map(members.map(member => [member.id, member]));
    const nextChannels = snapshot.map(channel => {
      const known = channel.members ?? previous.get(channel.id)?.members;
      return { ...channel, ...(known ? { members: known.flatMap(member => {
        const current = canonical.get(member.id);
        return current ? [current] : [];
      }) } : {}) };
    });
    channels.splice(0, channels.length, ...nextChannels);
  }

  /** Puts a member into a channel's roster without duplicating them. */
  function placeMember(id: number, channelId: string): void {
    const member = members.find(candidate => candidate.id === id);
    const target = channels.find(channel => channel.id === channelId);
    if (!member || !target) return;
    const list = target.members ?? (target.members = []);
    if (!list.some(candidate => candidate.id === id)) list.push(member);
  }

  function enter(member: ChannelMember): void {
    const index = members.findIndex(candidate => candidate.id === member.id);
    const previous = members[index];
    const sameIdentity = previous !== undefined && previous.uid === member.uid;
    const current = normalize(sameIdentity && previous ? { ...previous, ...member } : member);
    if (previous && !sameIdentity) {
      options.onMemberRemoved(member.id);
      memberKeys.delete(member.id);
    }
    memberKeys.set(member.id, conversationKey(member.id, member.uid));
    if (index < 0) members.push(current);
    else members[index] = current;
    for (const channel of channels) {
      const position = channel.members?.findIndex(candidate => candidate.id === member.id) ?? -1;
      if (position >= 0 && channel.members) channel.members[position] = current;
    }
    options.onMembersChanged();
  }

  /** Moves a member out of every channel roster; caller re-places them. */
  function unplaceMember(id: number): void {
    for (const channel of channels) {
      const position = channel.members?.findIndex(candidate => candidate.id === id) ?? -1;
      if (position >= 0 && channel.members) channel.members.splice(position, 1);
    }
  }

  function leave(id: number): void {
    options.onMemberRemoved(id);
    memberKeys.delete(id);
    unknownSenders.delete(id);
    const index = members.findIndex(member => member.id === id);
    if (index >= 0) members.splice(index, 1);
    for (const channel of channels) {
      if (channel.members) channel.members.splice(0, channel.members.length, ...channel.members.filter(member => member.id !== id));
    }
    options.onMembersChanged();
  }

  function connected(message: Extract<ServerMessage, { type: "connected" }>): void {
    // A new TeamSpeak connection invalidates its old directory, even when a
    // legacy connected message omits members. Same-socket chat history remains.
    channels.length = 0;
    memberKeys.clear();
    unknownSenders.clear();
    replaceMembers(message.members ?? []);
    serverEvents.splice(0, serverEvents.length, ...(message.serverEventLog ?? []));
    pokeNotifications.length = 0;
    syncRoster();
    syncEvents();
    syncPokes();
  }

  function receive(message: ServerMessage): boolean {
    switch (message.type) {
      case "memberEnter": {
        const { type: _type, channelId, ...member } = message;
        enter(member);
        if (channelId !== undefined) placeMember(member.id, String(channelId));
        syncRoster();
        break;
      }
      case "memberLeave":
        leave(message.id);
        syncRoster();
        break;
      case "memberUpdated": {
        const member = members.find(candidate => candidate.id === message.id);
        if (!member) break;
        const updated: ChannelMember = { ...member };
        if (message.nickname !== undefined) updated.nickname = message.nickname;
        if (message.uid !== undefined) updated.uid = message.uid;
        if (message.away !== undefined) updated.away = message.away;
        if (message.awayMessage !== undefined) updated.awayMessage = message.awayMessage;
        if (message.inputMuted !== undefined) updated.inputMuted = message.inputMuted;
        if (message.outputMuted !== undefined) updated.outputMuted = message.outputMuted;
        if (message.channelCommander !== undefined) updated.channelCommander = message.channelCommander;
        replaceMemberRef(updated);
        syncRoster();
        break;
      }
      case "memberMoved": {
        unplaceMember(message.id);
        if (message.channelId !== undefined) placeMember(message.id, String(message.channelId));
        if (message.id === options.selfId() && message.channelId !== undefined) options.onSelfMoved?.(String(message.channelId));
        syncRoster();
        break;
      }
      case "channelList":
        applyChannels(message.channels);
        syncRoster();
        break;
      case "channelCreated": {
        const incoming = message.channel;
        if (channels.some(channel => channel.id === incoming.id)) break;
        for (const member of incoming.members ?? []) enter(member);
        const canonical = new Map(members.map(member => [member.id, member]));
        const placed = (incoming.members ?? []).flatMap(member => {
          const current = canonical.get(member.id);
          return current ? [current] : [];
        });
        channels.push({ ...incoming, members: placed });
        syncRoster();
        break;
      }
      case "channelUpdated": {
        const index = channels.findIndex(candidate => candidate.id === message.id);
        if (index < 0) break;
        const channel = channels[index]!;
        channels[index] = { ...channel, name: message.name, ...(message.description !== undefined ? { description: message.description } : {}) };
        syncRoster();
        break;
      }
      case "channelRemoved": {
        const index = channels.findIndex(channel => channel.id === message.id);
        if (index >= 0) channels.splice(index, 1);
        syncRoster();
        break;
      }
      case "avatarSnapshot": {
        for (const item of message.avatars) storeAvatar(item.uid, item.url);
        break;
      }
      case "avatarUpdate": {
        storeAvatar(message.uid, message.url);
        break;
      }
      case "chatMessage": {
        if (message.invokerId === options.selfId()) break;
        const scope = message.scope === "channel" || message.scope === "server" || message.scope === "private" ? message.scope : "system";
        const targetId = message.targetId === undefined ? "" : String(message.targetId);
        appendChatMessage({ id: nextId("remote"), scope,
          ...(targetId && targetId !== "0" ? { targetId } : {}),
          ...(scope === "private" ? { conversationId: String(message.invokerId || 0),
            conversationKey: incomingConversationKey(message.invokerId || 0, message.senderUid),
            conversationName: message.invokerName || "Unknown" } : {}),
          senderId: message.invokerId, senderUid: message.senderUid, invokerName: message.invokerName || "Unknown",
          message: message.message, timestamp: message.timestamp ?? Date.now(),
        });
        syncChat();
        break;
      }
      case "serverEvent": {
        serverEvents.push(message.event);
        if (serverEvents.length > SERVER_EVENTS_LIMIT) serverEvents.splice(0, serverEvents.length - SERVER_EVENTS_LIMIT);
        syncEvents();
        break;
      }
      case "pokeReceived": {
        pokeNotifications.push({ id: nextId("poke"), invokerId: message.invokerId || 0,
          invokerUid: message.invokerUid || "", invokerName: message.invokerName || "Unknown",
          message: message.message, timestamp: message.timestamp ?? Date.now() });
        // Keep the in-session history bounded; the banner list renders the tail.
        if (pokeNotifications.length > 20) pokeNotifications.splice(0, pokeNotifications.length - 20);
        syncPokes();
        break;
      }
      default: return false;
    }
    return true;
  }

  function appendChatMessage(message: ChatMessage): void {
    chatMessages.push(message);
    if (chatMessages.length > CHAT_HISTORY_LIMIT) chatMessages.splice(0, chatMessages.length - CHAT_HISTORY_LIMIT);
  }

  function appendLocal(message: Omit<ChatMessage, "id" | "timestamp" | "isSelf">): void {
    appendChatMessage({ ...message, id: nextId("self"), timestamp: Date.now(), isSelf: true });
    syncChat();
  }

  function reset(): void {
    store.setState({ epoch: store.getState().epoch + 1 });
    replaceMembers([]);
    memberKeys.clear();
    unknownSenders.clear();
    channels.length = 0;
    chatMessages.length = 0;
    serverEvents.length = 0;
    pokeNotifications.length = 0;
    syncRoster();
    syncChat();
    syncEvents();
    syncPokes();
  }

  return { store, connected, receive, appendLocal, reset,
    /** Live working array for non-render consumers (e.g. volume sync inside
     *  onMembersChanged, which runs before the store snapshot syncs). */
    membersLive: () => members,
    memberConversationKey: (id: number) => memberKeys.get(id) };
}
