import axios from 'axios';
import { useSettings } from '../store/settings';
import { useAuth } from '../store/auth';
import { AuthError, AuthResult, LoginInput, SignupInput } from '../types/auth';

/**
 * Auth client for the closetx retailer backend. Separate base URL from the
 * mockups API (Dev Settings → "Auth base URL"). Responses use the envelope
 * { success, data } | { success:false, error:{ code, message, details } }.
 */
export const authHttp = axios.create({ timeout: 20000 });

authHttp.interceptors.request.use((config) => {
  config.baseURL = useSettings.getState().authBaseUrl;
  return config;
});

/** Turn any failure into a normalized AuthError. */
export function normalizeAuthError(err: unknown): AuthError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data as
      | { error?: { code?: string; message?: string; details?: { applicationId?: string } } }
      | undefined;
    const e = data?.error;
    if (e?.code || e?.message) {
      return {
        code: e.code ?? 'error',
        message: friendly(e.code, e.message),
        status,
        applicationId: e.details?.applicationId,
      };
    }
    if (!err.response) {
      return {
        code: 'unreachable',
        message:
          "Can't reach the auth server. Check the Auth base URL in Dev Settings.",
        status,
      };
    }
    return { code: 'error', message: `Request failed (${status}).`, status };
  }
  if (err instanceof Error) return { code: 'error', message: err.message };
  return { code: 'error', message: 'Unexpected error.' };
}

function friendly(code?: string, message?: string): string {
  switch (code) {
    case 'invalid_credentials':
      return 'Incorrect email or password.';
    case 'application_pending':
      return 'Your application is still under review. You can log in once approved.';
    case 'application_rejected':
      return 'Your application was rejected. Contact support.';
    case 'email_already_taken':
      return 'That email or phone is already registered.';
    case 'validation_error':
      return message || 'Please check the details and try again.';
    default:
      return message || 'Something went wrong.';
  }
}

async function unwrap<T>(promise: Promise<{ data: { success: boolean; data: T } }>): Promise<T> {
  const res = await promise;
  return res.data.data;
}

export async function loginRetailer(input: LoginInput): Promise<AuthResult> {
  try {
    return await unwrap<AuthResult>(
      authHttp.post('/auth/retailer/login', {
        email: input.email.trim().toLowerCase(),
        password: input.password,
      }),
    );
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

/**
 * Retailer phone-OTP login. The client verifies the OTP with MSG91, then posts
 * the resulting access token here; the backend re-verifies it with MSG91's
 * secret key, matches the phone to a retailer account, and mints a JWT. Same
 * envelope/shape and error codes as loginRetailer (never creates an account).
 */
export async function loginRetailerOtp(accessToken: string): Promise<AuthResult> {
  try {
    return await unwrap<AuthResult>(
      authHttp.post('/auth/retailer/otp/msg91', { accessToken }),
    );
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

export async function signupRetailer(input: SignupInput): Promise<AuthResult> {
  try {
    return await unwrap<AuthResult>(
      authHttp.post('/auth/retailer/signup', {
        email: input.email.trim().toLowerCase(),
        password: input.password,
        legalName: input.legalName.trim(),
        phone: input.phone.trim(),
        gstin: input.gstin.trim().toUpperCase(),
      }),
    );
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

/** Attach the retailer token to protected requests (used by clients that need it). */
export function authHeader(): Record<string, string> {
  const token = useAuth.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
