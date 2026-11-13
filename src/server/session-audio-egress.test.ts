import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "./session-audio-fixture.js";

// The per-speaker egress table only grows: a full server sees thousands of
// client ids in one session. It is swept on a schedule (never per voice frame)
// and the sweep releases speakers that have been silent for ten minutes.

test("the egress client table is pruned on a schedule, not on every frame", t => {
  const f = fixture();
  const prune = t.mock.method(f.transport as unknown as { pruneEgressClients(now: number): void }, "pruneEgressClients");
  // Cross the size threshold with a large room's worth of speakers.
  for (let clientId = 100; clientId < 400; clientId++) f.transport.receiveTeamSpeak(f.remote(clientId));
  const afterFill = prune.mock.callCount();
  assert.ok(afterFill > 0, "crossing the threshold must prune once");
  // A known speaker's frames used to rescan the whole table every 20 ms.
  for (let frame = 0; frame < 100; frame++) f.transport.receiveTeamSpeak(f.remote(399));
  assert.equal(prune.mock.callCount(), afterFill, "frames inside the interval must not rescan the table");
  f.state.now += 60_000;
  f.transport.receiveTeamSpeak(f.remote(399));
  assert.equal(prune.mock.callCount(), afterFill + 1, "the next interval prunes once");
});

test("pruning drops speakers that have been silent for the TTL", t => {
  const f = fixture();
  t.mock.method(f.transport as unknown as { pruneEgressClients(now: number): void }, "pruneEgressClients");
  for (let clientId = 100; clientId < 400; clientId++) f.transport.receiveTeamSpeak(f.remote(clientId));
  assert.equal(f.audio.egressFramesByClient["100"], 1);
  // Ten minutes later the old keys are stale; one frame from a new speaker
  // crosses the threshold again and the sweep clears them.
  f.state.now += 10 * 60_000;
  f.transport.receiveTeamSpeak(f.remote(999));
  assert.equal(f.audio.egressFramesByClient["100"], undefined, "a silent speaker's counter is released");
  assert.equal(f.audio.egressFramesByClient["999"], 1);
});
