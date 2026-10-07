/**
 * Remembers which orders have already been announced to the retailer so the two alert paths
 * (an FCM push shown while the app is open, and the 15 s poll in useNewOrderAlerts) never ring
 * twice for the same order.
 */
export interface AlertRegistry {
  /** True the first time `key` is seen inside the window (caller should alert); false if already announced. */
  claim(key: string): boolean;
  has(key: string): boolean;
  clear(): void;
}

export function createAlertRegistry(
  windowMs = 2 * 60_000,
  maxEntries = 200,
  now: () => number = Date.now,
): AlertRegistry {
  const seen = new Map<string, number>();

  const prune = () => {
    const t = now();
    for (const [k, at] of seen) if (t - at >= windowMs) seen.delete(k);
    // Bound memory on a very busy store: drop the oldest entries first.
    while (seen.size > maxEntries) {
      const oldest = seen.keys().next().value;
      if (oldest === undefined) break;
      seen.delete(oldest);
    }
  };

  return {
    claim(key) {
      prune();
      if (seen.has(key)) return false;
      seen.set(key, now());
      return true;
    },
    has(key) {
      prune();
      return seen.has(key);
    },
    clear() {
      seen.clear();
    },
  };
}

/** Process-wide registry shared by the push handlers and the poll hook. */
export const orderAlerts: AlertRegistry = createAlertRegistry();
