import assert from "node:assert/strict";
import test from "node:test";
import { applyChannelPasswordFlagNotification, parseChannelPasswordProtections } from "./channel-flags.js";

test("channel password protection is parsed as a public boolean and tracks channel edits", () => {
  const protections = parseChannelPasswordProtections([
    { cid: "1", channel_flag_password: "1" },
    { cid: "2", channel_flag_password: "0" },
    { cid: "3", channel_flag_password: "unknown" },
    { cid: "18446744073709551616", channel_flag_password: "1" },
  ]);
  assert.deepEqual([...protections], [[1n, true], [2n, false]]);

  assert.deepEqual(
    applyChannelPasswordFlagNotification("notifychanneledited", { cid: "1", channel_flag_password: "0" }, protections),
    { channelId: 1n, passwordProtected: false },
  );
  assert.deepEqual(
    applyChannelPasswordFlagNotification("notifychannelcreated", { cid: "4", channel_flag_password: "1" }, protections),
    { channelId: 4n, passwordProtected: true },
  );
  assert.equal(applyChannelPasswordFlagNotification("notifychanneldeleted", { cid: "4" }, protections), null);
  assert.equal(protections.has(4n), false);
  assert.equal(protections.has(3n), false, "unknown flag values are not interpreted as unlocked");
});
