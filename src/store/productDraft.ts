import { create } from 'zustand';
import { Listing, ListingPolicy, VariantGroup } from '../types/catalog';
import { paiseToRupeeInput } from '../utils/money';
import { SizeKind } from '../screens/ProductWizard/sizeKinds';

/**
 * In-progress product draft for the unified creation/edit wizard. Session-only
 * (a global singleton, not persisted): once committed, the backend itself holds
 * the draft as a `draft` listing. Every wizard screen reads/writes this store,
 * so jumping between steps - or detouring into the mockup generator and back -
 * keeps every value intact. Nothing is sent to the backend until the Review
 * step calls commitProductDraft().
 */

export type WizardMode = 'create' | 'edit';
/** The wizard only offers the two product types from flow.md. */
export type WizardVariantMode = 'single' | 'color_size';

/** Which variant a per-variant image action targets. */
export type VariantTarget = 'single' | { colorId: string; rowId: string };

export interface SingleVariantDraft {
  sku: string;
  size: string; // optional size label (e.g. "M", "Free Size")
  price: string; // rupee input
  mrp: string; // compare-at, rupee input
  stock: string;
  imageUrls: string[]; // first = variant primary
  serverVariantId?: string; // set after create/edit (idempotent retry)
}

export interface SizeRow {
  id: string; // local id
  size: string;
  sku: string;
  price: string;
  mrp: string;
  stock: string;
  imageUrls: string[];
  serverVariantId?: string;
}

export interface ColorDraft {
  id: string; // local id
  name: string;
  colorHex?: string;
  sizes: SizeRow[];
  serverGroupId?: string; // set after createGroup (idempotent retry)
}

interface ProductDraftState {
  mode: WizardMode;
  editingListingId?: string;
  /** Status of the product being edited (drives the Review buttons). */
  editingStatus?: Listing['status'];
  /** The listing's variant mode when editing began - a switch means the old
   *  mode's variants get replaced (deleted) on commit. */
  editingVariantMode?: WizardVariantMode;
  /** True while the user has detoured into the mockup generator from the wizard. */
  pendingMockup: boolean;

  // Step 1 - Basics
  name: string;
  brandId: string | null;
  categoryId: string | null;
  genders: Array<'her' | 'him'>; // both = unisex
  gallery: string[]; // ordered remote URLs, index 0 = primary
  // Product pricing (captured in Basics). Variants may override the selling
  // price per colour; MRP always comes from here.
  basePrice: string; // rupee input
  baseMrp: string; // compare-at, rupee input

  // Step 2 - Variants
  variantMode: WizardVariantMode;
  // Size system for variants (null = auto-infer from the category). Lets
  // accessories (rings/chains/shoes) use their own size scale, not S/M/L.
  sizeKind: SizeKind | null;
  single: SingleVariantDraft;
  colors: ColorDraft[];
  // Freshly generated (not-yet-adopted) mockups, keyed by colour id. Lives in the
  // draft - not local component state - so the preview survives hopping to Details
  // and back to the Variants step.
  variantMockups: Record<string, string[]>;

  // Step 3 - Details
  description: string;
  descriptionLong: string;
  listingPolicy: ListingPolicy;
  occasion: string[];
  ageGroups: string[];
  hsn: string;

  // Commit progress / edit tracking
  createdListingId?: string;
  removedVariantIds: string[];

  // ---- lifecycle ----
  startCreate: () => void;
  startEdit: (listing: Listing) => void;
  setPendingMockup: (b: boolean) => void;

  // ---- step 1 ----
  setBasics: (
    patch: Partial<
      Pick<ProductDraftState, 'name' | 'brandId' | 'categoryId' | 'basePrice' | 'baseMrp'>
    >,
  ) => void;
  toggleGender: (g: 'her' | 'him') => void;
  addGalleryUrls: (urls: string[]) => void;
  removeGallery: (i: number) => void;
  removeGalleryUrl: (url: string) => void;
  /** Replace the whole gallery order (first = primary). Used by drag-to-reorder. */
  setGallery: (urls: string[]) => void;

