import {
  createGroup,
  createGroupVariant,
  createListing,
  deleteVariant,
  getListing,
  patchVariant,
  setDefaultVariant,
  updateListing,
} from './catalogManagement';
import { useProductDraft } from '../store/productDraft';
import { Listing } from '../types/catalog';
import { listingCreateBody, listingUpdateBody } from './listingPayload';
import { parseRupeesToPaise } from '../utils/money';

/**
 * Turns the in-progress productDraft into real backend rows. One orchestrator
 * for BOTH create and edit, so the wizard is the single product-entry surface.
 *
 * Idempotent: every create checks its progress marker (createdListingId /
 * serverGroupId / serverVariantId) first, so a mid-commit failure can be retried
 * from the Review step without duplicating the listing, any group, or any
 * already-created variant.
 */

/**
 * A variant's selling price in paise, or null when none is set. A variant always has a
 * real price (the backend and DB both require > 0); a draft with no price yet is saved
 * as a listing WITHOUT a variant, and the variant is created once it is priced. Never
 * send 0 as a stand-in for "not set".
 */
const sellingPrice = (...candidates: string[]): number | null => {
  for (const c of candidates) {
    if (c.trim()) {
      const p = parseRupeesToPaise(c);
      return p != null && p > 0 ? p : null;
    }
  }
  return null;
};
const comparePrice = (s: string): number | null => {
  const t = s.trim();
  return t ? parseRupeesToPaise(t) : null;
};

/**
 * Save/publish is one user action but many calls, so a failure surfaces as a
 * lone toast with no clue which leg died. Tag each leg: the client interceptor
 * already logs the server's response body, this says what we were doing.
 */
async function step<T>(label: string, run: () => Promise<T>): Promise<T> {
  try {
    const result = await run();
    console.log(`[commit] ${label} - ok`);
    return result;
  } catch (e: any) {
    console.log(`[commit] ${label} - FAILED:`, e?.message ?? e);
    throw e;
  }
}

/**
 * Steps are freely navigable, so nothing is enforced until commit. Returns a
 * list of missing/invalid things (empty = ready to save/publish).
 *
 * A DRAFT saves partial progress: it needs only the two things the backend
 * cannot persist without — a product name and a category (category_id is
 * NOT NULL in the DB). Everything else (brand, gender, a valid price, complete
 * variants) is enforced only when `publish` is true. Publishing is additionally
 * re-checked server-side (assertListingPublishable), so a loose draft can never
 * go live incomplete.
 */
type SizeRow = ReturnType<typeof useProductDraft.getState>['colors'][number]['sizes'][number];

/** The untouched starter row of a colour: nothing typed, nothing on the server — not a variant. */
const isBlankRow = (r: SizeRow): boolean =>
  !r.serverVariantId &&
  !r.size.trim() &&
  !r.price.trim() &&
  !r.sku.trim() &&
  !(Number(r.stock) > 0) &&
  r.imageUrls.length === 0;

/**
 * What a DRAFT cannot store. The listing itself needs only a name and category, but a
 * variant (stock, SKU, size, images, MRP) can only exist with a real selling price, so
 * variant details typed without one would be lost on save. Say so up front instead of
 * letting the save fail or silently dropping them.
 */
function draftVariantProblems(d: ReturnType<typeof useProductDraft.getState>): string[] {
  const problems: string[] = [];
  const priceMsg = 'A selling price in Basics (variant details need a price to be saved)';
  const mrpOk = (price: number | null) => {
    if (!d.baseMrp.trim()) return true;
    const mrp = parseRupeesToPaise(d.baseMrp);
    return price == null || (mrp != null && mrp > price);
  };

  if (d.variantMode === 'single') {
    const price = sellingPrice(d.basePrice);
    const hasVariantData =
      !!d.single.serverVariantId ||
      !!d.baseMrp.trim() ||
      (Number(d.single.stock) || 0) > 0 ||
      !!d.single.size.trim() ||
      !!d.single.sku.trim() ||
      d.single.imageUrls.length > 0;
    if (price == null && hasVariantData) problems.push(priceMsg);
    if (price != null && !mrpOk(price)) problems.push('An MRP higher than the selling price');
    return problems;
  }

  d.colors.forEach((c) => {
    c.sizes.forEach((r) => {
      if (isBlankRow(r)) return;
      const who = `${c.name.trim() || 'a color'} / ${r.size.trim() || 'size'}`;
      if (!r.size.trim()) problems.push(`Size name for ${c.name.trim() || 'a color'}`);
      const price = sellingPrice(r.price, d.basePrice);
      if (price == null) problems.push(`A selling price for ${who} (set it in Basics or on the row)`);
      else if (!mrpOk(price)) problems.push(`An MRP higher than the selling price for ${who}`);
    });
  });
  return problems;
}

