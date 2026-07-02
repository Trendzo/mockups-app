import { isMock, postMultipart } from './client';
import { CreateTryonInput, TryonResult } from '../types/api';
import { toFormFile } from '../utils/image';
import { mockTryon } from './mock';

/**
 * POST /api/tryon (multipart). `garments` is appended 1..2 times in order
 * (e.g. top then bottom) — each is applied sequentially by the backend (§4.4).
 */
export async function createTryon(
  input: CreateTryonInput,
): Promise<TryonResult> {
  if (isMock()) return mockTryon(input);

  const form = new FormData();
  form.append('person', toFormFile(input.person) as unknown as Blob);
  input.garments.slice(0, 2).forEach((g) => {
    form.append('garments', toFormFile(g) as unknown as Blob);
  });

  return postMultipart<TryonResult>('/api/tryon', form);
}
