import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { useSettings } from '../store/settings';

/**
 * Single axios instance. The base URL is injected per-request from the settings
 * store so the Dev Settings screen (editable base URL) takes effect immediately
 * without recreating the client.
 */
export const http: AxiosInstance = axios.create({
  timeout: 120000, // generation can be slow
});

http.interceptors.request.use((config) => {
  config.baseURL = useSettings.getState().baseUrl;
  return config;
});

/** Are we in MOCK mode? Read live from the store. */
export const isMock = () => useSettings.getState().mock;

/** Current base URL (for building absolute /files fallbacks, health checks). */
export const currentBaseUrl = () => useSettings.getState().baseUrl;

export async function getJson<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
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
