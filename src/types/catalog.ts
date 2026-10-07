// Catalog management contract (docs/catalog-management-API.md). Money is integer
// paise everywhere; available = stock - reserved.

export type ListingStatus = 'draft' | 'active' | 'retired' | 'taken_down';
export type VariantMode = 'single' | 'color_size' | 'custom';
export type ListingPolicy = 'return' | 'replace' | 'final_sale';
export type CatalogGender = 'her' | 'him' | 'unisex';
/** Server-side inventory filters; omit for "all". */
export type InventoryFlag = 'low' | 'out' | 'oversold';
export type AttributeAxisType = 'enum' | 'free_text' | 'numeric' | 'color';

export const AGE_GROUP_VALUES = ['0-2', '3-7', '8-12', '13-17', '18-24', '25-40', '40+'];

// Retailer sub-roles that may write to the catalog. staff = read-only.
// @deprecated for new code: use `usePermissions().can('listings.edit')` (Inventory still calls
// canWriteCatalog until it is converted).
export type SubRole = 'owner' | 'manager' | 'staff' | 'delivery_agent';
export function canWriteCatalog(subRole?: string | null): boolean {
  // No sub-role on the session (e.g. the login response doesn't send one) =
  // the primary account — don't lock the owner out of their own catalog.
  if (!subRole) return true;
  return subRole === 'owner' || subRole === 'manager';
}

export interface CatalogBrand {
  id: string;
  slug: string;
  name: string;
  tintColor?: string | null;
  logoUrl?: string | null;
  domain?: string | null;
  isActive?: boolean;
}

export interface CatalogCategory {
  id: string;
  slug: string;
  label: string;
  /** Two-level taxonomy: null = a top-level category, otherwise its parent's id. */
  parentId?: string | null;
  gender?: CatalogGender;
  sortOrder?: number;
  isActive?: boolean;
  /** Computed server-side. Listings must sit on a leaf, never on a parent. */
  isLeaf?: boolean;
}

/** Category-aware size pick-list served by GET /catalog/size-scales (same
 *  source the web portal wizard uses). Empty categorySlugs = universal. */
export interface SizeScale {
  id: string;
  name: string;
  values: string[];
  categorySlugs: string[];
  sortOrder?: number;
  isActive?: boolean;
}

export interface Variant {
  id: string;
  listingId: string;
  storeId: string;
  groupId: string;
  sku?: string | null;
  barcode?: string | null;
  attributes: Record<string, string>;
  attributesLabel: string;
  imageUrls: string[];
  isActive: boolean;
  stock: number;
  reserved: number;
  pricePaise: number;
  compareAtPrice?: number | null;
  attributesOutOfTemplate?: boolean;
}

