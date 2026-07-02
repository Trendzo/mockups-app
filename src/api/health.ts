import { getJson, isMock } from './client';

/** GET /health -> { ok: true }. Used by the "can't reach server" check. */
export async function getHealth(): Promise<{ ok: boolean }> {
  if (isMock()) return { ok: true };
  return getJson<{ ok: boolean }>('/health', { timeout: 6000 });
}
