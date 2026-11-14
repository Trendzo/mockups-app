import type { useProductDraft } from '../store/productDraft';
import { CatalogGender, CreateListingInput, UpdateListingInput } from '../types/catalog';
import { parseRupeesToPaise } from '../utils/money';

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
    ...(d.categoryId ? { categoryId: d.categoryId } : {}),
    ...(d.genders.length ? { gender: derivedGender(d.genders) } : {}),
    draftVariantData: pendingVariantData(d, d.editingStatus !== 'active'),
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

/** Preserve inputs that cannot yet form a priced variant row. */
export function pendingVariantData(d: Draft, includeCompleteUnpersisted = true): Record<string, unknown> | null {
  const basePrice = parseRupeesToPaise(d.basePrice);
  const mrp = parseRupeesToPaise(d.baseMrp);
  const rowPrices = d.colors.flatMap(c => c.sizes.map(r => parseRupeesToPaise(r.price || d.basePrice)));
  const unresolvedMrp = !!d.baseMrp.trim() && (mrp == null ||
    (basePrice != null && mrp <= basePrice) || rowPrices.some(price => price != null && mrp <= price));
  if (d.variantMode === 'single') {
    if (basePrice != null && basePrice > 0 && !unresolvedMrp &&
      (d.single.serverVariantId || !includeCompleteUnpersisted)) return null;
    const { sku, size, stock, imageUrls } = d.single;
    if (!sku.trim() && !size.trim() && !imageUrls.length && !(Number(stock) > 0) && !d.basePrice.trim() && !d.baseMrp.trim()) return null;
    return { basePrice: d.basePrice, baseMrp: d.baseMrp, single: { sku, size, stock, imageUrls } };
  }
  const colors = d.colors.map((c) => ({
    name: c.name, colorHex: c.colorHex,
    sizes: c.sizes.filter((r) => {
      const price = parseRupeesToPaise(r.price || d.basePrice);
      const complete = !!r.size.trim() && price != null && price > 0;
      return !complete || (includeCompleteUnpersisted && !r.serverVariantId);
    })
      .filter((r) => r.size.trim() || r.price.trim() || r.mrp.trim() || r.sku.trim() || r.imageUrls.length || Number(r.stock) > 0)
      .map((r) => ({ size: r.size, sku: r.sku, price: r.price, stock: r.stock,
        imageUrls: r.imageUrls, ...(r.serverVariantId && { serverVariantId: r.serverVariantId }) })),
  })).filter((c, index) => c.sizes.length || (!d.colors[index]?.serverGroupId && c.name.trim()));
  const hasPricedSize = d.colors.some((c) => c.sizes.some((r) =>
    !!r.size.trim() && (parseRupeesToPaise(r.price || d.basePrice) ?? 0) > 0));
  return colors.length || unresolvedMrp || ((d.basePrice.trim() || d.baseMrp.trim()) && !hasPricedSize)
    ? { basePrice: d.basePrice, baseMrp: d.baseMrp, colors } : null;
}

/**
 * Listing-level fields for PATCH /retailer/listings/:id (edit). The long
 * description is stored as HTML but edited here as plain text, so it is sent
 * only when changed this session - an untouched value (rich web formatting
 * included) is never rewritten. Emptied after an edit = explicit clear (null).
 */
export function listingUpdateBody(d: Draft): UpdateListingInput {
  const body: UpdateListingInput = listingCreateBody(d);
  body.brandId = d.brandId;
  body.categoryId = d.categoryId;
  body.gender = d.genders.length ? derivedGender(d.genders) : null;
  delete body.descriptionLong;
  if (d.descriptionLongDirty) body.descriptionLong = d.descriptionLong.trim() || null;
  return body;
}
