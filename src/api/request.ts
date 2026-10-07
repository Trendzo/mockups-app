import { http, unwrapEnvelope } from './client';
import { normalizeAuthError } from './auth';

export { http };

/**
 * Run a retailer API call, unwrap the closetx `{ success, data }` envelope and
 * normalize failures to `{ code, message, status }` (AuthError) so screens can
 * show `e.message` directly. Same contract as catalogManagement's helper.
 */
export async function req<T>(fn: () => Promise<{ data: unknown }>): Promise<T> {
  try {
    const res = await fn();
    return unwrapEnvelope<T>(res.data);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

/** A key that stays stable across retries of ONE logical write (sale, hold…). */
export function idempotencyKey(prefix: string): string {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand()}${rand()}`;
}

/** Message off a normalized error (or anything thrown), with a fallback. */
export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  const m = (e as { message?: unknown })?.message;
  return typeof m === 'string' && m ? m : fallback;
}

/** Error code off a normalized error (AuthError.code), if any. */
export function errorCode(e: unknown): string | undefined {
  const c = (e as { code?: unknown })?.code;
  return typeof c === 'string' ? c : undefined;
}

/** Shared React Query retry policy: never retry auth/permission/not-found failures. */
export function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  const s = (error as { status?: number })?.status;
  if (s === 401 || s === 403 || s === 404 || s === 422) return false;
  return failureCount < 2;
}

/**
 * refetchInterval that stops once the server says this account can't see the
 * resource (401/403) — e.g. a staff login without order access — instead of
 * polling a guaranteed failure forever.
 */
export function pollUnlessForbidden(ms: number) {
  return (query: { state: { error: unknown } }): number | false => {
    const s = (query.state.error as { status?: number } | null)?.status;
    return s === 401 || s === 403 ? false : ms;
  };
}
