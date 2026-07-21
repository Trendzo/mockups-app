import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { useSettings } from '../store/settings';
import { useAuth } from '../store/auth';

/**
 * Single axios instance. The base URL is injected per-request from the settings
 * store so the Dev Settings screen (editable base URL) takes effect immediately
 * without recreating the client. The retailer JWT is attached when present
 * (closetx retailer routes require it).
 */
export const http: AxiosInstance = axios.create({
  timeout: 120000, // generation can be slow
});

http.interceptors.request.use(config => {
  config.baseURL = useSettings.getState().baseUrl;
  const token = useAuth.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// No refresh endpoint exists on the backend, so the server is authoritative on
// expiry: a 401 on an authed call ends the session with reason 'expired', which
// sends the user back to Login (gated on the token) with a clear notice. Reading
// the token live inside the handler makes this single-flight - the first 401
// clears the token, so concurrent 401s that follow see no token and no-op.
http.interceptors.response.use(
  res => res,
  error => {
    const status = error?.response?.status;
    const cfg = error?.config;
    const where = `${cfg?.method?.toUpperCase?.() ?? ''} ${cfg?.baseURL ?? ''}${cfg?.url ?? ''}`.trim();
    // Log the full server response so an internal server error's actual body
    // (message/stack/details) is visible in the Metro/device console.
    console.error(
      `[API error] ${where} → ${status ?? 'no response'}`,
      error?.response?.data ?? error?.message ?? error,
    );
    const hadToken = !!useAuth.getState().token;
    if (status === 401 && hadToken) {
      useAuth.getState().logout('expired');
    }
    return Promise.reject(error);
  },
);

/** Unwrap the closetx envelope { success, data } → data. */
export function unwrapEnvelope<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as any)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

/** Are we in MOCK mode? Read live from the store. */
export const isMock = () => useSettings.getState().mock;

/** Current base URL (for building absolute /files fallbacks, health checks). */
export const currentBaseUrl = () => useSettings.getState().baseUrl;

export async function getJson<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await http.get<T>(url, config);
  return res.data;
}

export async function postJson<T>(
  url: string,
  body: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await http.post<T>(url, body, {
    headers: { 'Content-Type': 'application/json' },
    ...config,
  });
  return res.data;
}

export async function putJson<T>(
  url: string,
  body: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await http.put<T>(url, body, {
    headers: { 'Content-Type': 'application/json' },
    ...config,
  });
  return res.data;
}

export async function deleteJson<T>(
  url: string,
  body: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await http.delete<T>(url, {
    data: body,
    headers: { 'Content-Type': 'application/json' },
    ...config,
  });
  return res.data;
}

export async function postMultipart<T>(
  url: string,
  form: FormData,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await http.post<T>(url, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    ...config,
  });
  return res.data;
}
