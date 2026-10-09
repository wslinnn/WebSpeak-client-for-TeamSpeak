import { reactive, ref } from "vue";
import type { ServerMessage } from "../../../src/shared/server-messages.js";
import type { ChannelInfo, ChannelMember, ChatMessage, ServerEvent } from "../../../src/shared/voice-models.js";

interface SessionStateOptions {
  selfId(): number;
  onMemberRemoved(id: number): void;
  onMembersChanged(): void;
}

export function createVoiceSessionState(options: SessionStateOptions) {
  const epoch = ref(0);
  const members = reactive<ChannelMember[]>([]);
  const channels = reactive<ChannelInfo[]>([]);
  const chatMessages = reactive<ChatMessage[]>([]);
  const serverEvents = reactive<ServerEvent[]>([]);
  const pokeNotifications = reactive<{ id: string; invokerId: number; invokerUid: string; invokerName: string; message: string; timestamp: number }[]>([]);
  let sequence = 0;
  const memberKeys = reactive(new Map<number, string>());
  const unknownSenders = new Map<number, string>();
  // Avatars arrive once per uid (memberAvatar) and never ride the directory.
  // Keyed by uid so reconnects and later joins restore images without a new
  // download; survives session resets on purpose.
  const avatars = new Map<string, string>();
  const nextId = (kind: string) => `${kind}-${epoch.value}-${sequence++}`;
  const normalize = (member: ChannelMember): ChannelMember => {
    const cached = !member.avatar && member.uid ? avatars.get(member.uid) : undefined;
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
    const sameIdentity = previous && previous.uid === member.uid;
    const current = normalize(sameIdentity ? { ...previous, ...member } : member);
    if (previous && !sameIdentity) {
      options.onMemberRemoved(member.id);
      memberKeys.delete(member.id);
    }
    memberKeys.set(member.id, conversationKey(member.id, member.uid));
    if (index < 0) members.push(current);
    else members.splice(index, 1, current);
    const canonical = members[index < 0 ? members.length - 1 : index];
    for (const channel of channels) {
      const position = channel.members?.findIndex(candidate => candidate.id === member.id) ?? -1;
      if (position >= 0) channel.members!.splice(position, 1, canonical);
    }
    options.onMembersChanged();
  }

  /** Moves a member out of every channel roster; caller re-places them. */
  function unplaceMember(id: number): void {
    for (const channel of channels) {
      const position = channel.members?.findIndex(candidate => candidate.id === id) ?? -1;
      if (position >= 0) channel.members!.splice(position, 1);
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
  }

  function receive(message: ServerMessage): boolean {
    switch (message.type) {
      case "memberEnter": {
        const { type: _type, channelId, ...member } = message;
        enter(member);
        if (channelId !== undefined) placeMember(member.id, String(channelId));
        break;
      }
      case "memberLeave": leave(message.id); break;
      case "memberUpdated": {
        const member = members.find(candidate => candidate.id === message.id);
        if (!member) break;
        if (message.nickname !== undefined) member.nickname = message.nickname;
        if (message.uid !== undefined) member.uid = message.uid;
        if (message.away !== undefined) member.away = message.away;
        if (message.awayMessage !== undefined) member.awayMessage = message.awayMessage;
        if (message.inputMuted !== undefined) member.inputMuted = message.inputMuted;
        if (message.outputMuted !== undefined) member.outputMuted = message.outputMuted;
        if (message.channelCommander !== undefined) member.channelCommander = message.channelCommander;
        break;
      }
      case "memberMoved": {
        unplaceMember(message.id);
        if (message.channelId !== undefined) placeMember(message.id, String(message.channelId));
        break;
      }
      case "channelList": applyChannels(message.channels); break;
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
        break;
      }
      case "channelUpdated": {
        const channel = channels.find(candidate => candidate.id === message.id);
        if (!channel) break;
        channel.name = message.name;
        if (message.description !== undefined) channel.description = message.description;
        break;
      }
      case "channelRemoved": {
        const index = channels.findIndex(channel => channel.id === message.id);
        if (index >= 0) channels.splice(index, 1);
        break;
      }
      case "memberAvatar": {
        const uid = message.uid;
        if (!uid || !message.avatar) break;
        avatars.set(uid, message.avatar);
        for (const member of members) {
          if (member.uid === uid) member.avatar = message.avatar;
        }
        break;
      }
      case "chatMessage": {
        if (message.invokerId === options.selfId()) break;
        const scope = message.scope === "channel" || message.scope === "server" || message.scope === "private" ? message.scope : "system";
        const targetId = message.targetId === undefined ? "" : String(message.targetId);
        chatMessages.push({ id: nextId("remote"), scope,
          ...(targetId && targetId !== "0" ? { targetId } : {}),
          ...(scope === "private" ? { conversationId: String(message.invokerId || 0),
            conversationKey: incomingConversationKey(message.invokerId || 0, message.senderUid),
            conversationName: message.invokerName || "Unknown" } : {}),
          senderId: message.invokerId, senderUid: message.senderUid, invokerName: message.invokerName || "Unknown",
          message: message.message, timestamp: message.timestamp ?? Date.now(),
        });
        break;
      }
      case "serverEvent": serverEvents.push(message.event); break;
      case "pokeReceived":
        pokeNotifications.push({ id: nextId("poke"), invokerId: message.invokerId || 0,
          invokerUid: message.invokerUid || "", invokerName: message.invokerName || "Unknown",
          message: message.message, timestamp: message.timestamp ?? Date.now() });
        break;
      default: return false;
    }
    return true;
  }

  function appendLocal(message: Omit<ChatMessage, "id" | "timestamp" | "isSelf">): void {
    chatMessages.push({ ...message, id: nextId("self"), timestamp: Date.now(), isSelf: true });
  }

  function reset(): void {
    epoch.value++;
    replaceMembers([]);
    memberKeys.clear();
    unknownSenders.clear();
    channels.length = 0;
    chatMessages.length = 0;
    serverEvents.length = 0;
    pokeNotifications.length = 0;
  }

  return { epoch, members, channels, chatMessages, serverEvents, pokeNotifications, connected, receive, appendLocal, reset,
    memberConversationKey: (id: number) => memberKeys.get(id) };
}
