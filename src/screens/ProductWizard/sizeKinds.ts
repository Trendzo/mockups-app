// Variant "size" systems by product type. Apparel uses S/M/L; jewellery and
// accessories need their own scales (ring sizes, chain lengths, shoe sizes…).
// Sources: brilliantearth.com/news/necklace-length, ivanajewels ring guide.

export type SizeKind =
  | 'apparel'
  | 'ring'
  | 'chain'
  | 'bracelet'
  | 'shoe'
  | 'onesize'
  | 'custom';

export interface SizeKindDef {
  kind: SizeKind;
  /** Short label for the type selector. */
  label: string;
  /** Heading shown above the size chips (e.g. "Ring size (US)"). */
  axis: string;
  presets: string[];
}

export const SIZE_KINDS: SizeKindDef[] = [
  { kind: 'apparel', label: 'Clothing', axis: 'Sizes', presets: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  { kind: 'ring', label: 'Rings', axis: 'Ring size (US)', presets: ['5', '6', '7', '8', '9', '10', '11', '12'] },
  { kind: 'chain', label: 'Chain / Necklace', axis: 'Length', presets: ['14"', '16"', '18"', '20"', '22"', '24"'] },
  { kind: 'bracelet', label: 'Bracelet / Bangle', axis: 'Size', presets: ['2.4', '2.6', '2.8', 'S', 'M', 'L'] },
  { kind: 'shoe', label: 'Footwear', axis: 'Shoe size (UK)', presets: ['5', '6', '7', '8', '9', '10', '11'] },
  { kind: 'onesize', label: 'One size', axis: 'Size', presets: ['Free Size'] },
  { kind: 'custom', label: 'Custom', axis: 'Sizes', presets: [] },
];

export function sizeKindDef(kind: SizeKind): SizeKindDef {
  return SIZE_KINDS.find((k) => k.kind === kind) ?? SIZE_KINDS[0];
}

/** Best-guess size system from a category name (e.g. "Rings" → ring sizes). */
export function inferSizeKind(categoryLabel?: string | null): SizeKind {
  const s = (categoryLabel ?? '').toLowerCase();
  if (/\bring/.test(s)) return 'ring';
  if (/chain|necklace|pendant|mangalsutra|locket/.test(s)) return 'chain';
  if (/bracelet|bangle|kada|kad?a|cuff/.test(s)) return 'bracelet';
  if (/shoe|footwear|sneaker|sandal|heel|boot|slipper/.test(s)) return 'shoe';
  if (/earring|nose|anklet|watch|belt|cap|hat|bag|wallet|sunglass|scarf|\btie\b|brooch|keychain/.test(s))
    return 'onesize';
  return 'apparel';
}
