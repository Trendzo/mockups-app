import { isMock, postJson, unwrapEnvelope } from './client';
import { CreateMockupsInput, MockupsResult, NamedImage } from '../types/api';
import { Mode } from '../types/enums';
import { uploadImage } from './catalog';
import { mockMockups } from './mock';

/**
 * POST /retailer/ai-catalog-beta/mockups (closetx). Stateless — no DB row.
 * One `mode` per call, so for both product + model we call twice and merge.
 * Returns { printed, images:[{name,url}] }.
 */
export async function createMockups(
  input: CreateMockupsInput,
): Promise<MockupsResult> {
  if (isMock()) return mockMockups(input);

  const apparelUrl = await uploadImage(input.apparel);
  const designUrl = input.design ? await uploadImage(input.design) : undefined;
  const patternUrl = input.pattern ? await uploadImage(input.pattern) : undefined;
  const logoUrl = input.logo ? await uploadImage(input.logo) : undefined;
  const tagUrl = input.tag ? await uploadImage(input.tag) : undefined;

  const call = async (mode: Mode) => {
    const body: Record<string, unknown> = {
      mode,
      apparelImageUrls: [apparelUrl],
    };
    if (designUrl) body.designImageUrl = designUrl;
    if (patternUrl) body.patternCloseupUrl = patternUrl;
    if (logoUrl) body.logoCloseupUrl = logoUrl;
    if (tagUrl) body.tagLabelUrl = tagUrl;
    if (mode === Mode.WithModel && input.modelGender) {
      body.modelGender = input.modelGender;
    }
    if (input.only?.length) body.only = input.only;
    const res = await postJson<unknown>(
      '/retailer/ai-catalog-beta/mockups',
      body,
    );
    return unwrapEnvelope<{ printed: string | null; images: NamedImage[] }>(res);
  };

  const wantProduct = input.views !== 'model';
  const wantModel = input.views !== 'product';

  const product = wantProduct ? await call(Mode.WithoutModel) : null;
  const model = wantModel ? await call(Mode.WithModel) : null;

  return {
    jobId: '',
    printed: product?.printed ?? model?.printed ?? null,
    product: product?.images ?? [],
    model: model?.images ?? [],
  };
}