export function validateProductDraft(publish = true): string[] {
  const d = useProductDraft.getState();
  const problems: string[] = [];
  if (d.name.trim().length < 1) problems.push('Product name');
  if (!d.categoryId) problems.push('Category');

  // Lenient only when the saved listing will actually be a draft: a brand-new
  // product, or editing one that is still a draft. Editing a LIVE product (or
  // publishing) keeps full validation so a live listing can't be broken.
  const savingDraft = !publish && (d.mode === 'create' || d.editingStatus === 'draft');
  if (savingDraft) {
    problems.push(...draftVariantProblems(d));
    return Array.from(new Set(problems));
  }

  if (!d.brandId) problems.push('Brand');
  if (d.genders.length === 0) problems.push('Gender');

  const badMoney = (price: string, mrp: string): boolean => {
    const p = parseRupeesToPaise(price);
    if (p == null || p <= 0) return true;
    if (mrp.trim()) {
      const m = parseRupeesToPaise(mrp);
      if (m == null || m <= p) return true;
    }
    return false;
  };

  // Product pricing lives in Basics; per-colour selling prices only override it.
  if (badMoney(d.basePrice, d.baseMrp))
    problems.push('A valid selling price in Basics (MRP must be higher)');

  if (d.variantMode !== 'single') {
    let anySize = false;
    d.colors.forEach((c) => {
      c.sizes.forEach((r) => {
        if (isBlankRow(r)) return;
        anySize = true;
        const who = `${c.name || 'a color'} / ${r.size || 'size'}`;
        if (!r.size.trim()) problems.push(`Size name for ${c.name || 'a color'}`);
        // Only validate an override when one was typed.
        if (r.price.trim() && badMoney(r.price, d.baseMrp)) problems.push(`A valid price for ${who}`);
      });
    });
    if (!anySize) problems.push('At least one variant');
  }
  return Array.from(new Set(problems));
}

/** A wizard step a publish blocker can send the retailer to. */
export type PublishBlockerStep =
  | 'ProductWizardBasics'
  | 'ProductWizardVariants'
  | 'ProductWizardDetails';

export type PublishBlocker = {
  /** Stable key for React lists. */
  id: string;
  /** What's missing, phrased for the retailer. */
  label: string;
  /** Where to go to fix it. */
  step: PublishBlockerStep;
};

/**
 * Everything the BACKEND demands before a listing may go live, mirrored here so
 * the wizard can say what's missing instead of letting the retailer press Publish
 * and eat a 409 from assertListingPublishable.
 *
 * Keep in sync with assertListingPublishable + isVariantComplete in
 * backend/src/modules/retailer/listings/listings.controller.ts. This is a
 * SUPERSET of validateProductDraft: that one guards saving, this one guards
 * going live, and a listing that fails only these still saves fine as a draft.
 */
