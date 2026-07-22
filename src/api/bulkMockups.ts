import { getJson, postJson, unwrapEnvelope } from './client';
import { uploadImage } from './catalog';
import { CreateSubmissionInput } from '../types/api';
import { BulkJobSummary, BulkJobStatus, BulkMockupJob } from '../types/bulkMockup';

/**
 * Enqueue a bulk-mockup job. Uploads the garment photos (same path as the
 * synchronous submission flow), then POSTs the URLs to the queue — returns the
 * `queued` job immediately (the worker generates async).
 */
export async function enqueueBulkMockup(input: CreateSubmissionInput): Promise<BulkMockupJob> {
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
  if (input.mode === 'with_model' && input.modelGender) body.modelGender = input.modelGender;
  if (input.prompt) body.prompt = input.prompt;
  if (input.only?.length) body.only = input.only;

  const res = await postJson<unknown>('/retailer/bulk-mockups', body);
  return unwrapEnvelope<BulkMockupJob>(res);
}

export async function listBulkJobs(status?: BulkJobStatus): Promise<BulkMockupJob[]> {
  const res = await getJson<{ data: BulkMockupJob[] }>('/retailer/bulk-mockups', {
    params: status ? { status } : undefined,
  });
  return unwrapEnvelope<BulkMockupJob[]>(res);
}

export async function bulkJobSummary(): Promise<BulkJobSummary> {
  const res = await getJson<{ data: BulkJobSummary }>('/retailer/bulk-mockups/summary');
  return unwrapEnvelope<BulkJobSummary>(res);
}

export async function cancelBulkJob(id: string): Promise<void> {
  await postJson(`/retailer/bulk-mockups/${id}/cancel`, {});
}

export async function dismissBulkJob(id: string): Promise<void> {
  await postJson(`/retailer/bulk-mockups/${id}/dismiss`, {});
}
