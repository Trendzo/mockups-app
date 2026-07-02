/** Enums mirrored from the backend API contract (§4.3). Keep in sync. */

export enum Mode {
  WithoutModel = 'without_model',
  WithModel = 'with_model',
}

export enum SubmissionStatus {
  Submitted = 'submitted',
  Processing = 'processing',
  ReadyForReview = 'ready_for_review',
  Accepted = 'accepted',
  Rejected = 'rejected',
  Regenerating = 'regenerating',
  Failed = 'failed',
}

export enum Gender {
  Her = 'her',
  Him = 'him',
  Unisex = 'unisex',
}

export enum ListingPolicy {
  Return = 'return',
  Replace = 'replace',
  FinalSale = 'final_sale',
}

/** Views available when mode = without_model. */
export const PRODUCT_VIEWS = [
  'front',
  'back',
  'three-quarter',
  'flat-lay',
  'on-hanger',
] as const;
export type ProductView = (typeof PRODUCT_VIEWS)[number];

/** Views available when mode = with_model. */
export const MODEL_VIEWS = [
  'model-front-studio',
  'model-three-quarter',
  'model-back',
  'model-lifestyle',
] as const;
export type ModelView = (typeof MODEL_VIEWS)[number];

export type AnyView = ProductView | ModelView;

export const viewsForMode = (mode: Mode): readonly AnyView[] =>
  mode === Mode.WithModel ? MODEL_VIEWS : PRODUCT_VIEWS;

/** /api/mockups `views` selector. */
export type MockupViews = 'both' | 'product' | 'model';

export const GENDER_LABELS: Record<Gender, string> = {
  [Gender.Her]: 'Her',
  [Gender.Him]: 'Him',
  [Gender.Unisex]: 'Unisex',
};

export const LISTING_POLICY_LABELS: Record<ListingPolicy, string> = {
  [ListingPolicy.Return]: 'Return',
  [ListingPolicy.Replace]: 'Replace',
  [ListingPolicy.FinalSale]: 'Final sale',
};

/** Human label for a raw view name returned by the backend. */
export const prettyView = (name: string): string =>
  name
    .replace(/^model-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
