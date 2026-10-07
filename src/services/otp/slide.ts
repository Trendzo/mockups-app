/**
 * Slide (Synquic) OTP — client half. Plain `fetch` against Slide's PUBLIC endpoints (the same
 * ones Slide's own widget script calls): they take the public widget id + client token, no
 * secret and no custom headers, so this runs in React Native as-is (no SDK, no native module).
 * The backend re-verifies the resulting access token with the secret key
 * (POST /auth/<role>/otp/login).
 *
 *   POST {baseUrl}/otp/public/send   {widgetId, tokenAuth, identifier:"+<dial><national>"} -> {requestId}
 *   POST {baseUrl}/otp/public/retry  {requestId, channel?}                                 -> {requestId}
 *   POST {baseUrl}/otp/public/verify {requestId, otp}                                      -> {accessToken}
 */
export type SlideConfig = { baseUrl: string; widgetId: string; tokenAuth: string };

export class OtpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpError';
  }
}

const TIMEOUT_MS = 20_000;

/** Slide errors are `{message, error, statusCode}`; `message` may be a list (validation). */
function messageOf(body: unknown, status: number): string {
  const m = (body as { message?: unknown } | null)?.message;
  if (typeof m === 'string' && m) return m;
  if (Array.isArray(m) && m.length) return m.join(', ');
  return `OTP service error (${status})`;
}

async function post(cfg: SlideConfig, path: string, payload: object): Promise<Record<string, unknown>> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.baseUrl}/otp/public${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) throw new OtpError(messageOf(body, res.status));
    return body ?? {};
  } catch (err) {
    if (err instanceof OtpError) throw err;
    throw new OtpError(
      ctl.signal.aborted
        ? "Couldn't reach the OTP service. Check your connection and try again."
        : 'Could not reach the OTP service.',
    );
  } finally {
    clearTimeout(timer);
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** E.164 with '+', as Slide expects: `+<dial><national>`; a national number already carrying the dial code is not doubled. */
export function slideIdentifier(dial: string, national: string): string {
  const d = dial.replace(/\D/g, '');
  const n = national.replace(/\D/g, '').replace(/^0+/, '');
  return `+${n.startsWith(d) && n.length > 10 ? n : d + n}`;
}

export async function slideSend(cfg: SlideConfig, identifier: string): Promise<string> {
  const out = await post(cfg, '/send', {
    widgetId: cfg.widgetId,
    tokenAuth: cfg.tokenAuth,
    identifier,
  });
  const requestId = str(out.requestId);
  if (!requestId) throw new OtpError('Could not send OTP. Try again.');
  return requestId;
}

/** Resend. Returns the (possibly new) request id to verify against. */
export async function slideRetry(cfg: SlideConfig, requestId: string, channel?: string): Promise<string> {
  const out = await post(cfg, '/retry', { requestId, ...(channel ? { channel } : {}) });
  return str(out.requestId) ?? requestId;
}

export async function slideVerify(cfg: SlideConfig, requestId: string, otp: string): Promise<string> {
  const out = await post(cfg, '/verify', { requestId, otp });
  const accessToken = str(out.accessToken);
  if (!accessToken) throw new OtpError('OTP verification failed');
  return accessToken;
}
