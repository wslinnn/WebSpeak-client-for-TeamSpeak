import type { Logger } from "./logger.js";

export interface GracefulShutdownStep {
  /** Named for the warning line; the order is the teardown order. */
  name: string;
  run: () => void | Promise<void>;
}

export interface GracefulShutdownOptions {
  steps: readonly GracefulShutdownStep[];
  logger: Pick<Logger, "info" | "warn">;
  /** Hard deadline for the whole sequence, default 10s. */
  timeoutMs?: number;
  /** Test seam for process.exit. */
  exit?: (code: number) => void;
}

/**
 * Idempotent process shutdown. A second SIGINT/SIGTERM during teardown must not
 * re-run the steps: `dgram.close()` twice throws ERR_SOCKET_DGRAM_NOT_RUNNING and
 * a double SQLite close throws as well, and the rejection used to skip
 * `process.exit`, leaving the operator with a half-closed process that keeps
 * running. Every step is isolated — one resource that refuses to
 * close must not abandon the remaining ones — and a watchdog forces the exit
 * when a step never settles.
 */
export function createGracefulShutdown(options: GracefulShutdownOptions): (signal: string) => Promise<void> {
  const exit = options.exit ?? ((code: number) => { process.exit(code); });
  const timeoutMs = options.timeoutMs ?? 10_000;
  let shuttingDown = false;
  return async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    options.logger.info({ signal }, "Shutting down");
    // unref: the watchdog must never be the reason the process stays alive, but
    // it still fires while any real handle (sockets, DB) is keeping the loop up.
    const watchdog = setTimeout(() => exit(1), timeoutMs);
    watchdog.unref?.();
    try {
      for (const step of options.steps) {
        try {
          await step.run();
        } catch (error: unknown) {
          options.logger.warn({
            step: step.name,
            err: error instanceof Error ? error.message : String(error),
          }, "Shutdown step failed");
        }
      }
    } finally {
      clearTimeout(watchdog);
    }
    exit(0);
  };
}
