// Ported from web/test/screen-share-ui.test.mjs — the composable's element
// binding / fullscreen / preset semantics. The old Vue watch/ref scaffolding
// became explicit factory calls driven by the React hook; the fullscreenchange
// listener lifecycle is hook boilerplate and stays unpinned here.
import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import type { ScreenShareStreamDescription as ScreenShareStream } from "@shared/screen-share";

import {
  computeScreenShareOutputSettings,
  createScreenShareView,
  DEFAULT_SCREEN_SHARE_PRESETS,
  findScreenShareStreamForMember,
  readScreenSharePresets,
  type ScreenSharePresets,
  type ScreenShareViewStorage,
} from "./screen-share-view";

class Element {}
class Video extends Element {
  srcObject: unknown = null;
  volume = 1;
  plays = 0;
  async play() { this.plays++; }
}

function harness(storageSeed?: Record<string, string>) {
  const storage = new Map(Object.entries(storageSeed ?? {}));
  const listeners = new Set<() => void>();
  let exits = 0;
  const doc = {
    fullscreenElement: null as unknown,
    addEventListener: (_event: string, fn: () => void) => { listeners.add(fn); },
    removeEventListener: (_event: string, fn: () => void) => { listeners.delete(fn); },
    async exitFullscreen() { exits++; doc.fullscreenElement = null; for (const fn of [...listeners]) fn(); },
  };
  vi.stubGlobal("HTMLElement", Element);
  vi.stubGlobal("HTMLVideoElement", Video);
  vi.stubGlobal("document", doc);
  const starts: Array<[boolean, unknown]> = [];
  const shareStorage: ScreenShareViewStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => void storage.set(key, value),
  };
  const view = createScreenShareView({
    startScreenShare: async (...args) => { starts.push(args as [boolean, unknown]); },
    storage: shareStorage,
  });
  return {
    view, starts, storage, shareStorage,
    video: () => new Video() as unknown as HTMLVideoElement,
    player: () => new Element() as unknown as HTMLElement,
    exits: () => exits,
  };
}

afterEach(() => vi.unstubAllGlobals());

test("a newly mounted or replaced video receives the existing stream and volume", async () => {
  const media = { id: "stream" } as unknown as MediaStream;
  const f = harness();
  const first = f.video();
  f.view.setVideoElement(first);
  await f.view.syncVideo({ stream: media, volume: 0.4, sinkId: "" });
  assert.equal(first.srcObject, media);
  assert.equal(first.volume, 0.4);
  const second = f.video();
  f.view.setVideoElement(second);
  await f.view.syncVideo({ stream: media, volume: 0.4, sinkId: "" });
  assert.equal(first.srcObject, null);
  assert.equal(second.srcObject, media);
  assert.equal(second.volume, 0.4);
  await f.view.syncVideo({ stream: media, volume: 0.7, sinkId: "" });
  assert.equal(second.volume, 0.7);
});

test("dispose detaches the video and retires a pending binding without stopping its stream", async () => {
  let stops = 0;
  const media = { getTracks: () => [{ stop: () => { stops++; } }] } as unknown as MediaStream;
  const f = harness();
  const video = f.video();
  f.view.setVideoElement(video);
  await f.view.syncVideo({ stream: media, volume: 0.8, sinkId: "" });
  f.view.dispose();
  assert.equal(video.srcObject, null);
  assert.equal(stops, 0);
});

test("absent player is never fullscreen and does not request fullscreen exit", () => {
  const f = harness();
  assert.equal(f.view.syncFullscreen(), false);
  f.view.exitPlayerFullscreen();
  assert.equal(f.exits(), 0);
});

test("removing a fullscreen player exits only that player's fullscreen", () => {
  const f = harness();
  const setFullscreenElement = (element: unknown) => { (document as unknown as { fullscreenElement: unknown }).fullscreenElement = element; };
  const player = f.player();
  f.view.setPlayerElement(player);
  setFullscreenElement(player);
  assert.equal(f.view.syncFullscreen(), true);
  f.view.setPlayerElement(null);
  assert.equal(f.exits(), 1);
  assert.equal(f.view.syncFullscreen(), false);
  f.view.setPlayerElement(f.player());
  setFullscreenElement(f.player());
  f.view.setPlayerElement(null);
  assert.equal(f.exits(), 1);
});

