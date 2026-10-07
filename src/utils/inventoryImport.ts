import { parseCsv, toCsv } from './csv';
import type {
  InventoryImportDryRun,
  InventoryImportError,
  InventoryImportPlanEntry,
  InventoryImportRow,
  InventoryImportSummary,
} from '../types/catalog';

/**
 * Inventory CSV import: parse -> dry run -> apply. The column names and row shape
 * mirror webprotal/src/lib/inventory.ts so a file exported from (or downloaded as
 * the template of) either client imports in both. The server is the authority on
 * everything it can see (SKUs, brands, stock vs reserved); this only catches what
 * is wrong with the file itself, with the same row numbers the user sees in a
 * spreadsheet.
 */

/** ImportBody: rows min 1, max 5,000. */
export const MAX_IMPORT_ROWS = 5000;
/** Apply is refused above this many new listings (the server caps it at 500). */
export const MAX_LISTING_CREATES = 500;
/** Stock column is an int4. */
const INT4_MAX = 2_147_483_647;

export interface ParseError {
  /** Row number in the file (the header is row 1); 0 = the file as a whole. */
  row: number;
  message: string;
}

export interface ParseResult {
  rows: InventoryImportRow[];
  /** `sourceRows[i]` is the file row number `rows[i]` came from. */
  sourceRows: number[];
  errors: ParseError[];
  /** Rows with neither a SKU nor a product name: nothing to match them on. */
  skipped: number;
}

/** "Product Name" / "product-name" -> "product_name". */
function normaliseHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function cellAt(cells: string[], col: number): string {
  return col >= 0 ? (cells[col] ?? '').trim() : '';
}

/** Parse the CSV text of an inventory file into import rows + file-level errors. */
export function parseInventoryCsv(text: string): ParseResult {
  const records = parseCsv(text);
  if (records.length === 0 || (records.length === 1 && records[0].every((c) => !c.trim()))) {
    return { rows: [], sourceRows: [], errors: [{ row: 0, message: 'The file is empty' }], skipped: 0 };
  }

  const header = records[0].map(normaliseHeader);
  const col = (name: string) => header.indexOf(name);
  const skuCol = col('sku');
  const stockCol = col('stock');
  const nameCol = col('product_name');
  const labelCol = col('variant_label');
  const attrCol = col('attributes');
  const brandCol = col('brand');
  const categoryCol = col('category');
  const genderCol = col('gender');
  const priceCol = col('price_paise');

  if (stockCol < 0 || (skuCol < 0 && nameCol < 0)) {
    return {
      rows: [],
      sourceRows: [],
      errors: [
        {
          row: 1,
          message: 'The first row must be a header with a "stock" column and a "sku" (or "product_name") column',
        },
      ],
      skipped: 0,
    };
  }

  const rows: InventoryImportRow[] = [];
  const sourceRows: number[] = [];
  const errors: ParseError[] = [];
  let skipped = 0;

  for (let i = 1; i < records.length; i++) {
    const cells = records[i];
    const fileRow = i + 1;
    const sku = cellAt(cells, skuCol);
    const stockRaw = cellAt(cells, stockCol);
    const productName = cellAt(cells, nameCol);
    const variantLabel = cellAt(cells, labelCol);
    const attributes = cellAt(cells, attrCol);
    const brand = cellAt(cells, brandCol);
    const category = cellAt(cells, categoryCol);
    const genderRaw = cellAt(cells, genderCol).toLowerCase();
    const priceRaw = cellAt(cells, priceCol);

    // Blank line: nothing to say about it.
    if (
      !sku && !stockRaw && !productName && !variantLabel && !attributes &&
      !brand && !category && !genderRaw && !priceRaw
    ) {
      continue;
    }
    // Nothing to identify or create a variant with.
    if (!sku && !productName) {
      skipped++;
      continue;
    }

    // Number('') is 0, so a blank cell would silently zero the stock: demand a value.
    const stock = /^\d+$/.test(stockRaw) ? Number(stockRaw) : NaN;
    if (!Number.isInteger(stock) || stock > INT4_MAX) {
      errors.push({
        row: fileRow,
        message: stockRaw ? `Invalid stock "${stockRaw}" (use a whole number, 0 or more)` : 'Stock is empty',
      });
      continue;
    }
    // Same rule the server's ImportRowSchema enforces, reported with the file row.
    if (!sku && !(productName && (variantLabel || attributes))) {
      errors.push({
        row: fileRow,
        message: 'Needs a SKU, or product_name with variant_label or attributes',
      });
      continue;
    }
    if (sku.length > 64) {
      errors.push({ row: fileRow, message: 'SKU is longer than 64 characters' });
      continue;
    }
    if (productName.length > 200 || variantLabel.length > 200) {
      errors.push({ row: fileRow, message: 'product_name / variant_label is longer than 200 characters' });
      continue;
    }
    if (genderRaw && genderRaw !== 'her' && genderRaw !== 'him' && genderRaw !== 'unisex') {
      errors.push({ row: fileRow, message: `Invalid gender "${genderRaw}" (use her, him or unisex)` });
      continue;
    }
    let pricePaise: number | undefined;
    if (priceRaw) {
      const price = /^\d+$/.test(priceRaw) ? Number(priceRaw) : NaN;
      if (!Number.isSafeInteger(price)) {
        errors.push({
          row: fileRow,
          message: `Invalid price_paise "${priceRaw}" (use whole paise, e.g. 149900 for ₹1,499)`,
        });
        continue;
      }
      pricePaise = price;
    }

    const row: InventoryImportRow = { stock };
    if (sku) row.sku = sku;
    if (productName) row.productName = productName;
    if (variantLabel) row.variantLabel = variantLabel;
    if (attributes) row.attributes = attributes;
    if (brand) row.brand = brand;
    if (category) row.category = category;
    if (genderRaw) row.gender = genderRaw as 'her' | 'him' | 'unisex';
    if (pricePaise !== undefined) row.pricePaise = pricePaise;
    rows.push(row);
    sourceRows.push(fileRow);
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    errors.push({
      row: 0,
      message: `The file has ${rows.length} rows; the limit is ${MAX_IMPORT_ROWS} per import. Split it and import the parts one by one.`,
    });
  }
  return { rows, sourceRows, errors, skipped };
}