export function publishBlockers(): PublishBlocker[] {
  const d = useProductDraft.getState();
  const blockers: PublishBlocker[] = [];

  if (!d.name.trim())
    blockers.push({ id: 'name', label: 'A product name', step: 'ProductWizardBasics' });
  if (!d.categoryId)
    blockers.push({ id: 'category', label: 'A category', step: 'ProductWizardBasics' });
  if (!d.brandId) blockers.push({ id: 'brand', label: 'A brand', step: 'ProductWizardBasics' });
  if (d.genders.length === 0)
    blockers.push({ id: 'gender', label: 'A gender', step: 'ProductWizardBasics' });
  if (d.gallery.length < 1)
    blockers.push({ id: 'gallery', label: 'At least one product image', step: 'ProductWizardBasics' });
  if (!d.description.trim())
    blockers.push({ id: 'description', label: 'A short description', step: 'ProductWizardDetails' });
  if (!d.descriptionLong.trim())
    blockers.push({
      id: 'descriptionLong',
      label: 'A full description',
      step: 'ProductWizardDetails',
    });
  if (!d.listingPolicy)
    blockers.push({ id: 'policy', label: 'A return policy', step: 'ProductWizardDetails' });

  // A live listing needs at least ONE variant carrying price + SKU + stock + an
  // image (its own, or inherited from the gallery).
  //
  // SKU is deliberately NOT checked here: the backend generates a store-unique one
  // whenever the retailer leaves the field blank, so demanding it client-side would
  // block a product the server would happily publish. Stock likewise defaults to 0,
  // which satisfies the server's "has a stock figure" test.
  const galleryCovers = d.gallery.length > 0;
  const priceOk = (price: string): boolean => {
    const p = parseRupeesToPaise(price.trim() || d.basePrice);
    return p != null && p > 0;
  };

  const hasCompleteVariant =
    d.variantMode === 'single'
      ? priceOk('') && (galleryCovers || d.single.imageUrls.length > 0)
      : d.colors.some((c) =>
          c.sizes.some((r) => priceOk(r.price) && (galleryCovers || r.imageUrls.length > 0)),
        );

  if (!hasCompleteVariant) {
    blockers.push({
      id: 'variant',
      label: 'One complete variant — needs a price and an image',
      step: 'ProductWizardVariants',
    });
  }

  return blockers;
}

/**
 * After creating a color_size listing, the backend may auto-create one empty
 * "Default" variant group. There is no delete/rename-group endpoint, so if that
 * single empty group exists we reuse it for the first color (avoids a stray
 * group); otherwise we create a group per color.
 */
async function resolveFirstGroup(listingId: string): Promise<string | undefined> {
  try {
    const listing = await getListing(listingId);
    const groups = listing.variantGroups ?? [];
    const variants = listing.variants ?? [];
    const emptyDefault = groups.find(
      (g) => g.isDefault && !variants.some((v) => v.groupId === g.id),
    );
    if (groups.length === 1 && emptyDefault) return emptyDefault.id;
    return undefined;
  } catch {
    return undefined;
  }
}

