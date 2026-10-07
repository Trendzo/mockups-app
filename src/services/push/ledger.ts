/**
 * In-memory record of which (session, device-token) pair the server already knows about, so
 * the app does not POST /retailer/push on every foreground, login echo or token event.
 *
 * It is deliberately NOT persisted: every cold start re-registers once, which also refreshes
 * the server's `lastSeenAt` for the row.
 */
export const REREGISTER_AFTER_MS = 12 * 60 * 60_000;
/** After a 404 (server without the route yet) wait this long before asking again. */
export const UNSUPPORTED_RETRY_MS = 30 * 60_000;

export interface RegistrationLedger {
  /** Should we POST? False when this exact pair registered recently, or the server said "no such route" recently. */
  shouldRegister(authKey: string, token: string, now: number): boolean;
  markRegistered(authKey: string, token: string, now: number): void;
  markUnsupported(now: number): void;
  /** The pair last registered successfully, if any. */
  current(): { authKey: string; token: string } | null;
  clear(): void;
}

export function createRegistrationLedger(): RegistrationLedger {
  let registered: { authKey: string; token: string; at: number } | null = null;
  let unsupportedAt: number | null = null;

  return {
    shouldRegister(authKey, token, now) {
      if (unsupportedAt !== null && now - unsupportedAt < UNSUPPORTED_RETRY_MS) return false;
      if (
        registered &&
        registered.authKey === authKey &&
        registered.token === token &&
        now - registered.at < REREGISTER_AFTER_MS
      ) {
        return false;
      }
      return true;
    },
    markRegistered(authKey, token, now) {
      registered = { authKey, token, at: now };
      unsupportedAt = null;
    },
    markUnsupported(now) {
      unsupportedAt = now;
    },
    current() {
      return registered ? { authKey: registered.authKey, token: registered.token } : null;
    },
    clear() {
      registered = null;
      unsupportedAt = null;
    },
  };
}
