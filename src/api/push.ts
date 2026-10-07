/**
 * Phone-push device tokens: POST /retailer/push (register) and POST /retailer/push/revoke.
 * Same bodies the driver and consumer apps send to their own mounts of the shared route:
 *   register { token, platform: 'ios' | 'android', appVersion? }   ->  { id }
 *   revoke   { token }                                             ->  { revoked: true }
 *
 * These calls carry the session token EXPLICITLY and bypass the shared axios client on purpose:
 *  - a revoke is sent while logging out, when the store's token is already gone (or, on an account
 *    switch, belongs to the NEW account), so it must use the token it is revoking for;
 *  - a 401 here must never trigger the global "session expired" logout.
 * A 404 (a server that does not mount the route yet) resolves to 'unsupported', never an error.
 */
import axios from 'axios';
import { useSettings } from '../store/settings';
import { normalizeAuthError } from './auth';
import type { PushPlatform } from '../services/push/types';

export type PushCallResult = 'ok' | 'unsupported';

export interface RegisterPushBody {
  token: string;
  platform: PushPlatform;
  appVersion?: string;
}

const pushHttp = axios.create({ timeout: 15000 });

async function authedPost(path: string, body: unknown, authToken: string): Promise<PushCallResult> {
  try {
    await pushHttp.post(path, body, {
      baseURL: useSettings.getState().baseUrl,
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    });
    return 'ok';
  } catch (e) {
    const err = normalizeAuthError(e);
    if (err.status === 404) return 'unsupported';
    throw err;
  }
}

/** Tell the server this device (FCM/APNs token) belongs to the signed-in retailer account. Idempotent server-side. */
export function registerPushToken(body: RegisterPushBody, authToken: string): Promise<PushCallResult> {
  const payload: RegisterPushBody = { token: body.token, platform: body.platform };
  if (body.appVersion) payload.appVersion = body.appVersion;
  return authedPost('/retailer/push', payload, authToken);
}

/** Stop pushing to this device for the account that `authToken` belongs to. */
export function revokePushToken(token: string, authToken: string): Promise<PushCallResult> {
  return authedPost('/retailer/push/revoke', { token }, authToken);
}
