import { http, unwrapEnvelope } from './client';
import { normalizeAuthError } from './auth';
import {
  CatalogBrand,
  CatalogCategory,
  CreateListingInput,
  DefaultVariantInput,
  InventoryFlag,
  InventoryPage,
  Listing,
  ListingStatus,
  PatchVariantInput,
  SizeScale,
  UpdateListingInput,
  Variant,
  VariantGroup,
} from '../types/catalog';

export { uploadImage } from './catalog';

/** Run a request, unwrap the { success, data } envelope, normalize errors. */
async function req<T>(fn: () => Promise<{ data: unknown }>): Promise<T> {
  try {
    const res = await fn();
    return unwrapEnvelope<T>(res.data);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

// ---- Metadata (public) --------------------------------------------------
export const getCatalogCategories = (gender?: string) =>
  req<CatalogCategory[]>(() =>
    http.get('/catalog/categories', {
      params: { activeOnly: true, ...(gender ? { gender } : {}) },
    }),
  );

export const getCatalogBrands = () =>
  req<CatalogBrand[]>(() => http.get('/catalog/brands', { params: { activeOnly: true } }));

/** Size scales for a category (universal scales come back even without one). */
export const getCatalogSizeScales = (categoryId?: string | null) =>
  req<SizeScale[]>(() =>
    http.get('/catalog/size-scales', {
      params: categoryId ? { categoryId } : {},
    }),
  );

/** Turn a brand name into a url-safe slug (e.g. "Nike Air" -> "nike-air"). */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Create a brand inline from the product wizard. Create lives on the retailer
 * route `POST /retailer/brands` (the public `/catalog/brands` is GET-only -
 * POSTing there 404s). Always send a slug alongside the name.
 */
export const createBrand = (body: { name: string; slug?: string }) => {
  const name = body.name.trim();
  const payload = { name, slug: body.slug?.trim() || slugify(name) };
  return req<CatalogBrand>(() => http.post('/retailer/brands', payload));
};

// ---- Listings -----------------------------------------------------------
export const getListings = (opts?: { status?: ListingStatus; sort?: string }) =>
  req<Listing[]>(() => http.get('/retailer/listings', { params: opts ?? {} }));

export const getListing = (id: string) =>
  req<Listing>(() => http.get(`/retailer/listings/${id}`));

export const createListing = (body: CreateListingInput) =>
  req<Listing>(() => http.post('/retailer/listings', body));

export const updateListing = (id: string, body: UpdateListingInput) =>
  req<Listing>(() => http.patch(`/retailer/listings/${id}`, body));

export const deleteListing = (id: string) =>
  req<{ id: string; deleted: boolean }>(() => http.delete(`/retailer/listings/${id}`));

export const bulkStatus = (ids: string[], status: 'active' | 'draft' | 'retired') =>
  req<{ updated: number; skipped: number }>(() =>
    http.post('/retailer/listings/bulk-status', { ids, status }),
  );

// ---- Variants -----------------------------------------------------------
export const setDefaultVariant = (listingId: string, body: DefaultVariantInput) =>
  req<Variant>(() => http.put(`/retailer/listings/${listingId}/default-variant`, body));

export const getVariants = (listingId: string) =>
  req<Variant[]>(() => http.get(`/retailer/listings/${listingId}/variants`));

/** The stock + price editor. */
export const patchVariant = (id: string, body: PatchVariantInput) =>
  req<Variant>(() => http.patch(`/retailer/variants/${id}`, body));

export const deleteVariant = (id: string) =>
  req<{ id: string; deleted: boolean }>(() => http.delete(`/retailer/variants/${id}`));

export const publishVariant = (listingId: string, vid: string) =>
  req<Variant>(() =>
    http.post(`/retailer/listings/${listingId}/variants/${vid}/publish`, {}),
  );

export const skuAvailable = (sku: string, excludeVariantId?: string) =>
  req<{ available: boolean }>(() =>
    http.get('/retailer/variants/sku-available', {
      params: { sku, ...(excludeVariantId ? { excludeVariantId } : {}) },
    }),
  );

// custom-mode variant
export const createCustomVariant = (
  listingId: string,
  body: {
    attributes: Record<string, string>;
    attributesLabel: string;
    sku?: string;
    pricePaise: number;
    compareAtPrice?: number | null;
    stock: number;
    imageUrls?: string[];
  },
) => req<Variant>(() => http.post(`/retailer/listings/${listingId}/variants`, body));

// color_size groups + group variants
export const createGroup = (
  listingId: string,
  body: { name: string; colorHex?: string; sortOrder?: number },
) => req<VariantGroup>(() => http.post(`/retailer/listings/${listingId}/groups`, body));

export const createGroupVariant = (
  listingId: string,
  groupId: string,
  body: {
    size: string;
    sku?: string;
    pricePaise: number;
    compareAtPrice?: number | null;
    stock: number;
    imageUrls?: string[];
  },
) =>
  req<Variant>(() =>
    http.post(`/retailer/listings/${listingId}/groups/${groupId}/variants`, body),
  );

// ---- Inventory ----------------------------------------------------------
export const getInventory = (params: {
  q?: string;
  status?: ListingStatus;
  flag?: InventoryFlag;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}) => req<InventoryPage>(() => http.get('/retailer/inventory', { params }));

export const patchInventorySettings = (lowStockThreshold: number) =>
  req<{ lowStockThreshold: number }>(() =>
    http.patch('/retailer/inventory/settings', { lowStockThreshold }),
  );
