import { isMock, postMultipart } from './client';
import { CreateMockupsInput, MockupsResult } from '../types/api';
import { toFormFile } from '../utils/image';
import { mockMockups } from './mock';

/** POST /api/mockups (multipart). Stateless quick mockups (§4.4). */
export async function createMockups(
  input: CreateMockupsInput,
): Promise<MockupsResult> {
  if (isMock()) return mockMockups(input);

  const form = new FormData();
  form.append('apparel', toFormFile(input.apparel) as unknown as Blob);
  if (input.design) {
    form.append('design', toFormFile(input.design) as unknown as Blob);
  }
  if (input.views) form.append('views', input.views);
  if (input.only?.length) form.append('only', input.only.join(','));

  return postMultipart<MockupsResult>('/api/mockups', form);
}
