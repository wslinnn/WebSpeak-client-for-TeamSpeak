export interface PrefillResolverOptions {
  /** How long a completed resolution stays authoritative for the same target. */
  ttlMs: number;
  /** Injectable clock (tests pin it). */
  clock?: () => number;
}

/**
 * Bounds the unauthenticated `/api/public-config` prefill check.
 *
 * The lookup behind it reaches local DNS and the official nickname registry, so
 * an unprotected endpoint would let concurrent visitors amplify outbound work.
 * Two layers: a short positive/negative cache, and one shared in-flight promise
 * per target so a burst of cold requests still performs a single lookup — the
 * cache alone only helps *after* the first lookup finished.
 *
 * A failed lookup counts as "blocked": prefill must fail closed, while the
 * authoritative check stays on the join path.
 */
export function createPrefillResolver(
  resolve: (target: string) => Promise<boolean>,
  options: PrefillResolverOptions,
): (target: string) => Promise<boolean> {
  const clock = options.clock ?? Date.now;
  let cached: { key: string; blocked: boolean; at: number } | null = null;
  let inFlight: { key: string; promise: Promise<boolean> } | null = null;

  return async function prefillBlocked(target: string): Promise<boolean> {
    if (cached && cached.key === target && clock() - cached.at <= options.ttlMs) return cached.blocked;
    if (inFlight && inFlight.key === target) return inFlight.promise;
    const entry = {
      key: target,
      promise: (async (): Promise<boolean> => {
        let blocked: boolean;
        try {
          blocked = await resolve(target);
        } catch {
          blocked = true;
        }
        cached = { key: target, blocked, at: clock() };
        return blocked;
      })(),
    };
    inFlight = entry;
    try {
      return await entry.promise;
    } finally {
      if (inFlight === entry) inFlight = null;
    }
  };
}
