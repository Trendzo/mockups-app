import { currentBaseUrl, http, isMock } from './client';

/**
 * Reachability check. The closetx backend serves health at the ROOT (`/health`),
 * not under the `/api/v1` prefix, so we hit the origin directly (absolute URL →
 * axios ignores the client baseURL).
 */
export async function getHealth(): Promise<{ ok: boolean }> {
  if (isMock()) return { ok: true };
  const origin = currentBaseUrl().replace(/\/api\/v\d+\/?$/, '').replace(/\/$/, '');
  await http.get(`${origin}/health`, { timeout: 8000 });
  return { ok: true };
}