  // ---- step 2 ----
  setVariantMode: (m: WizardVariantMode) => void;
  setSizeKind: (k: SizeKind | null) => void;
  setSingle: (patch: Partial<SingleVariantDraft>) => void;
  addColor: () => void;
  removeColor: (colorId: string) => void;
  updateColor: (colorId: string, patch: Partial<Pick<ColorDraft, 'name' | 'colorHex'>>) => void;
  addSizeRow: (colorId: string) => void;
  removeSizeRow: (colorId: string, rowId: string) => void;
  updateSizeRow: (colorId: string, rowId: string, patch: Partial<SizeRow>) => void;
  /** Reconcile a color's sizes to exactly `labels` (keep existing, add new at base). */
  setColorSizes: (
    colorId: string,
    labels: string[],
    base: { price: string; mrp: string },
  ) => void;
  /** Apply one price + MRP to every size of a color. */
  setColorPricing: (colorId: string, price: { price: string; mrp: string }) => void;
  generateMatrix: (input: {
    colors: Array<{ name: string; colorHex?: string }>;
    sizes: string[];
    base?: { price?: string; mrp?: string; stock?: string };
  }) => void;
  // per-variant images
  addVariantImages: (target: VariantTarget, urls: string[]) => void;
  removeVariantImage: (target: VariantTarget, i: number) => void;
  /** Store (or clear, with []) the generated-but-unadopted mockups for a colour. */
  setVariantMockups: (key: string, urls: string[]) => void;

  // ---- step 3 ----
  setDetails: (
    patch: Partial<
      Pick<
        ProductDraftState,
        'description' | 'descriptionLong' | 'listingPolicy' | 'occasion' | 'ageGroups' | 'hsn'
      >
    >,
  ) => void;

  // ---- commit markers (used only by productCommit.ts) ----
  setCreatedListingId: (id: string) => void;
  setColorGroupId: (colorId: string, groupId: string) => void;
  setSizeVariantId: (colorId: string, rowId: string, variantId: string) => void;
  setSingleVariantId: (variantId: string) => void;
}

let idCounter = 0;
const lid = () => `l${(idCounter += 1)}_${Math.random().toString(36).slice(2, 8)}`;

const emptySingle = (): SingleVariantDraft => ({
  sku: '',
  size: '',
  price: '',
  mrp: '',
  stock: '0',
  imageUrls: [],
});

const emptySizeRow = (base?: { price?: string; mrp?: string; stock?: string }): SizeRow => ({
  id: lid(),
  size: '',
  sku: '',
  price: base?.price ?? '',
  mrp: base?.mrp ?? '',
  stock: base?.stock ?? '0',
  imageUrls: [],
});

const emptyColor = (): ColorDraft => ({ id: lid(), name: '', sizes: [emptySizeRow()] });

const emptyState = () => ({
  mode: 'create' as WizardMode,
  editingListingId: undefined,
  editingStatus: undefined,
  editingVariantMode: undefined as WizardVariantMode | undefined,
  pendingMockup: false,
  name: '',
  brandId: null,
  categoryId: null,
  genders: [] as Array<'her' | 'him'>,
  gallery: [] as string[],
  basePrice: '',
  baseMrp: '',
  variantMode: 'single' as WizardVariantMode,
  sizeKind: null as SizeKind | null,
  single: emptySingle(),
  colors: [emptyColor()],
  variantMockups: {} as Record<string, string[]>,
  description: '',
  descriptionLong: '',
  listingPolicy: 'return' as ListingPolicy,
  occasion: [] as string[],
  ageGroups: [] as string[],
  hsn: '',
  createdListingId: undefined,
  removedVariantIds: [] as string[],
});

