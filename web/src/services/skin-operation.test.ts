import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createSkinOperation, createDownloadSignal } from "./skin-operation";

const tick = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

describe("createDownloadSignal", () => {
  it("aborts with the parent's reason when the parent operation aborts", async () => {
    const operation = createSkinOperation({ timeoutMs: 5_000 });
    const download = createDownloadSignal(operation.signal, 5_000);
    operation.cancel();
    assert.equal(download.signal.aborted, true);
    assert.equal((download.signal.reason as { name?: string }).name, "AbortError");
    download.dispose();
  });

  it("aborts on its own wider budget when the parent is still alive", async () => {
    const operation = createSkinOperation({ timeoutMs: 5_000 });
    const download = createDownloadSignal(operation.signal, 10);
    await tick(40);
    assert.equal(download.signal.aborted, true);
    assert.equal((download.signal.reason as { name?: string }).name, "TimeoutError");
    assert.equal(operation.signal.aborted, false);
    download.dispose();
    operation.finish();
  });

  it("stops listening after dispose", async () => {
    const operation = createSkinOperation({ timeoutMs: 5_000 });
    const download = createDownloadSignal(operation.signal, 5_000);
    download.dispose();
    operation.cancel();
    assert.equal(download.signal.aborted, false);
    operation.finish();
  });
});
