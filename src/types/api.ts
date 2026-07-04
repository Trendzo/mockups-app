import {
  Gender,
  ListingPolicy,
  Mode,
  MockupViews,
  ModelGender,
  SubmissionStatus,
} from './enums';
import { UploadFile } from '../utils/image';

/** Normalized error shape surfaced to the UI. */
export interface ApiError {
  error: string;
  status?: number;
}

// ---- Catalog: submissions ----

export interface CreateSubmissionInput {
  mode: Mode;
  apparel: UploadFile;
  apparelBack?: UploadFile; // optional real back-of-garment reference
  design?: UploadFile;
  // Optional close-up references (server-side only; not returned as outputs).
  pattern?: UploadFile; // fabric texture / pattern close-up
  logo?: UploadFile; // logo / monogram close-up
  tag?: UploadFile; // brand tag / label photo
  modelGender?: ModelGender; // only applies when mode === with_model
  prompt?: string;
  only?: string[]; // limit generated views
}

export interface Submission {
  id: string; // aics_...
  mode: Mode;
  status: SubmissionStatus;
  rawPhotos: string[]; // absolute urls
  outputUrls: string[]; // absolute urls
}

export interface DecisionInput {
  decision: 'accept' | 'reject';
  revisionNotes?: string;
}

export interface DecisionResult {
  id: string;
  status: SubmissionStatus;
}

// ---- Catalog: categories / brands ----

export interface Category {
  id: string; // cat_...
  slug: string;
  label: string;
  gender: Gender;
}

export interface Brand {
  id: string; // brd_...
  slug: string;
  name: string;
}

// ---- Catalog: publish ----

export interface PublishInput {
  name: string;
  categoryId: string;
  gender: Gender;
  pricePaise: number;
  description?: string;
  brandId?: string;
  listingPolicy?: ListingPolicy;
  stock?: number;
  compareAtPrice?: number;
  occasion?: string[];
  ageGroups?: string[];
  galleryUrls?: string[];
}

export interface Listing {
  id: string; // lst_...
  storeId: string;
  brandId: string | null;
  categoryId: string;
  name: string;
  description: string | null;
  gender: Gender;
  listingPolicy: ListingPolicy;
  galleryUrls: string[];
  occasion: string[];
  ageGroups: string[];
  status: string; // 'draft'
  variantMode: string;
  ratingAvg: string;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Variant {
  id: string; // var_...
  listingId: string;
  storeId: string;
  groupId: string; // vgrp_...
  sku: string | null;
  attributes: Record<string, unknown>;
  attributesLabel: string;
  imageUrls: string[];
  isActive: boolean;
  stock: number;
  reserved: number;
  pricePaise: number;
  compareAtPrice: number | null;
}

export interface PublishResult {
  listing: Listing;
  variant: Variant;
}

// ---- Mockups (stateless) ----

export interface CreateMockupsInput {
  apparel: UploadFile;
  design?: UploadFile;
  pattern?: UploadFile;
  logo?: UploadFile;
  tag?: UploadFile;
  modelGender?: ModelGender; // only applies to the with_model call
  views?: MockupViews;
  only?: string[];
}

export interface NamedImage {
  name: string;
  url: string;
}

export interface MockupsResult {
  jobId: string;
  printed: string | null;
  product: NamedImage[];
  model: NamedImage[];
}