/** The exact POST body: `dryRun` is always explicit so an apply is never implied. */
export function buildImportPayload(
  rows: ReadonlyArray<InventoryImportRow>,
  dryRun: boolean,
): { rows: InventoryImportRow[]; dryRun: boolean } {
  return { rows: rows.map((r) => ({ ...r })), dryRun };
}

const EMPTY_SUMMARY: InventoryImportSummary = {
  parsed: 0,
  stockUpdates: 0,
  variantCreates: 0,
  listingCreates: 0,
  noChange: 0,
  errors: 0,
};

/** Coerce a dry-run response so the UI can rely on every field being present. */
export function normalizeDryRun(raw: unknown): InventoryImportDryRun {
  const r = (raw ?? {}) as Partial<InventoryImportDryRun>;
  const plan = Array.isArray(r.plan) ? r.plan : [];
  // The server lists errors twice (errors[] and plan entries with action 'error').
  // Prefer errors[]; fall back to the plan for older servers that omit it.
  const errors: InventoryImportError[] = Array.isArray(r.errors)
    ? r.errors
    : plan
        .filter((p) => p.action === 'error' && p.error)
        .map((p) => ({
          row: p.row,
          sku: p.identifier,
          reason: p.error!.reason,
          ...(p.error!.detail ? { detail: p.error!.detail } : {}),
        }));
  return {
    dryRun: true,
    applied: 0,
    summary: { ...EMPTY_SUMMARY, ...(r.summary ?? {}) },
    plan,
    errors,
  };
}

export interface DryRunVerdict {
  /** Writes the apply would make (stock updates + new variants + new listings). */
  writes: number;
  canApply: boolean;
  /** Why not, in the user's words. Empty when canApply. */
  blockers: string[];
}

export function judgeDryRun(result: InventoryImportDryRun): DryRunVerdict {
  const { summary, errors } = result;
  const writes = summary.stockUpdates + summary.variantCreates + summary.listingCreates;
  const blockers: string[] = [];
  if (errors.length > 0) {
    blockers.push(
      `${errors.length} row${errors.length === 1 ? '' : 's'} would fail. Fix the file and choose it again; nothing is applied while any row has an error.`,
    );
  }
  if (summary.listingCreates > MAX_LISTING_CREATES) {
    blockers.push(
      `This file would create ${summary.listingCreates} new products; the limit is ${MAX_LISTING_CREATES} per import. Split it.`,
    );
  }
  if (errors.length === 0 && writes === 0) {
    blockers.push('Nothing to change: every row already matches your current stock.');
  }
  return { writes, canApply: blockers.length === 0, blockers };
}

/** "3 stock updates · 1 new variant · 2 new products" */
export function describeCounts(c: {
  stockUpdates: number;
  variantCreates: number;
  listingCreates: number;
  priceUpdates?: number;
}): string {
  const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;
  const parts: string[] = [];
  if (c.stockUpdates) parts.push(n(c.stockUpdates, 'stock update', 'stock updates'));
  if (c.variantCreates) parts.push(n(c.variantCreates, 'new variant', 'new variants'));
  if (c.listingCreates) parts.push(n(c.listingCreates, 'new product', 'new products'));
  if (c.priceUpdates) parts.push(n(c.priceUpdates, 'price update', 'price updates'));
  return parts.join(' · ');
}

