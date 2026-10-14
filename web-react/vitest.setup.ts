import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// @sapphi-red/web-noise-suppressor declares an AudioWorkletNode subclass at
// import time (microphone-capture chain-loads it from session-controller).
// jsdom has no AudioWorkletNode, so the stub must exist before that import.
if (typeof globalThis.AudioWorkletNode === "undefined") {
  (globalThis as unknown as Record<string, unknown>).AudioWorkletNode = class {};
}