export interface VariantGroup {
  id: string;
  listingId: string;
  storeId: string;
  name: string;
  colorHex?: string | null;
  sortOrder: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface Listing {
  id: string;
  storeId: string;
  templateId?: string | null;
  brandId?: string | null;
  categoryId: string;
  name: string;
  description?: string | null;
  descriptionLong?: string | null;
  hsn?: string | null;
  gender: CatalogGender;
  listingPolicy: ListingPolicy;
  galleryUrls: string[];
  occasion: string[];
  ageGroups: string[];
  status: ListingStatus;
  variantMode: VariantMode;
  statusBeforeTakedown?: ListingStatus | null;
  ratingAvg?: string;
  ratingCount?: number;
  createdAt?: string;
  updatedAt?: string;
  takedownReason?: string | null;
  // present on list/get
  variants?: Variant[];
  variantGroups?: VariantGroup[];
  brand?: CatalogBrand | null;
  category?: CatalogCategory | null;
}

export interface CreateListingInput {
  name: string;
  /** Optional — a draft can be saved before a brand is chosen. */
  brandId?: string;
  categoryId: string;
  gender: CatalogGender;
  description?: string;
  descriptionLong?: string;
  listingPolicy?: ListingPolicy;
  galleryUrls?: string[];
  occasion?: string[];
  ageGroups?: string[];
  hsn?: string;
  templateId?: string;
  variantMode?: VariantMode;
}

export type UpdateListingInput = Omit<Partial<CreateListingInput>, 'descriptionLong'> & {
  /** null clears it; omit to leave the stored (HTML) value untouched. */
  descriptionLong?: string | null;
  status?: 'draft' | 'active' | 'retired';
};

export interface DefaultVariantInput {
  sku?: string;
  pricePaise: number;
  compareAtPrice?: number | null;
  stock: number;
  imageUrls?: string[];
}

export interface PatchVariantInput {
  pricePaise?: number;
  compareAtPrice?: number | null;
  stock?: number;
  sku?: string | null;
  isActive?: boolean;
  imageUrls?: string[];
  /** System path (single/color_size listings): identity is re-derived from
   *  (group, size) — sending raw attributes on these products 422s. */
  size?: string;
  groupId?: string;
  /** Raw identity - honoured only on legacy custom-mode listings. */
  attributes?: Record<string, string>;
  attributesLabel?: string;
}

/** GET /retailer/inventory row — one per VARIANT (`id` is the variant id). */
export interface InventoryRow {
  id: string;
  listingId: string;
  listingName: string;
  listingStatus: ListingStatus;
  brandName?: string | null;
  attributesLabel: string;
  sku?: string | null;
  pricePaise: number;
  /** MRP in paise. */
  compareAtPrice?: number | null;
  /** On hand. */
  stock: number;
  /** Held for open orders / carts. available = max(0, stock − reserved). */
  reserved: number;
  /** Variant on sale; inactive variants are hidden from customers. */
  isActive: boolean;
}

export interface InventoryPage {
  rows: InventoryRow[];
  total: number;
  /** The store's saved threshold; the portal falls back to 5 when absent. */
  lowStockThreshold?: number;
}

/** GET /retailer/inventory/:variantId/reservations — who is holding stock. */
export interface InventoryReservation {
  id: string;
  /** e.g. order / cart / pos hold (raw server value). */
  ownerKind: string;
  ownerId: string;
  qty: number;
}

/** GET /retailer/inventory/adjustments — store-wide stock ledger. */
export interface StockAdjustment {
  id: string;
  variantId: string;
  /** +received / −sold. */
  delta: number;
  /** Stock after the change. */
  newStock: number;
  /** snake_case server reason (order, pos_sale, manual, import…). */
  reason: string;
  note: string | null;
  actorKind: 'system' | 'admin' | 'retailer' | string;
  at: string;
}

/** GET /retailer/inventory/reports/inventory-health/best-sellers */
export interface BestSeller {
  variantId: string;
  listingName: string;
  attributesLabel: string;
  unitsSold: number;
  stock: number;
}

// ---- Stock adjust (floor staff) -------------------------------------------
// POST /retailer/inventory/:variantId/adjust, gated by `inventory.adjust` (so a
// login without `listings.edit` can still correct counts). Reasons are values of
// the server's inventory_adjustment_reason enum.
export type StockAdjustReason = 'manual_edit' | 'damage_writeoff' | 'audit_correction';

export interface AdjustStockInput {
  /** Absolute on-hand count after the change. */
  newStock: number;
  reason: StockAdjustReason;
}

// ---- CSV import (POST /retailer/inventory/import) -------------------------
/** One import row, exactly as the server's ImportRowSchema takes it. */
export interface InventoryImportRow {
  sku?: string;
  productName?: string;
  variantLabel?: string;
  /** Pipe-encoded `Key=Value|Key=Value`. */
  attributes?: string;
  brand?: string;
  category?: string;
  gender?: 'her' | 'him' | 'unisex';
  pricePaise?: number;
  stock: number;
}

export interface InventoryImportSummary {
  parsed: number;
  stockUpdates: number;
  variantCreates: number;
  listingCreates: number;
  noChange: number;
  errors: number;
}

export type InventoryImportAction =
  | 'stock_update'
  | 'variant_create'
  | 'listing_create'
  | 'no_change'
  | 'error';

export interface InventoryImportPlanEntry {
  /** 1-based index into the `rows` array that was sent. */
  row: number;
  identifier: string;
  action: InventoryImportAction;
  stockUpdate?: {
    variantId: string;
    sku: string | null;
    currentStock: number;
    newStock: number;
    delta: number;
    currentPricePaise?: number;
    newPricePaise?: number;
  };
  variantCreate?: {
    listingId: string;
    listingName: string;
    attributesLabel: string;
    sku?: string;
    pricePaise: number;
    stock: number;
  };
  listingCreate?: {
    listingName: string;
    brandSlug?: string;
    categorySlug?: string;
    categoryLabel?: string;
    gender: string;
    variant: { attributesLabel: string; sku?: string; pricePaise: number; stock: number };
  };
  error?: { reason: string; detail?: string };
}

export interface InventoryImportError {
  /** 1-based index into the `rows` array that was sent. */
  row: number;
  sku?: string;
  reason: string;
  detail?: string;
}

/** `dryRun: true` response: nothing was written. */
export interface InventoryImportDryRun {
  dryRun: true;
  applied: 0;
  summary: InventoryImportSummary;
  plan: InventoryImportPlanEntry[];
  errors: InventoryImportError[];
}

/** `dryRun: false` success response. A row error is a 422 and applies nothing. */
export interface InventoryImportApplied {
  dryRun: false;
  applied: {
    stockUpdates: number;
    variantCreates: number;
    listingCreates: number;
    priceUpdates: number;
  };
  appliedTotal: number;
  createdListings: { row: number; listingId: string; name: string }[];
  createdVariants: { row: number; variantId: string; listingId: string; sku: string | null }[];
  updatedVariants: { row: number; variantId: string; delta: number; priceChanged: boolean }[];
}

// ---- Dead stock (GET /retailer/reports/listings/dead-stock) ---------------
export interface DeadStockRow {
  variantId: string;
  listingId: string;
  listingName: string;
  /** The variant's attributes label ("M / Black"). */
  label: string;
  sku: string | null;
  totalStock: number;
  /** Last order placed for this variant; null = never sold. */
  lastSoldAt: string | null;
}
