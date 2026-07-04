import { getJson, isMock, postJson, postMultipart, unwrapEnvelope } from './client';
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
import { toFormFile, UploadFile } from '../utils/image';
import {
  mockBrands,
  mockCategories,
  mockCreateSubmission,
  mockDecision,
  mockPublish,
} from './mock';

/**
 * closetx upload: POST /uploads?purpose=listing-gallery (multipart `file`) →
 * { data: { url, … } }. Images must be uploaded first; requests pass the URLs.
 */
export async function uploadImage(file: UploadFile): Promise<string> {
  const form = new FormData();
  form.append('file', toFormFile(file) as unknown as Blob);
  const res = await postMultipart<{ data: { url: string } }>(
    '/uploads?purpose=listing-gallery',
    form,
  );
  return unwrapEnvelope<{ url: string }>(res).url;
}

/**
 * POST /retailer/ai-catalog-beta/submissions. Uploads front (+ optional back /
 * design) photos, then submits their URLs. Synchronous — returns outputUrls.
 * Requires an ACTIVE retailer with a store.
 */
export async function createSubmission(
  input: CreateSubmissionInput,
): Promise<Submission> {
  if (isMock()) return mockCreateSubmission(input);

  const frontUrl = await uploadImage(input.apparel);
  const backUrl = input.apparelBack ? await uploadImage(input.apparelBack) : undefined;
  const designUrl = input.design ? await uploadImage(input.design) : undefined;
  const patternUrl = input.pattern ? await uploadImage(input.pattern) : undefined;
  const logoUrl = input.logo ? await uploadImage(input.logo) : undefined;
  const tagUrl = input.tag ? await uploadImage(input.tag) : undefined;

  const body: Record<string, unknown> = {
    mode: input.mode,
    apparelImageUrls: [frontUrl],
  };
  if (backUrl) body.apparelBackImageUrl = backUrl;
  if (designUrl) body.designImageUrl = designUrl;
  if (patternUrl) body.patternCloseupUrl = patternUrl;
  if (logoUrl) body.logoCloseupUrl = logoUrl;
  if (tagUrl) body.tagLabelUrl = tagUrl;
  // modelGender only applies to with_model generation.
  if (input.mode === 'with_model' && input.modelGender) {
    body.modelGender = input.modelGender;
  }
  if (input.prompt) body.prompt = input.prompt;
  if (input.only?.length) body.only = input.only;

  const res = await postJson<unknown>(
    '/retailer/ai-catalog-beta/submissions',
    body,
  );
  const d = unwrapEnvelope<any>(res);
  return {
    id: d.id,
    mode: d.mode ?? input.mode,
    status: d.status ?? 'ready_for_review',
    rawPhotos: d.rawPhotos ?? [frontUrl, backUrl].filter(Boolean),
    outputUrls: d.outputUrls ?? [],
  };
}

/** POST /retailer/ai-catalog-beta/submissions/:id/decision. */
export async function decideSubmission(
  id: string,
  input: DecisionInput,
): Promise<DecisionResult> {
  if (isMock()) return mockDecision(id, input);
  const res = await postJson<unknown>(
    `/retailer/ai-catalog-beta/submissions/${id}/decision`,
    input,
  );
  const d = unwrapEnvelope<any>(res);
  return { id: d?.id ?? id, status: d?.status };
}

/**
 * POST /retailer/ai-catalog-beta/submissions/:id/publish. Note: closetx requires
 * brandId, and the picked mockups go in `selectedImageUrls`.
 */
export async function publishSubmission(
  id: string,
  input: PublishInput,
): Promise<PublishResult> {
  if (isMock()) return mockPublish(id, input);
  const { galleryUrls, ...rest } = input;
  const body: Record<string, unknown> = { ...rest };
  if (galleryUrls) body.selectedImageUrls = galleryUrls;
  const res = await postJson<unknown>(
    `/retailer/ai-catalog-beta/submissions/${id}/publish`,
    body,
  );
  return unwrapEnvelope<PublishResult>(res);
}

/** GET /catalog/categories (envelope { success, data:[…] }). */
export async function getCategories(): Promise<Category[]> {
  if (isMock()) return mockCategories();
  const res = await getJson<{ data: Category[] }>('/catalog/categories');
  return unwrapEnvelope<Category[]>(res);
}

/** GET /catalog/brands. */
export async function getBrands(): Promise<Brand[]> {
  if (isMock()) return mockBrands();
  const res = await getJson<{ data: Brand[] }>('/catalog/brands');
  return unwrapEnvelope<Brand[]>(res);
}
