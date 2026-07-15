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
import { CatalogGender, CreateListingInput, Listing } from '../types/catalog';
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

function derivedGender(genders: Array<'her' | 'him'>): CatalogGender {
  if (genders.length >= 2) return 'unisex';
  return (genders[0] as CatalogGender) ?? 'unisex';
}

const paise = (s: string): number => parseRupeesToPaise(s) ?? 0;
const comparePrice = (s: string): number | null => {
  const t = s.trim();
  return t ? parseRupeesToPaise(t) : null;
};

/**
 * Steps are freely navigable, so nothing is enforced until commit. Returns a
 * list of missing/invalid things (empty = ready to save/publish).
 */
export function validateProductDraft(): string[] {
  const d = useProductDraft.getState();
  const problems: string[] = [];
  if (d.name.trim().length < 1) problems.push('Product name');
  if (!d.brandId) problems.push('Brand');
  if (!d.categoryId) problems.push('Category');
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

  if (d.variantMode === 'single') {
    if (badMoney(d.single.price, d.single.mrp)) problems.push('A valid selling price (MRP must be higher)');
  } else {
    let anySize = false;
    d.colors.forEach((c) => {
      c.sizes.forEach((r) => {
        anySize = true;
        const who = `${c.name || 'a color'} / ${r.size || 'size'}`;
        if (!r.size.trim()) problems.push(`Size name for ${c.name || 'a color'}`);
        if (badMoney(r.price, r.mrp)) problems.push(`A valid price for ${who}`);
      });
    });
    if (!anySize) problems.push('At least one variant');
  }
  return Array.from(new Set(problems));
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

  const listingFields: CreateListingInput = {
    name: d.name.trim(),
    brandId: d.brandId!,
    categoryId: d.categoryId!,
    gender: derivedGender(d.genders),
    description: d.description.trim() || undefined,
    descriptionLong: d.descriptionLong.trim() || undefined,
    listingPolicy: d.listingPolicy,
    occasion: d.occasion,
    ageGroups: d.ageGroups,
    hsn: d.hsn.trim() || undefined,
    galleryUrls: d.gallery,
    variantMode: d.variantMode,
  };

  // 1) LISTING
  let listingId: string;
  if (d.mode === 'edit') {
    listingId = d.editingListingId!;
    await updateListing(listingId, listingFields);
  } else if (d.createdListingId) {
    listingId = d.createdListingId;
  } else {
    const created = await createListing(listingFields);
    listingId = created.id;
    d.setCreatedListingId(listingId);
  }

  // 2) VARIANTS
  if (d.variantMode === 'single') {
    const size = d.single.size.trim();
    const body = {
      sku: d.single.sku.trim() || undefined,
      pricePaise: paise(d.single.price),
      compareAtPrice: comparePrice(d.single.mrp),
      stock: Number(d.single.stock) || 0,
      imageUrls: d.single.imageUrls,
    };
    if (d.single.serverVariantId) {
      await patchVariant(d.single.serverVariantId, {
        sku: body.sku ?? null,
        pricePaise: body.pricePaise,
        compareAtPrice: body.compareAtPrice,
        stock: body.stock,
        imageUrls: body.imageUrls,
        // Optional single-product size, stored as a variant attribute.
        attributes: size ? { size } : {},
        attributesLabel: size,
      });
    } else {
      const v = await setDefaultVariant(listingId, body);
      d.setSingleVariantId(v.id);
      // The default-variant endpoint takes no attributes; set the size (if any)
      // with a follow-up patch, the same way size variants store it.
      if (size) {
        await patchVariant(v.id, { attributes: { size }, attributesLabel: size });
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
          const g = await createGroup(listingId, {
            name: color.name.trim() || `Color ${ci + 1}`,
            colorHex: color.colorHex,
            sortOrder: ci,
          });
          groupId = g.id;
        }
        d.setColorGroupId(color.id, groupId);
      }

      for (const row of color.sizes) {
        const size = row.size.trim();
        const body = {
          size,
          sku: row.sku.trim() || undefined,
          pricePaise: paise(row.price),
          compareAtPrice: comparePrice(row.mrp),
          stock: Number(row.stock) || 0,
          imageUrls: row.imageUrls,
        };
        if (row.serverVariantId) {
          await patchVariant(row.serverVariantId, {
            sku: body.sku ?? null,
            pricePaise: body.pricePaise,
            compareAtPrice: body.compareAtPrice,
            stock: body.stock,
            imageUrls: body.imageUrls,
            attributes: { size },
            attributesLabel: size,
          });
        } else {
          const v = await createGroupVariant(listingId, groupId, body);
          d.setSizeVariantId(color.id, row.id, v.id);
        }
      }
    }
  }

  // Edit deletions — variants the user removed from an existing product.
  for (const vid of d.removedVariantIds) {
    await deleteVariant(vid);
  }

  // 3) STATUS
  if (publish) {
    await updateListing(listingId, { status: 'active' });
  }

  return getListing(listingId);
}