export async function commitProductDraft({ publish }: { publish: boolean }): Promise<Listing> {
  const d = useProductDraft.getState();
  console.log(
    `[commit] start - mode=${d.mode} variantMode=${d.variantMode} publish=${publish} colors=${d.colors.length}`,
  );

  // 1) LISTING
  let listingId: string;
  if (d.mode === 'edit') {
    listingId = d.editingListingId!;
    await step(`update listing ${listingId}`, () => updateListing(listingId, listingUpdateBody(d)));
  } else if (d.createdListingId) {
    listingId = d.createdListingId;
  } else {
    const created = await step('create listing', () => createListing(listingCreateBody(d)));
    listingId = created.id;
    d.setCreatedListingId(listingId);
  }

  // 2) VARIANTS
  if (d.variantMode === 'single') {
    const size = d.single.size.trim();
    // Pricing comes from Basics (product-level). Unpriced draft: no variant yet —
    // validateProductDraft already refused to save any variant details without a price.
    const price = sellingPrice(d.basePrice);
    const body =
      price == null
        ? null
        : {
            sku: d.single.sku.trim() || undefined,
            pricePaise: price,
            compareAtPrice: comparePrice(d.baseMrp),
            stock: Number(d.single.stock) || 0,
            imageUrls: d.single.imageUrls,
          };
    if (!body) {
      console.log('[commit] no selling price yet - saved without a variant');
    } else if (d.single.serverVariantId) {
      await step(`patch default variant ${d.single.serverVariantId} (size=${size || 'none'})`, () =>
        patchVariant(d.single.serverVariantId!, {
          // OMIT sku when the retailer left the field blank. Sending null wipes the
          // SKU the backend auto-generated at create time, and a variant with no SKU
          // fails isVariantComplete — so a retry after any failed publish would
          // permanently block the product from going live.
          ...(body.sku ? { sku: body.sku } : {}),
          pricePaise: body.pricePaise,
          compareAtPrice: body.compareAtPrice,
          stock: body.stock,
          imageUrls: body.imageUrls,
          // Optional single-product size. Identity is system-managed on
          // single/color_size listings: send `size` and the backend derives the
          // attributes - raw attribute patches 422 there.
          ...(size ? { size } : {}),
        }),
      );
    } else {
      const v = await step('create default variant', () => setDefaultVariant(listingId, body));
      d.setSingleVariantId(v.id);
      // The default-variant endpoint takes no size; set it (if any) with a
      // follow-up system-path patch.
      if (size) {
        await step(`set size "${size}" on ${v.id}`, () => patchVariant(v.id, { size }));
      }
    }
  } else {
    const reusableGroupId = d.mode === 'create' ? await resolveFirstGroup(listingId) : undefined;
    let firstGroupConsumed = false;

    for (let ci = 0; ci < d.colors.length; ci++) {
      const color = d.colors[ci];
      let groupId = color.serverGroupId;
      if (!groupId) {
        if (reusableGroupId && !firstGroupConsumed) {
          groupId = reusableGroupId;
          firstGroupConsumed = true;
        } else {
          const name = color.name.trim() || `Color ${ci + 1}`;
          const g = await step(`create group "${name}"`, () =>
            createGroup(listingId, { name, colorHex: color.colorHex, sortOrder: ci }),
          );
          groupId = g.id;
        }
        d.setColorGroupId(color.id, groupId);
      }

      for (const row of color.sizes) {
        if (isBlankRow(row)) continue;
        const size = row.size.trim();
        // Per-colour selling price overrides the base; MRP is always base. Validation has
        // already refused a priceless row, so reaching here without one is a bug, not input.
        const rowPrice = sellingPrice(row.price, d.basePrice);
        if (rowPrice == null) throw new Error('Set a selling price before saving this variant');
        const body = {
          size,
          sku: row.sku.trim() || undefined,
          pricePaise: rowPrice,
          compareAtPrice: comparePrice(d.baseMrp),
          stock: Number(row.stock) || 0,
          imageUrls: row.imageUrls,
        };
        const who = `${color.name.trim() || `color ${ci + 1}`}/${size || 'no size'}`;
        if (row.serverVariantId) {
          await step(`patch variant ${who} (${row.serverVariantId})`, () =>
            patchVariant(row.serverVariantId!, {
              // Omit rather than null — see the single-variant patch above.
              ...(body.sku ? { sku: body.sku } : {}),
              pricePaise: body.pricePaise,
              compareAtPrice: body.compareAtPrice,
              stock: body.stock,
              imageUrls: body.imageUrls,
              // System-managed identity: `size` re-derives attributes/label.
              ...(size ? { size } : {}),
            }),
          );
        } else {
          const v = await step(`create variant ${who}`, () =>
            createGroupVariant(listingId, groupId!, body),
          );
          d.setSizeVariantId(color.id, row.id, v.id);
        }
      }
    }
  }

  // Product-type switch while editing (single ⇄ color variants): the old
  // mode's variants are replaced by the new set, so delete them once the new
  // ones exist. Their seeded server IDs are still in the untouched half of the
  // draft.
  const modeSwitched =
    d.mode === 'edit' && !!d.editingVariantMode && d.editingVariantMode !== d.variantMode;
  const staleVariantIds = !modeSwitched
    ? []
    : d.variantMode === 'single'
      ? d.colors
          .flatMap((c) => c.sizes.map((r) => r.serverVariantId))
          .filter((x): x is string => !!x)
      : d.single.serverVariantId
        ? [d.single.serverVariantId]
        : [];

  // Edit deletions - variants the user removed from an existing product.
  for (const vid of new Set([...d.removedVariantIds, ...staleVariantIds])) {
    await step(`delete variant ${vid}`, () => deleteVariant(vid));
  }

  // 3) STATUS
  if (publish) {
    await step('publish listing', () => updateListing(listingId, { status: 'active' }));
  }

  console.log(`[commit] done - listing ${listingId}`);
  return getListing(listingId);
}
