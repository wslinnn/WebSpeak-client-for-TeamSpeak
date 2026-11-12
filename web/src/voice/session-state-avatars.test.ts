// @vitest-environment node
// Node environment on purpose: the avatar probe path is driven with an explicit
// Image stand-in, so the counts below are deterministic (jsdom's Image never
// fires onload without a resource loader).
import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import { afterEach, beforeEach, test, vi } from "vitest";
import { createVoiceSessionState } from "./session-state";

/** Every probe creates one Image; each one loads successfully on the next tick. */
let probes: string[] = [];
class ImageStub {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(value: string) {
    probes.push(value);
    queueMicrotask(() => this.onload?.());
  }
}

beforeEach(() => {
  probes = [];
  vi.stubGlobal("Image", ImageStub);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function session() {
  const state = createVoiceSessionState({ selfId: () => 1, onMemberRemoved: () => {}, onMembersChanged: () => {} });
  state.receive({ type: "connected", tsClientId: 1, members: [] } as never);
  return state;
}

test("probed avatar URLs are remembered so a warm URL never re-probes (报告 21 F10)", async () => {
  const state = session();
  state.receive({ type: "avatarUpdate", uid: "user", url: "/avatars/a?v=1" } as never);
  await nextTurn();
  assert.deepEqual(probes, ["/avatars/a?v=1"]);
  state.receive({ type: "avatarUpdate", uid: "user", url: "/avatars/a?v=1" } as never);
  await nextTurn();
  assert.deepEqual(probes, ["/avatars/a?v=1"], "the same URL is applied without a second probe");
});

test("the validated-URL set stays bounded across many avatar changes", async () => {
  const state = session();
  // 250 次换图 = 250 个不同 URL（内容 hash 版本化），超过 200 条的缓存上限。
  for (let index = 0; index < 250; index++) {
    state.receive({ type: "avatarUpdate", uid: "user", url: `/avatars/a?v=${index}` } as never);
    await nextTurn();
  }
  assert.equal(probes.length, 250);
  probes = [];
  // 仍在窗口内的最近 URL：直接应用，不再探测。
  state.receive({ type: "avatarUpdate", uid: "user", url: "/avatars/a?v=249" } as never);
  // 已被挤出的最早 URL：需要重新探测（而不是无限记忆）。
  state.receive({ type: "avatarUpdate", uid: "user", url: "/avatars/a?v=0" } as never);
  await nextTurn();
  assert.deepEqual(probes, ["/avatars/a?v=0"]);
});
