import type { useProductDraft } from '../store/productDraft';
import { CatalogGender, CreateListingInput, UpdateListingInput } from '../types/catalog';

type Draft = ReturnType<typeof useProductDraft.getState>;

function derivedGender(genders: Array<'her' | 'him'>): CatalogGender {
  if (genders.length >= 2) return 'unisex';
  return (genders[0] as CatalogGender) ?? 'unisex';
}

/** Listing-level fields for POST /retailer/listings (create). */
export function listingCreateBody(d: Draft): CreateListingInput {
  return {
    name: d.name.trim(),
    // Optional on a draft; omit when unset so the backend stores brand_id NULL.
    ...(d.brandId ? { brandId: d.brandId } : {}),
    categoryId: d.categoryId!,
    gender: derivedGender(d.genders),
    description: d.description.trim() || undefined,
    // Plain text; the backend normalizes it to HTML on write.
    descriptionLong: d.descriptionLong.trim() || undefined,
    listingPolicy: d.listingPolicy,
    occasion: d.occasion,
    ageGroups: d.ageGroups,
    hsn: d.hsn.trim() || undefined,
    galleryUrls: d.gallery,
    variantMode: d.variantMode,
  };
}

/**
 * Listing-level fields for PATCH /retailer/listings/:id (edit). The long
 * description is stored as HTML but edited here as plain text, so it is sent
 * only when changed this session - an untouched value (rich web formatting
 * included) is never rewritten. Emptied after an edit = explicit clear (null).
 */
export function listingUpdateBody(d: Draft): UpdateListingInput {
  const body: UpdateListingInput = listingCreateBody(d);
  delete body.descriptionLong;
  if (d.descriptionLongDirty) body.descriptionLong = d.descriptionLong.trim() || null;
  return body;
}