test("known screen owner IDs cannot fall back to another member with the same nickname", () => {
  const streams: ScreenShareStream[] = [];
  const match = (member: { id: number; nickname: string }) => findScreenShareStreamForMember(streams, member);
  streams.push({ streamId: "s", ownerClientId: 7, ownerPeerId: "peer", ownerNickname: "Same", name: "", source: "browser", audio: false, createdAt: 1, viewerCount: 0, viewers: [] });
  assert.equal(match({ id: 8, nickname: "Same" }), null);
  assert.equal(match({ id: 7, nickname: "Renamed" })?.streamId, "s");
  streams[0] = { streamId: "ts", ownerPeerId: "ts-7", ownerNickname: "Same", name: "", source: "teamspeak", audio: false, createdAt: 1, viewerCount: 0, viewers: [] };
  assert.equal(match({ id: 8, nickname: "Same" }), null);
  streams[0] = { streamId: "legacy", ownerPeerId: "unknown", ownerNickname: "Same", name: "", source: "browser", audio: false, createdAt: 1, viewerCount: 0, viewers: [] };
  assert.equal(match({ id: 8, nickname: "Same" })?.streamId, "legacy");
});

test("share settings submit the selected resolution and frame rate", async () => {
  const f = harness();
  await f.view.startWithSettings({ resolutionPreset: "720p", frameRate: 30, bitratePreset: "auto" });
  assert.deepEqual(f.starts, [[true, { maxWidth: 1280, maxHeight: 720, maxFrameRate: 30 }]]);
  assert.equal(f.storage.get("webspeak:screen-share-framerate"), "30");
});

test("share settings default to 1080p, 15 fps and auto bitrate, persisting all three", async () => {
  const f = harness();
  assert.deepEqual(readScreenSharePresets(f.shareStorage), DEFAULT_SCREEN_SHARE_PRESETS);
  assert.deepEqual(computeScreenShareOutputSettings(DEFAULT_SCREEN_SHARE_PRESETS), { maxWidth: 1920, maxHeight: 1080, maxFrameRate: 15 });
  await f.view.startWithSettings(DEFAULT_SCREEN_SHARE_PRESETS);
  assert.deepEqual(f.starts, [[true, { maxWidth: 1920, maxHeight: 1080, maxFrameRate: 15 }]]);
  assert.equal(f.storage.get("webspeak:screen-share-resolution"), "1080p");
  assert.equal(f.storage.get("webspeak:screen-share-framerate"), "15");
  assert.equal(f.storage.get("webspeak:screen-share-bitrate"), "auto");
});

test("a bitrate preset caps the encoder and stored presets are restored", async () => {
  const f = harness({
    "webspeak:screen-share-resolution": "720p",
    "webspeak:screen-share-framerate": "30",
    "webspeak:screen-share-bitrate": "8",
  });
  const presets: ScreenSharePresets = readScreenSharePresets(f.shareStorage);
  assert.deepEqual(presets, { resolutionPreset: "720p", frameRate: 30, bitratePreset: "8" });
  await f.view.startWithSettings(presets);
  assert.deepEqual(f.starts, [[true, { maxWidth: 1280, maxHeight: 720, maxFrameRate: 30, maxBitrate: 8_000_000 }]]);
  assert.equal(f.storage.get("webspeak:screen-share-bitrate"), "8");
});

test("corrupt stored share settings fall back to the defaults", () => {
  const f = harness({
    "webspeak:screen-share-resolution": "480p",
    "webspeak:screen-share-framerate": "999",
    "webspeak:screen-share-bitrate": "99",
  });
  assert.deepEqual(readScreenSharePresets(f.shareStorage), DEFAULT_SCREEN_SHARE_PRESETS);
});
