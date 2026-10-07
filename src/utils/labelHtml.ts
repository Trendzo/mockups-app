/**
 * Product price-tag labels as printable HTML, sized in mm. Pure (no React / native modules): the
 * screen hands the result to the system print dialog. Same fields, sizes and QR payload as the web
 * portal's Labels page, so a tag printed from the phone is interchangeable with one from the counter.
 *
 * The QR carries `cx:v:<variantId>` — the app-specific stable id the Register scanner resolves
 * directly (never depends on a barcode / SKU being set). The barcode option (Code 128) is for generic
 * readers, so it carries the real barcode, falling back to the SKU.
 */
import { code128Svg } from './code128';
import { escapeHtml } from './receiptHtml';
import { formatPaise } from './money';
import { qrSvg } from './qrSvg';

export type LabelSizeKey = 'sm' | 'md' | 'lg';

export const LABEL_SIZES: Record<LabelSizeKey, { label: string; w: number; h: number }> = {
  sm: { label: '38×25 mm', w: 38, h: 25 },
  md: { label: '50×25 mm', w: 50, h: 25 },
  lg: { label: '65×38 mm', w: 65, h: 38 },
};
export const LABEL_SIZE_KEYS: LabelSizeKey[] = ['sm', 'md', 'lg'];

export type CodeType = 'qr' | 'barcode';

/** What the printed tag shows. Persisted so the counter keeps its house style. */
export interface LabelConfig {
  codeType: CodeType;
  showName: boolean;
  showVariant: boolean;
  showPrice: boolean;
  showCompareAt: boolean;
  showSku: boolean;
  showProductId: boolean;
  /** The code printed as text under the symbol. */
  showCode: boolean;
}

export const DEFAULT_LABEL_CONFIG: LabelConfig = {
  codeType: 'qr',
  showName: true,
  showVariant: true,
  showPrice: true,
  showCompareAt: true,
  showSku: false,
  showProductId: false,
  showCode: false,
};

/** Toggle rows for the settings panel, in display order. */
export const LABEL_FIELD_TOGGLES: { key: Exclude<keyof LabelConfig, 'codeType'>; label: string }[] = [
  { key: 'showName', label: 'Product name' },
  { key: 'showVariant', label: 'Size / variant' },
  { key: 'showPrice', label: 'Price' },
  { key: 'showCompareAt', label: 'Compare-at price (MRP)' },
  { key: 'showSku', label: 'SKU' },
  { key: 'showProductId', label: 'Product ID' },
  { key: 'showCode', label: 'Code text' },
];

/** Persisted values are untrusted (older builds, edits): keep only known keys of the right type. */
export function mergeLabelConfig(raw: unknown): LabelConfig {
  const out: LabelConfig = { ...DEFAULT_LABEL_CONFIG };
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Record<string, unknown>;
  if (src.codeType === 'qr' || src.codeType === 'barcode') out.codeType = src.codeType;
  for (const { key } of LABEL_FIELD_TOGGLES) {
    if (typeof src[key] === 'boolean') out[key] = src[key] as boolean;
  }
  return out;
}

export const isLabelSize = (v: unknown): v is LabelSizeKey => v === 'sm' || v === 'md' || v === 'lg';

export const MAX_COPIES = 200;
export const clampCopies = (n: number): number =>
  Math.max(1, Math.min(MAX_COPIES, Math.floor(Number.isFinite(n) ? n : 1)));

/** A variant to print, with how many copies. */
export interface LabelPick {
  variantId: string;
  listingId: string;
  name: string;
  attributesLabel: string;
  sku: string | null;
  barcode: string | null;
  pricePaise: number;
  compareAtPaise: number | null;
  copies: number;
}

/** What the QR on a tag encodes. */
export const qrPayload = (variantId: string): string => `cx:v:${variantId}`;

/** The scannable text of a tag for generic readers: barcode, else SKU. */
export const humanCode = (p: Pick<LabelPick, 'barcode' | 'sku'>): string => p.barcode || p.sku || '';

