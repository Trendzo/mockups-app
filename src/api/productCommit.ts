import {
  createGroup,
  createGroupVariant,
  createListing,
  deleteVariant,
  ensureDefaultVariantGroup,
  getListing,
  patchVariant,
  setDefaultVariant,
  updateListing,
} from './catalogManagement';
import { useProductDraft } from '../store/productDraft';
import { Listing } from '../types/catalog';
import { listingCreateBody, listingUpdateBody, pendingVariantData } from './listingPayload';
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

type SizeRow = ReturnType<typeof useProductDraft.getState>['colors'][number]['sizes'][number];

/** An untouched colour row is not a variant. */
const isBlankRow = (r: SizeRow): boolean =>
  !r.serverVariantId &&
  !r.size.trim() &&
  !r.price.trim() &&
  !r.sku.trim() &&
  !(Number(r.stock) > 0) &&
  r.imageUrls.length === 0;

/** Drafts can hold partial information; a completely untouched form is not a product. */
export function validateProductDraft(): string[] {
  const d = useProductDraft.getState();
  if (d.editingStatus === 'active' && pendingVariantData(d, false)) {
    return ['Move this product to draft before saving incomplete variant details'];
  }
  if (d.mode !== 'create' || d.createdListingId) return [];
  const meaningful = !!(
    d.name.trim() || d.gallery.length || d.brandId || d.categoryId || d.genders.length ||
    d.description.trim() || d.descriptionLong.trim() || d.basePrice.trim() || d.baseMrp.trim() ||
    d.single.sku.trim() || d.single.size.trim() || d.single.imageUrls.length || Number(d.single.stock) > 0 ||
    d.colors.some(c => c.name.trim() || c.colorHex || c.sizes.some(r =>
      r.size.trim() || r.price.trim() || r.sku.trim() || r.imageUrls.length || Number(r.stock) > 0))
  );
  return meaningful ? [] : ['Add at least one product detail or photo'];
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
  step?: PublishBlockerStep;
};

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
    await step(`update draft ${listingId}`, () => updateListing(listingId, listingUpdateBody(d)));
  } else {
    const created = await step('create listing', () => createListing(listingCreateBody(d)));
    listingId = created.id;
    d.setCreatedListingId(listingId);
  }

  // 2) VARIANTS
  if (d.variantMode === 'single') {
    const size = d.single.size.trim();
    // Pricing comes from Basics. Unpriced variant details remain on the draft listing.
    const price = sellingPrice(d.basePrice);
    const body =
      price == null
        ? null
        : {
            sku: d.single.sku.trim() || undefined,
            pricePaise: price,
            compareAtPrice: (() => { const mrp = comparePrice(d.baseMrp); return mrp != null && mrp > price ? mrp : null; })(),
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
    for (let ci = 0; ci < d.colors.length; ci++) {
      const color = d.colors[ci];
      const hasPricedRow = color.sizes.some((row) =>
        !isBlankRow(row) && !!row.size.trim() && sellingPrice(row.price, d.basePrice) != null);
      if (!hasPricedRow) continue;
      let groupId = color.serverGroupId;
      if (!groupId) {
        if (!color.name.trim()) {
          groupId = (await step('find default variant group', () => ensureDefaultVariantGroup(listingId))).id;
        } else {
          const name = color.name.trim();
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
        if (rowPrice == null || !size) continue; // preserved in draftVariantData
        const body = {
          size,
          sku: row.sku.trim() || undefined,
          pricePaise: rowPrice,
          compareAtPrice: (() => { const mrp = comparePrice(d.baseMrp); return mrp != null && mrp > rowPrice ? mrp : null; })(),
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

  // Clear staged rows only after their server variants are saved. A retry after
  // a partial network failure can reopen the draft without losing entered values.
  if (d.editingStatus !== 'active') {
    await step('save unfinished variant details', () =>
      updateListing(listingId, { draftVariantData: pendingVariantData(useProductDraft.getState()) }));
  }

  // 3) STATUS
  if (publish) {
    await step('publish listing', () => updateListing(listingId, { status: 'active' }));
  }

  console.log(`[commit] done - listing ${listingId}`);
  return getListing(listingId);
}
