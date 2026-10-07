import { OTPWidget } from '@msg91comm/sendotp-react-native';

/**
 * MSG91 half of the OTP client: the existing SDK flow, moved behind the provider-neutral
 * interface unchanged. The widget id / token are PUBLIC (the secret authkey is server-side).
 * Every SDK call answers either a bare string or `{type, message}`; `type === 'error'` is a
 * failure and `message` (or the string) is the reqId on send and the access token on verify.
 */
const WIDGET_ID = '3667636f3464353730373939';
const TOKEN_AUTH = '547225TSvi20QFa026a47d90aP1';

export const MSG91_OTP_LENGTH = 4;
export const MSG91_RESEND_SECONDS = 30;

export function initMsg91(): void {
  try {
    OTPWidget.initializeWidget(WIDGET_ID, TOKEN_AUTH);
  } catch {
    // Native module not linked (pre-rebuild): sending will error, email login still works.
  }
}

const payload = (res: unknown): string | null => {
  const v = typeof res === 'string' ? res : (res as { message?: unknown } | null)?.message;
  return v ? String(v) : null;
};

const failed = (res: unknown): boolean => (res as { type?: string } | null)?.type === 'error';

/** Returns the reqId to verify against. */
export async function msg91Send(dial: string, national: string): Promise<string> {
  const res: unknown = await OTPWidget.sendOTP({ identifier: `${dial}${national}` });
  if (failed(res)) throw new Error(payload(res) || 'Could not send OTP');
  const reqId = payload(res);
  if (!reqId) throw new Error('Could not send OTP');
  return reqId;
}

export async function msg91Resend(reqId: string): Promise<void> {
  await OTPWidget.retryOTP({ reqId });
}

/** Returns the access token the backend re-verifies. */
export async function msg91Verify(reqId: string, code: string): Promise<string> {
  const res: unknown = await OTPWidget.verifyOTP({ reqId, otp: code });
  if (failed(res)) throw new Error(payload(res) || 'Invalid OTP');
  const token = payload(res);
  if (!token) throw new Error('Verification failed');
  return token;
}