export interface LabelSheet {
  html: string;
  /** Total tags on the sheet (sum of copies). */
  count: number;
  /** Names skipped because barcode mode needs a barcode or SKU they don't have. */
  skipped: string[];
}

function labelCell(p: LabelPick, config: LabelConfig, codeSvg: string): string {
  const code = humanCode(p);
  const hasCompare = config.showCompareAt && p.compareAtPaise != null && p.compareAtPaise > p.pricePaise;
  const priceRow = config.showPrice
    ? `<div class="row">${
        hasCompare ? `<span class="cmp"><span class="k">MRP</span> ${escapeHtml(formatPaise(p.compareAtPaise))}</span>` : ''
      }<span class="price"><span class="k">Price</span> ${escapeHtml(formatPaise(p.pricePaise))}</span></div>`
    : '';
  return (
    `<div class="label ${config.codeType}">` +
    (config.showName ? `<div class="name">${escapeHtml(p.name)}</div>` : '') +
    (config.showVariant && p.attributesLabel
      ? `<div class="line"><span class="k">Size</span> ${escapeHtml(p.attributesLabel)}</div>`
      : '') +
    (config.showSku && p.sku ? `<div class="line"><span class="k">SKU</span> ${escapeHtml(p.sku)}</div>` : '') +
    (config.showProductId ? `<div class="line"><span class="k">ID</span> ${escapeHtml(p.listingId)}</div>` : '') +
    `<div class="code">${codeSvg}</div>` +
    (config.showCode && code ? `<div class="line"><span class="k">Code</span> ${escapeHtml(code)}</div>` : '') +
    priceRow +
    `</div>`
  );
}

/**
 * A sheet of tags: `copies` of each pick, flowing in rows. Picks that can't be printed in the chosen
 * code type are skipped and reported (never thrown) so the rest of the sheet still prints.
 */
export function buildLabelSheet(input: {
  picks: LabelPick[];
  size: LabelSizeKey;
  config: LabelConfig;
}): LabelSheet {
  const dim = LABEL_SIZES[input.size];
  const { config } = input;
  const skipped: string[] = [];
  const cells: string[] = [];

  for (const p of input.picks) {
    const copies = clampCopies(p.copies);
    let codeSvg: string;
    if (config.codeType === 'barcode') {
      const code = humanCode(p);
      if (!code) {
        skipped.push(p.name);
        continue;
      }
      codeSvg = code128Svg(code, { height: dim.h > 30 ? 42 : 30 });
    } else {
      codeSvg = qrSvg(qrPayload(p.variantId));
    }
    const cell = labelCell(p, config, codeSvg);
    for (let i = 0; i < copies; i++) cells.push(cell);
  }

  // Android's print WebView ignores @page size and floors text at ~8px, so type is kept ≥ 8px and the
  // tags are laid out as a flowing sheet (pick the roll / sheet size in the print dialog).
  const css = `
    @page { size: auto; margin: 5mm; }
    * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; color: #000; font-weight: 600; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { display: flex; flex-wrap: wrap; gap: 2mm; align-content: flex-start; }
    .label { width: ${dim.w}mm; height: ${dim.h}mm; border: 1px solid #ddd; padding: 1mm 1.5mm;
      display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;
      break-inside: avoid; page-break-inside: avoid; }
    .name { font-size: 9px; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .line { font-size: 8px; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .k { text-transform: uppercase; letter-spacing: .02em; }
    .k::after { content: ':'; }
    .code { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; }
    .label.barcode .code svg { width: 100%; height: 100%; }
    .label.qr .code svg { height: 100%; width: auto; max-width: 100%; }
    .row { display: flex; justify-content: flex-end; align-items: baseline; gap: 4px; }
    .cmp { font-size: 8px; text-decoration: line-through; }
    .price { font-size: 11px; }
  `;
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>${css}</style></head>` +
    `<body>${cells.join('')}</body></html>`;
  return { html, count: cells.length, skipped };
}
