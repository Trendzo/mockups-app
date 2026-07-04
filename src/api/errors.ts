import axios from 'axios';
import { ApiError } from '../types/api';

/**
 * Centralized error normalization. Every backend error is `{ error }` with a
 * non-2xx status; turn axios/network failures into that same friendly shape so
 * the UI never shows a raw dump (§4.4).
 */
export function normalizeError(err: unknown): ApiError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    // MVP backend returns { error: "msg" }; the closetx/Render backend returns
    // { error: { code, message } }. Coerce both to a plain string so the UI never
    // tries to render an object (which crashes React).
    const data = err.response?.data as
      | { error?: string | { code?: string; message?: string } }
      | undefined;
    const rawErr = data?.error;
    if (rawErr) {
      const msg =
        typeof rawErr === 'string'
          ? rawErr
          : rawErr.message || rawErr.code || 'Request failed.';
      return { error: msg, status };
    }

    if (err.code === 'ECONNABORTED') {
      return { error: 'The request timed out. Please try again.', status };
    }
    if (!err.response) {
      return {
        error:
          "Can't reach the server. Check the base URL in Dev Settings and that the backend is running.",
        status,
      };
    }
    switch (status) {
      case 400:
        return { error: 'Something in the request was invalid.', status };
      case 404:
        return { error: 'Not found.', status };
      case 502:
        return {
          error: 'Image generation failed. Your photo is safe — try again.',
          status,
        };
      case 500:
        return { error: 'The server hit an error. Please try again.', status };
      default:
        return { error: `Request failed (${status ?? 'network'}).`, status };
    }
  }
  if (err instanceof Error) return { error: err.message };
  return { error: 'Unexpected error.' };
}

/** True when the failure was a generation failure (502) — keep photo, offer retry. */
export const isGenerationFailure = (e: ApiError) => e.status === 502;

/** True when the server was unreachable — link the user to Dev Settings. */
export const isUnreachable = (e: ApiError) => e.status == null;
