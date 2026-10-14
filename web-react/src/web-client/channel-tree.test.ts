import { describe, expect, it } from "vitest";

import type { ChannelInfo } from "@shared/voice-models";

import { buildChannelTree, deriveMemberChannels, ensureSelectedChannelId, filterMemberChannels, findCurrentChannel } from "./channel-tree";

const CLIENT_ID = 1;

describe("buildChannelTree（旧 channelTree characterization 平价）", () => {
  it("cyclic, orphaned and duplicate channel entries produce a finite unique tree", () => {
    const tree = buildChannelTree([
      { id: "1", parentID: "1", name: "Self cycle" },
      { id: "2", parentID: "3", name: "Cycle A" }, { id: "3", parentID: "2", name: "Cycle B" },
      { id: "4", parentID: "99", name: "Orphan" }, { id: "4", parentID: "0", name: "Duplicate" },
    ], CLIENT_ID);
    expect(tree).toHaveLength(4);
    expect(new Set(tree.map((channel) => channel.id)).size).toBe(4);
    expect(tree.find((channel) => channel.id === "4")?.name).toBe("Orphan");
    expect(tree.every((channel) => channel.depth >= 0 && channel.depth <= 1)).toBe(true);
  });

  it("channel traversal preserves sibling predecessors and handles a deep directory without recursion", () => {
    const normal = buildChannelTree([
      { id: "3", parentID: "0", order: "2", name: "Third" }, { id: "2", parentID: "0", order: "1", name: "Second" },
      { id: "1", parentID: "0", order: "0", name: "First" }, { id: "4", parentID: "1", name: "Child" },
    ], CLIENT_ID);
    expect(normal.map((channel) => [channel.id, channel.depth])).toEqual([["1", 0], ["4", 1], ["2", 0], ["3", 0]]);
    const deep = buildChannelTree(
      Array.from({ length: 5_000 }, (_, index) => ({ id: String(index + 1), parentID: String(index), name: "Deep" })).reverse() as ChannelInfo[],
      CLIENT_ID,
    );
    expect(deep).toHaveLength(5_000);
    expect(deep.at(-1)?.depth).toBe(4_999);
  });

  it("members get isSelf injected from the client id", () => {
    const tree = buildChannelTree([
      { id: "1", name: "Lobby", members: [{ id: CLIENT_ID, nickname: "Me", uid: "u1" }, { id: 7, nickname: "Other", uid: "u7" }] },
    ] as ChannelInfo[], CLIENT_ID);
    expect(tree[0]?.members.map((member) => member.isSelf)).toEqual([true, false]);
  });
});

describe("findCurrentChannel（旧 currentChannel computed 平价）", () => {
  it("explicit selection wins over self location, then name match, then the first channel", () => {
    const tree = buildChannelTree([
      { id: "1", name: "Lobby", members: [{ id: CLIENT_ID, nickname: "Me" }] },
      { id: "2", name: "Games" },
      { id: "3", name: "AFK" },
    ] as ChannelInfo[], CLIENT_ID);
    const view = (selection: { selectedChannelId?: string; channelName?: string } = {}) =>
      findCurrentChannel(tree, { selectedChannelId: selection.selectedChannelId ?? "", channelName: selection.channelName ?? "", clientId: CLIENT_ID });
    expect(view({ selectedChannelId: "3" })?.id).toBe("3");
    expect(view()?.id).toBe("1");
    // 自身位置优先于名字匹配：人在 Lobby 时叫 Games 也回 Lobby
    expect(view({ channelName: "Games" })?.id).toBe("1");
    // 无自位置时名字命中，最后回退树首
    const treeNoSelf = buildChannelTree([
      { id: "1", name: "Lobby" }, { id: "2", name: "Games" },
    ] as ChannelInfo[], CLIENT_ID);
    const viewNoSelf = (channelName: string) =>
      findCurrentChannel(treeNoSelf, { selectedChannelId: "", channelName, clientId: CLIENT_ID });
    expect(viewNoSelf("Games")?.id).toBe("2");
    expect(viewNoSelf("Missing")?.id).toBe("1");
  });
});

describe("deriveMemberChannels（旧 memberChannels 平价）", () => {
  it("an empty directory falls back to a __current__ placeholder row", () => {
    const fallback = deriveMemberChannels([], { name: "Lobby", description: "", members: [{ id: 1, nickname: "Me" }] });
    expect(fallback).toHaveLength(1);
    expect(fallback[0]?.id).toBe("__current__");
    expect(fallback[0]?.name).toBe("Lobby");
  });
});

describe("filterMemberChannels（旧 filteredMemberChannels 平价）", () => {
  it("matches channel names and member nicknames case-insensitively", () => {
    const tree = buildChannelTree([
      { id: "1", name: "Lobby", members: [{ id: 5, nickname: "Alice" }] },
      { id: "2", name: "Games", members: [{ id: 6, nickname: "Bob" }] },
    ] as ChannelInfo[], CLIENT_ID);
    expect(filterMemberChannels(tree, " gam ").map((item) => item.id)).toEqual(["2"]);
    expect(filterMemberChannels(tree, "alice").map((item) => item.id)).toEqual(["1"]);
    expect(filterMemberChannels(tree, "")).toHaveLength(2);
  });
});

describe("ensureSelectedChannelId（旧 watch(channelTree) 平价）", () => {
  it("only fills an empty selection, by name first and self location second", () => {
    const tree = buildChannelTree([
      { id: "1", name: "Lobby" },
      { id: "2", name: "Games", members: [{ id: CLIENT_ID, nickname: "Me" }] },
    ] as ChannelInfo[], CLIENT_ID);
    expect(ensureSelectedChannelId(tree, { selectedChannelId: "", channelName: "Games", clientId: CLIENT_ID })).toBe("2");
    expect(ensureSelectedChannelId(tree, { selectedChannelId: "", channelName: "Missing", clientId: CLIENT_ID })).toBe("2");
    expect(ensureSelectedChannelId(tree, { selectedChannelId: "1", channelName: "Games", clientId: CLIENT_ID })).toBeNull();
    expect(ensureSelectedChannelId([], { selectedChannelId: "", channelName: "", clientId: CLIENT_ID })).toBeNull();
  });
});
