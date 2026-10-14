import type { ChannelInfo, ChannelMember } from "@shared/voice-models";

export interface TreeChannel extends ChannelInfo {
  depth: number;
  members: ChannelMember[];
}

export interface ChannelSelectionInput {
  selectedChannelId: string;
  channelName: string;
  clientId: number;
}

/** 频道目录 → 展示树（旧 useWebClientChannels 的 channelTree computed 平价）：
 *  去重、前驱 order 链排序（断链回退源顺序）、孤儿/环安全（迭代遍历、每 id 至多
 *  一次）、成员注入 isSelf。纯函数，输入是会话 store 的目录快照。 */
export function buildChannelTree(channels: ChannelInfo[], clientId: number): TreeChannel[] {
  const unique = new Map<string, ChannelInfo>();
  for (const channel of channels) if (!unique.has(channel.id)) unique.set(channel.id, channel);
  const source = [...unique.values()];
  const sourceIndex = new Map(source.map((item, index) => [item.id, index]));
  const enriched: TreeChannel[] = source.map((item) => ({
    ...item,
    depth: 0,
    members: (item.members ?? []).map((member) => ({ ...member, isSelf: member.id === clientId })),
  }));
  const childrenByParent = new Map<string, TreeChannel[]>();
  for (const item of enriched) {
    const siblings = childrenByParent.get(item.parentID) ?? [];
    siblings.push(item);
    childrenByParent.set(item.parentID, siblings);
  }
  const orderedTree: TreeChannel[] = [];
  const visited = new Set<string>();
  const visit = (roots: TreeChannel[]) => {
    const pending = orderSiblings(roots, sourceIndex).reverse().map((channel) => ({ channel, depth: 0 }));
    while (pending.length) {
      const { channel, depth } = pending.pop()!;
      if (visited.has(channel.id)) continue;
      visited.add(channel.id);
      orderedTree.push({ ...channel, depth });
      const children = orderSiblings(childrenByParent.get(channel.id) ?? [], sourceIndex);
      for (let index = children.length - 1; index >= 0; index--) pending.push({ channel: children[index]!, depth: depth + 1 });
    }
  };
  visit(childrenByParent.get("0") ?? []);
  // 缺失的父频道升根；断开的环从其首个源条目续起。两次遍历都迭代且每 id 至多输出一次。
  visit(enriched.filter((channel) => !unique.has(channel.parentID) && channel.parentID !== "0"));
  for (const item of enriched) {
    if (!visited.has(item.id)) visit([item]);
  }
  return orderedTree;
}

function orderSiblings(siblings: TreeChannel[], sourceIndex: Map<string, number>): TreeChannel[] {
  const bySiblingId = new Map(siblings.map((item) => [item.id, item]));
  const successors = new Map<string, TreeChannel[]>();
  const roots: TreeChannel[] = [];
  const sourceOrder = (left: TreeChannel, right: TreeChannel) =>
    (sourceIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (sourceIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER);

  for (const item of siblings) {
    const predecessor = item.order && item.order !== "0" && bySiblingId.has(item.order) ? item.order : "";
    if (!predecessor) roots.push(item);
    else successors.set(predecessor, [...(successors.get(predecessor) ?? []), item]);
  }

  roots.sort(sourceOrder);
  for (const items of successors.values()) items.sort(sourceOrder);

  const ordered: TreeChannel[] = [];
  const visited = new Set<string>();
  const append = (item: TreeChannel) => {
    const pending = [item];
    while (pending.length) {
      const next = pending.pop()!;
      if (visited.has(next.id)) continue;
      visited.add(next.id);
      ordered.push(next);
      const following = successors.get(next.id) ?? [];
      for (let index = following.length - 1; index >= 0; index--) pending.push(following[index]!);
    }
  };
  for (const root of roots) append(root);
  for (const item of [...siblings].sort(sourceOrder)) append(item);
  return ordered;
}

/** 当前频道解析（旧 currentChannel computed 平价）：显式选台 > 自身所在频道 >
 *  频道名匹配 > 树首。 */
export function findCurrentChannel(tree: TreeChannel[], selection: ChannelSelectionInput): TreeChannel | undefined {
  const explicitlySelected = tree.find((item) => item.id === selection.selectedChannelId);
  if (explicitlySelected) return explicitlySelected;
  const fromSelf = tree.find((item) => item.members.some((member) => member.id === selection.clientId));
  if (fromSelf) return fromSelf;
  return tree.find((item) => item.name === selection.channelName) ?? tree[0];
}

/** 成员面板频道列表（旧 memberChannels 平价）：目录为空时以当前频道造占位行
 *  （id "__current__"，selectChannel 对它直接忽略）。 */
export function deriveMemberChannels(
  tree: TreeChannel[],
  fallback: { id?: string; name: string; description: string; members: ChannelMember[] },
): TreeChannel[] {
  if (tree.length) return tree;
  return [{
    id: "__current__",
    parentID: "0",
    name: fallback.name,
    description: fallback.description,
    members: fallback.members,
    depth: 0,
  }];
}

export function filterMemberChannels(channels: TreeChannel[], query: string): TreeChannel[] {
  const search = query.trim().toLowerCase();
  if (!search) return channels;
  return channels.filter((item) => item.name.toLowerCase().includes(search)
    || item.members.some((member) => member.nickname.toLowerCase().includes(search)));
}

export function collectWhisperTargets(whisperTargetIds: ReadonlySet<number>, members: ChannelMember[]): ChannelMember[] {
  return [...whisperTargetIds]
    .map((id) => members.find((member) => member.id === id))
    .filter((member): member is ChannelMember => Boolean(member));
}

/** 选台缺省补齐（旧 watch(channelTree) 平价）：未显式选台时按名字命中 >
 *  自身所在频道 补初始选中。返回新选中 id 或 null（无需变更）。 */
export function ensureSelectedChannelId(
  tree: TreeChannel[],
  selection: { selectedChannelId: string; channelName: string; clientId: number },
): string | null {
  if (selection.selectedChannelId || !tree[0]) return null;
  return tree.find((item) => item.name === selection.channelName)?.id
    ?? tree.find((item) => item.members.some((member) => member.id === selection.clientId))?.id
    ?? null;
}
