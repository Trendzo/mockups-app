import { isMock, postJson, unwrapEnvelope } from './client';
import { CreateMockupsInput, MockupsResult, NamedImage } from '../types/api';
import { Mode, ModelGender } from '../types/enums';
import { uploadImage } from './catalog';
import { mockMockups } from './mock';

/**
 * Same POST /retailer/ai-catalog-beta/mockups, but from an already-hosted
 * apparel URL (e.g. a listing gallery photo) — no re-upload. Used by the
 * variant screen's "generate images" cards.
 */
export async function createMockupsFromUrl(
  apparelUrl: string,
  mode: Mode,
  modelGender?: ModelGender,
): Promise<NamedImage[]> {
  if (isMock()) {
    const r = await mockMockups({ apparel: { uri: apparelUrl } } as CreateMockupsInput);
    return mode === Mode.WithModel ? r.model : r.product;
  }
  const body: Record<string, unknown> = {
    mode,
    apparelImageUrls: [apparelUrl],
  };
  if (mode === Mode.WithModel && modelGender) body.modelGender = modelGender;
  const res = await postJson<unknown>('/retailer/ai-catalog-beta/mockups', body);
  return unwrapEnvelope<{ printed: string | null; images: NamedImage[] }>(res).images;
}

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

/**
 * Generate mockups from an ALREADY-HOSTED apparel URL (e.g. `listing.galleryUrls[0]`)
 * — no upload hop. One `mode` per call. Used by the variant image flow, which
 * attaches the returned `{name,url}` images to a variant's `imageUrls`.
 */
export async function generateMockupsFromUrl(input: {
  apparelImageUrl: string;
  mode: Mode;
  modelGender?: ModelGender;
}): Promise<NamedImage[]> {
  if (isMock()) {
    const model = input.mode === Mode.WithModel;
    return [
      { name: model ? 'model-front-studio' : 'front', url: input.apparelImageUrl },
      { name: model ? 'model-three-quarter' : 'back', url: input.apparelImageUrl },
    ];
  }

  const body: Record<string, unknown> = {
    mode: input.mode,
    apparelImageUrls: [input.apparelImageUrl],
  };
  if (input.mode === Mode.WithModel && input.modelGender) {
    body.modelGender = input.modelGender;
  }
  const res = await postJson<unknown>('/retailer/ai-catalog-beta/mockups', body);
  return unwrapEnvelope<{ printed: string | null; images: NamedImage[] }>(res).images;
}