/** Translate the server's per-row reason codes into plain language. */
export function importReasonLabel(reason: string): string {
  switch (reason) {
    case 'sku_not_found':
      return 'No variant has that SKU';
    case 'sku_ambiguous':
      return 'SKU matches multiple variants';
    case 'sku_conflict':
      return 'SKU on the row clashes with the existing variant SKU';
    case 'sku_taken_in_batch':
      return 'Same SKU appears on multiple rows in this file';
    case 'variant_not_found':
      return 'No variant matches that product / variant label';
    case 'name_label_ambiguous':
      return 'Product / variant label matches multiple variants. Add a SKU to pick one';
    case 'listing_name_ambiguous':
      return 'Product name matches multiple listings. Add a SKU to pick one';
    case 'below_reserved':
      return 'Would drop below the reserved stock';
    case 'brand_not_found':
      return 'Brand not recognised';
    case 'brand_ambiguous':
      return 'Brand matches multiple records. Use the slug';
    case 'category_not_found':
      return 'Category not recognised';
    case 'category_ambiguous':
      return 'Category matches multiple records. Use the slug';
    case 'gender_missing':
      return 'gender (her / him / unisex) is required to create a new product';
    case 'gender_invalid':
      return 'gender must be her, him or unisex';
    case 'attributes_missing':
      return 'attributes are required to create a new variant';
    case 'attributes_invalid':
      return 'attributes are malformed. Use Key=Value|Key=Value';
    case 'attribute_conflict':
      return 'These attributes already exist on another variant of this product';
    case 'attribute_conflict_in_batch':
      return 'Two rows target the same product and attributes';
    case 'price_missing':
      return 'price_paise is required when creating a variant';
    case 'price_invalid':
      return 'price_paise must be a whole number, 0 or more';
    case 'missing_create_fields':
      return 'Needs brand, category, gender, attributes and price_paise to create a new product';
    default:
      return reason.replace(/_/g, ' ');
  }
}

/** One error line: reason (+ detail) tagged with where it is in the file. */
export function describeImportError(e: InventoryImportError, sourceRows?: ReadonlyArray<number>): string {
  const fileRow = fileRowFor(e.row, sourceRows);
  const id = e.sku ? ` · ${e.sku}` : '';
  const detail = e.detail ? ` (${e.detail})` : '';
  return `Row ${fileRow}${id}: ${importReasonLabel(e.reason)}${detail}`;
}

/** Server row numbers index the rows we sent; map back to the row in the file. */
export function fileRowFor(serverRow: number, sourceRows?: ReadonlyArray<number>): number {
  return sourceRows?.[serverRow - 1] ?? serverRow;
}

/** Pull per-row errors out of a failed apply (422 `details` is the error list). */
export function importErrorsFromApiError(e: unknown): InventoryImportError[] {
  const details = (e as { details?: unknown } | null)?.details;
  if (!Array.isArray(details)) return [];
  return details.filter(
    (d): d is InventoryImportError =>
      !!d && typeof d === 'object' && typeof (d as InventoryImportError).reason === 'string',
  );
}

/** The CSV the user takes away to fix their file. */
export function buildErrorReport(
  errors: ReadonlyArray<{ row: number; sku?: string; message: string }>,
): string {
  return toCsv([['row', 'sku', 'problem'], ...errors.map((e) => [e.row, e.sku ?? '', e.message])], {
    bom: true,
  });
}

export function importPlanLabel(p: InventoryImportPlanEntry): { tag: string; text: string } {
  switch (p.action) {
    case 'stock_update': {
      const u = p.stockUpdate;
      if (!u) return { tag: 'Stock', text: p.identifier };
      const price = u.newPricePaise !== undefined && u.newPricePaise !== u.currentPricePaise;
      return {
        tag: 'Stock',
        text: `${p.identifier}: ${u.currentStock} → ${u.newStock}${price ? ' + price' : ''}`,
      };
    }
    case 'variant_create':
      return {
        tag: 'New variant',
        text: p.variantCreate
          ? `${p.variantCreate.listingName} · ${p.variantCreate.attributesLabel}`
          : p.identifier,
      };
    case 'listing_create':
      return { tag: 'New product', text: p.listingCreate?.listingName ?? p.identifier };
    case 'error':
      return { tag: 'Error', text: `${p.identifier}: ${importReasonLabel(p.error?.reason ?? 'error')}` };
    default:
      return { tag: 'No change', text: p.identifier };
  }
}
