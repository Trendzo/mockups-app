/**
 * MOCK mode data (§8.5). Lets the entire UI be exercised without a backend.
 * Toggle via .env `MOCK=true` or the in-app Dev Settings switch. Placeholder
 * images come from picsum (needs internet) with a stable seed per view.
 */
import {
  Brand,
  Category,
  CreateMockupsInput,
  CreateSubmissionInput,
  CreateTryonInput,
  DecisionInput,
  DecisionResult,
  Listing,
  MockupsResult,
  PublishInput,
  PublishResult,
  Submission,
  TryonResult,
  Variant,
} from '../types/api';
import {
  Gender,
  ListingPolicy,
  Mode,
  SubmissionStatus,
  viewsForMode,
} from '../types/enums';

const img = (seed: string) => `https://picsum.photos/seed/${seed}/900/1200`;

const delay = <T>(value: T, ms = 1400): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

let counter = 1000;
const nextId = (prefix: string) => `${prefix}${(counter += 1)}`;

export async function mockCreateSubmission(
  input: CreateSubmissionInput,
): Promise<Submission> {
  const views = (input.only?.length
    ? input.only
    : viewsForMode(input.mode).slice(0, 4)) as string[];
  const id = nextId('aics_');
  const outputUrls = views.map((v) => img(`${id}-${v}`));
  return delay(
    {
      id,
      mode: input.mode,
      status: SubmissionStatus.ReadyForReview,
      rawPhotos: [img(`${id}-apparel`)],
      outputUrls,
    },
    2600,
  );
}

export async function mockDecision(
  id: string,
  input: DecisionInput,
): Promise<DecisionResult> {
  return delay(
    {
      id,
      status:
        input.decision === 'accept'
          ? SubmissionStatus.Accepted
          : SubmissionStatus.Rejected,
    },
    700,
  );
}

export async function mockCategories(): Promise<Category[]> {
  return delay(
    [
      { id: 'cat_1', slug: 'tshirts', label: 'T-Shirts', gender: Gender.Unisex },
      { id: 'cat_2', slug: 'hoodies', label: 'Hoodies', gender: Gender.Unisex },
      { id: 'cat_3', slug: 'dresses', label: 'Dresses', gender: Gender.Her },
      { id: 'cat_4', slug: 'shirts', label: 'Shirts', gender: Gender.Him },
    ],
    500,
  );
}

export async function mockBrands(): Promise<Brand[]> {
  return delay(
    [
      { id: 'brd_1', slug: 'trenzo', name: 'Trenzo' },
      { id: 'brd_2', slug: 'northline', name: 'Northline' },
      { id: 'brd_3', slug: 'atelier', name: 'Atelier 9' },
    ],
    500,
  );
}

export async function mockPublish(
  id: string,
  input: PublishInput,
): Promise<PublishResult> {
  const now = new Date(0).toISOString();
  const listing: Listing = {
    id: nextId('lst_'),
    storeId: 'str_mock',
    brandId: input.brandId ?? null,
    categoryId: input.categoryId,
    name: input.name,
    description: input.description ?? null,
    gender: input.gender,
    listingPolicy: input.listingPolicy ?? ListingPolicy.Return,
    galleryUrls: input.galleryUrls ?? [],
    occasion: input.occasion ?? [],
    ageGroups: input.ageGroups ?? [],
    status: 'draft',
    variantMode: 'single',
    ratingAvg: '0.00',
    ratingCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  const variant: Variant = {
    id: nextId('var_'),
    listingId: listing.id,
    storeId: 'str_mock',
    groupId: nextId('vgrp_'),
    sku: null,
    attributes: {},
    attributesLabel: 'Default',
    imageUrls: [],
    isActive: true,
    stock: input.stock ?? 0,
    reserved: 0,
    pricePaise: input.pricePaise,
    compareAtPrice: input.compareAtPrice ?? null,
  };
  return delay({ listing, variant }, 900);
}

export async function mockMockups(
  input: CreateMockupsInput,
): Promise<MockupsResult> {
  const jobId = nextId('job_');
  return delay(
    {
      jobId,
      printed: input.design ? img(`${jobId}-printed`) : null,
      product: [
        { name: 'front', url: img(`${jobId}-front`) },
        { name: 'back', url: img(`${jobId}-back`) },
      ],
      model: [{ name: 'model-front-studio', url: img(`${jobId}-model`) }],
    },
    2200,
  );
}

export async function mockTryon(input: CreateTryonInput): Promise<TryonResult> {
  const jobId = nextId('job_');
  const steps = input.garments.map((_, i) => img(`${jobId}-step${i}`));
  return delay({ jobId, result: steps[steps.length - 1], steps }, 2600);
}
