import { getJson, isMock, postJson, postMultipart } from './client';
import {
  Brand,
  Category,
  CreateSubmissionInput,
  DecisionInput,
  DecisionResult,
  PublishInput,
  PublishResult,
  Submission,
} from '../types/api';
import { toFormFile } from '../utils/image';
import {
  mockBrands,
  mockCategories,
  mockCreateSubmission,
  mockDecision,
  mockPublish,
} from './mock';

/** POST /api/catalog/submissions (multipart). Exact field names per §4.4. */
export async function createSubmission(
  input: CreateSubmissionInput,
): Promise<Submission> {
  if (isMock()) return mockCreateSubmission(input);

  const form = new FormData();
  form.append('mode', input.mode);
  form.append('apparel', toFormFile(input.apparel) as unknown as Blob);
  if (input.apparelBack) {
    form.append('apparelBack', toFormFile(input.apparelBack) as unknown as Blob);
  }
  if (input.design) {
    form.append('design', toFormFile(input.design) as unknown as Blob);
  }
  if (input.prompt) form.append('prompt', input.prompt);
  if (input.only?.length) form.append('only', input.only.join(','));

  return postMultipart<Submission>('/api/catalog/submissions', form);
}

/** POST /api/catalog/submissions/:id/decision (json). */
export async function decideSubmission(
  id: string,
  input: DecisionInput,
): Promise<DecisionResult> {
  if (isMock()) return mockDecision(id, input);
  return postJson<DecisionResult>(
    `/api/catalog/submissions/${id}/decision`,
    input,
  );
}

/** POST /api/catalog/submissions/:id/publish (json). */
export async function publishSubmission(
  id: string,
  input: PublishInput,
): Promise<PublishResult> {
  if (isMock()) return mockPublish(id, input);
  return postJson<PublishResult>(
    `/api/catalog/submissions/${id}/publish`,
    input,
  );
}

/** GET /api/catalog/categories. */
export async function getCategories(): Promise<Category[]> {
  if (isMock()) return mockCategories();
  const data = await getJson<{ categories: Category[] }>(
    '/api/catalog/categories',
  );
  return data.categories;
}

/** GET /api/catalog/brands. */
export async function getBrands(): Promise<Brand[]> {
  if (isMock()) return mockBrands();
  const data = await getJson<{ brands: Brand[] }>('/api/catalog/brands');
  return data.brands;
}
