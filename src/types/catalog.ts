// Catalog management contract (docs/catalog-management-API.md). Money is integer
// paise everywhere; available = stock - reserved.

export type ListingStatus = 'draft' | 'active' | 'retired' | 'taken_down';
export type VariantMode = 'single' | 'color_size' | 'custom';
export type ListingPolicy = 'return' | 'replace' | 'final_sale';
export type CatalogGender = 'her' | 'him' | 'unisex';
export type InventoryFlag = 'low' | 'out' | 'oversold' | 'in_stock' | 'all';
export type AttributeAxisType = 'enum' | 'free_text' | 'numeric' | 'color';

export const AGE_GROUP_VALUES = ['0-2', '3-7', '8-12', '13-17', '18-24', '25-40', '40+'];

// Retailer sub-roles that may write to the catalog. staff = read-only.
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
  parentId?: string | null;
  gender?: CatalogGender;
  sortOrder?: number;
  isActive?: boolean;
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
  brandId: string;
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

export type UpdateListingInput = Partial<CreateListingInput> & {
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
  attributes?: Record<string, string>;
  attributesLabel?: string;
}

export interface InventoryRow {
  variantId: string;
  listingId: string;
  listingName: string;
  attributesLabel: string;
  sku?: string | null;
  stock: number;
  reserved: number;
  pricePaise: number;
  compareAtPrice?: number | null;
  status?: ListingStatus;
  brand?: string | null;
  category?: string | null;
  imageUrl?: string | null;
}

export interface InventoryPage {
  rows: InventoryRow[];
  total: number;
  page: number;
  pageSize: number;
  lowStockThreshold: number;
}