/** Map an existing listing (with nested variants + groups) into a fresh draft. */
function seedFromListing(listing: Listing): Partial<ProductDraftState> {
  const groups = listing.variantGroups ?? [];
  const variants = listing.variants ?? [];
  const genders: Array<'her' | 'him'> =
    listing.gender === 'unisex' ? ['her', 'him'] : [listing.gender as 'her' | 'him'];

  // Legacy 'custom' products fall back to single-variant editing.
  const variantMode: WizardVariantMode =
    listing.variantMode === 'color_size' ? 'color_size' : 'single';

  let single = emptySingle();
  let colors: ColorDraft[] = [emptyColor()];

  if (variantMode === 'single') {
    const defaultGroupId = groups.find((g) => g.isDefault)?.id;
    const v = variants.find((x) => x.groupId === defaultGroupId) ?? variants[0];
    if (v) {
      single = {
        sku: v.sku ?? '',
        size: v.attributes?.size ?? v.attributesLabel ?? '',
        price: paiseToRupeeInput(v.pricePaise),
        mrp: paiseToRupeeInput(v.compareAtPrice ?? null),
        stock: String(v.stock ?? 0),
        imageUrls: v.imageUrls ?? [],
        serverVariantId: v.id,
      };
    }
  } else {
    const sorted = [...groups].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    colors = sorted.map((g: VariantGroup) => ({
      id: lid(),
      name: g.name === 'Default' ? '' : g.name,
      colorHex: g.colorHex ?? undefined,
      serverGroupId: g.id,
      sizes: variants
        .filter((v) => v.groupId === g.id)
        .map((v) => ({
          id: lid(),
          size: v.attributes?.size ?? v.attributesLabel ?? '',
          sku: v.sku ?? '',
          price: paiseToRupeeInput(v.pricePaise),
          mrp: paiseToRupeeInput(v.compareAtPrice ?? null),
          stock: String(v.stock ?? 0),
          imageUrls: v.imageUrls ?? [],
          serverVariantId: v.id,
        })),
    }));
    // A group with no sizes still needs one editable row.
    colors = colors.map((c) => (c.sizes.length ? c : { ...c, sizes: [emptySizeRow()] }));
    if (!colors.length) colors = [emptyColor()];
  }

  // Product-level pricing seeds from the first variant (MRP always lives there).
  const v0 = variants[0];

  return {
    mode: 'edit',
    editingListingId: listing.id,
    editingStatus: listing.status,
    editingVariantMode: variantMode,
    pendingMockup: false,
    name: listing.name,
    brandId: listing.brandId ?? null,
    categoryId: listing.categoryId,
    genders,
    gallery: listing.galleryUrls ?? [],
    basePrice: v0 ? paiseToRupeeInput(v0.pricePaise) : '',
    baseMrp: v0 ? paiseToRupeeInput(v0.compareAtPrice ?? null) : '',
    variantMode,
    single,
    colors,
    description: listing.description ?? '',
    descriptionLong: listing.descriptionLong ?? '',
    listingPolicy: listing.listingPolicy,
    occasion: listing.occasion ?? [],
    ageGroups: listing.ageGroups ?? [],
    hsn: listing.hsn ?? '',
    createdListingId: undefined,
    removedVariantIds: [],
    variantMockups: {},
  };
}

export const useProductDraft = create<ProductDraftState>((set) => ({
  ...emptyState(),

  startCreate: () => set(emptyState()),
  startEdit: (listing) => set(seedFromListing(listing)),
  setPendingMockup: (b) => set({ pendingMockup: b }),

  setBasics: (patch) => set(patch),
  toggleGender: (g) =>
    set((s) => ({
      genders: s.genders.includes(g) ? s.genders.filter((x) => x !== g) : [...s.genders, g],
    })),

  addGalleryUrls: (urls) => set((s) => ({ gallery: [...s.gallery, ...urls] })),
  removeGallery: (i) => set((s) => ({ gallery: s.gallery.filter((_, idx) => idx !== i) })),
  removeGalleryUrl: (url) => set((s) => ({ gallery: s.gallery.filter((u) => u !== url) })),
  setGallery: (urls) => set({ gallery: urls }),

  setVariantMode: (m) => set({ variantMode: m }),
  setSizeKind: (k) => set({ sizeKind: k }),
  setSingle: (patch) => set((s) => ({ single: { ...s.single, ...patch } })),
  addColor: () => set((s) => ({ colors: [...s.colors, emptyColor()] })),
  removeColor: (colorId) =>
    set((s) => {
      const removed = s.colors.find((c) => c.id === colorId);
      const removedIds = (removed?.sizes ?? [])
        .map((r) => r.serverVariantId)
        .filter((x): x is string => !!x);
      const colors = s.colors.filter((c) => c.id !== colorId);
      return {
        colors: colors.length ? colors : [emptyColor()],
        removedVariantIds: [...s.removedVariantIds, ...removedIds],
      };
    }),
  updateColor: (colorId, patch) =>
    set((s) => ({
      colors: s.colors.map((c) => (c.id === colorId ? { ...c, ...patch } : c)),
    })),
  addSizeRow: (colorId) =>
    set((s) => ({
      colors: s.colors.map((c) =>
        c.id === colorId ? { ...c, sizes: [...c.sizes, emptySizeRow()] } : c,
      ),
    })),
  removeSizeRow: (colorId, rowId) =>
    set((s) => {
      let removedId: string | undefined;
      const colors = s.colors.map((c) => {
        if (c.id !== colorId) return c;
        removedId = c.sizes.find((r) => r.id === rowId)?.serverVariantId;
        const sizes = c.sizes.filter((r) => r.id !== rowId);
        return { ...c, sizes: sizes.length ? sizes : [emptySizeRow()] };
      });
      return {
        colors,
        removedVariantIds: removedId
          ? [...s.removedVariantIds, removedId]
          : s.removedVariantIds,
      };
    }),
  updateSizeRow: (colorId, rowId, patch) =>
    set((s) => ({
      colors: s.colors.map((c) =>
        c.id === colorId
          ? { ...c, sizes: c.sizes.map((r) => (r.id === rowId ? { ...r, ...patch } : r)) }
          : c,
      ),
    })),
  setColorSizes: (colorId, labels, base) =>
    set((s) => {
      const removedIds: string[] = [];
      const colors = s.colors.map((c) => {
        if (c.id !== colorId) return c;
        const byLabel = new Map(c.sizes.map((r) => [r.size.trim().toUpperCase(), r]));
        const keep = new Set(labels.map((l) => l.trim().toUpperCase()));
        // Track server variants for sizes being dropped so they get deleted on commit.
        c.sizes.forEach((r) => {
          if (r.serverVariantId && !keep.has(r.size.trim().toUpperCase())) {
            removedIds.push(r.serverVariantId);
          }
        });
        const wanted = labels.length ? labels : [''];
        const sizes = wanted.map((label) => {
          const found = byLabel.get(label.trim().toUpperCase());
          return found ? { ...found, size: label } : { ...emptySizeRow(base), size: label };
        });
        return { ...c, sizes };
      });
      return { colors, removedVariantIds: [...s.removedVariantIds, ...removedIds] };
    }),
  setColorPricing: (colorId, price) =>
    set((s) => ({
      colors: s.colors.map((c) =>
        c.id === colorId
          ? { ...c, sizes: c.sizes.map((r) => ({ ...r, price: price.price, mrp: price.mrp })) }
          : c,
      ),
    })),
  generateMatrix: ({ colors, sizes, base }) =>
    set(() => ({
      colors: (colors.length ? colors : [{ name: '' }]).map((c) => ({
        id: lid(),
        name: c.name,
        colorHex: c.colorHex,
        sizes: (sizes.length ? sizes : ['']).map((size) => ({
          ...emptySizeRow(base),
          size,
        })),
      })),
    })),
  addVariantImages: (target, urls) =>
    set((s) => {
      if (target === 'single') {
        return { single: { ...s.single, imageUrls: [...s.single.imageUrls, ...urls] } };
      }
      return {
        colors: s.colors.map((c) =>
          c.id === target.colorId
            ? {
                ...c,
                sizes: c.sizes.map((r) =>
                  r.id === target.rowId ? { ...r, imageUrls: [...r.imageUrls, ...urls] } : r,
                ),
              }
            : c,
        ),
      };
    }),
  removeVariantImage: (target, i) =>
    set((s) => {
      if (target === 'single') {
        return {
          single: { ...s.single, imageUrls: s.single.imageUrls.filter((_, idx) => idx !== i) },
        };
      }
      return {
        colors: s.colors.map((c) =>
          c.id === target.colorId
            ? {
                ...c,
                sizes: c.sizes.map((r) =>
                  r.id === target.rowId
                    ? { ...r, imageUrls: r.imageUrls.filter((_, idx) => idx !== i) }
                    : r,
                ),
              }
            : c,
        ),
      };
    }),

  setVariantMockups: (key, urls) =>
    set((s) => {
      const next = { ...s.variantMockups };
      if (urls.length) next[key] = urls;
      else delete next[key];
      return { variantMockups: next };
    }),

  setDetails: (patch) => set(patch),

  setCreatedListingId: (id) => set({ createdListingId: id }),
  setColorGroupId: (colorId, groupId) =>
    set((s) => ({
      colors: s.colors.map((c) => (c.id === colorId ? { ...c, serverGroupId: groupId } : c)),
    })),
  setSizeVariantId: (colorId, rowId, variantId) =>
    set((s) => ({
      colors: s.colors.map((c) =>
        c.id === colorId
          ? {
              ...c,
              sizes: c.sizes.map((r) =>
                r.id === rowId ? { ...r, serverVariantId: variantId } : r,
              ),
            }
          : c,
      ),
    })),
  setSingleVariantId: (variantId) =>
    set((s) => ({ single: { ...s.single, serverVariantId: variantId } })),
}));
