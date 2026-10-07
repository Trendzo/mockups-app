import {
  buildErrorReport,
  buildImportPayload,
  describeCounts,
  describeImportError,
  fileRowFor,
  importErrorsFromApiError,
  importPlanLabel,
  importReasonLabel,
  judgeDryRun,
  MAX_IMPORT_ROWS,
  normalizeDryRun,
  parseInventoryCsv,
} from '../src/utils/inventoryImport';
import { parseCsv } from '../src/utils/csv';
import type { InventoryImportDryRun } from '../src/types/catalog';

// What GET /retailer/inventory/template returns (BOM + the canonical 11 columns).
const TEMPLATE_HEADER =
  'sku,product_name,variant_label,attributes,brand,category,gender,price_paise,stock,reserved,status';

describe('parseInventoryCsv', () => {
  it('reads the server template shape, BOM and CRLF included', () => {
    const csv =
      '﻿' +
      [
        TEMPLATE_HEADER,
        'EXAMPLE-SKU-1,Linen Shirt (example),M / White,Size=M|Color=White,,,,149900,12,0,',
        ',Cotton Tee (example),M / Black,Size=M|Color=Black,acme,t-shirts,unisex,89900,8,0,',
      ].join('\r\n') +
      '\r\n';
    const r = parseInventoryCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.skipped).toBe(0);
    expect(r.rows).toEqual([
      {
        sku: 'EXAMPLE-SKU-1',
        productName: 'Linen Shirt (example)',
        variantLabel: 'M / White',
        attributes: 'Size=M|Color=White',
        pricePaise: 149900,
        stock: 12,
      },
      {
        productName: 'Cotton Tee (example)',
        variantLabel: 'M / Black',
        attributes: 'Size=M|Color=Black',
        brand: 'acme',
        category: 't-shirts',
        gender: 'unisex',
        pricePaise: 89900,
        stock: 8,
      },
    ]);
    // Row numbers as a spreadsheet shows them (header = row 1).
    expect(r.sourceRows).toEqual([2, 3]);
  });

  it('accepts a minimal sku,stock file and quoted cells with commas and quotes', () => {
    const r = parseInventoryCsv('sku,stock,product_name\nA-1,5,"Shirt, ""linen"""\n');
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([{ sku: 'A-1', productName: 'Shirt, "linen"', stock: 5 }]);
  });

  it('finds columns by name in any order, tolerating case, spaces and dashes in headers', () => {
    const r = parseInventoryCsv('Stock, SKU ,Product Name,variant-label\n7,B-2,Tee,L\n');
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([{ sku: 'B-2', productName: 'Tee', variantLabel: 'L', stock: 7 }]);
  });

  it('rejects a file without a stock column or without any identifier column', () => {
    const noStock = parseInventoryCsv('sku,price_paise\nA,100');
    expect(noStock.rows).toEqual([]);
    expect(noStock.errors).toHaveLength(1);
    expect(noStock.errors[0].row).toBe(1);

    const noId = parseInventoryCsv('stock,brand\n5,acme');
    expect(noId.rows).toEqual([]);
    expect(noId.errors).toHaveLength(1);
  });

  it('reports an empty file', () => {
    expect(parseInventoryCsv('').errors[0].message).toMatch(/empty/i);
    expect(parseInventoryCsv('﻿\n').errors[0].message).toMatch(/empty/i);
  });

  it('flags bad stock with the file row, and never reads a blank stock as 0', () => {
    const r = parseInventoryCsv('sku,stock\nA,5\nB,\nC,-3\nD,2.5\nE,abc\nF,99999999999\nG,0\n');
    expect(r.rows.map((x) => x.sku)).toEqual(['A', 'G']);
    expect(r.rows[1].stock).toBe(0);
    expect(r.errors.map((e) => e.row)).toEqual([3, 4, 5, 6, 7]);
    expect(r.errors[0].message).toMatch(/empty/i);
    expect(r.errors[1].message).toContain('"-3"');
  });

  it('flags price_paise that is not whole paise (rupees typed by mistake) instead of dropping it', () => {
    const r = parseInventoryCsv('sku,stock,price_paise\nA,1,1499.50\nB,1,-5\nC,1,\nD,1,0\n');
    expect(r.errors.map((e) => e.row)).toEqual([2, 3]);
    expect(r.rows).toEqual([
      { sku: 'C', stock: 1 },
      { sku: 'D', stock: 1, pricePaise: 0 },
    ]);
  });

  it('flags an unknown gender, but lowercases a valid one', () => {
    const r = parseInventoryCsv('sku,stock,gender\nA,1,Her\nB,1,men\nC,1,\n');
    expect(r.rows).toEqual([
      { sku: 'A', stock: 1, gender: 'her' },
      { sku: 'C', stock: 1 },
    ]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].row).toBe(3);
  });

  it('enforces the server rule that a row without a sku needs product_name + a variant identity', () => {
    const r = parseInventoryCsv(
      'sku,product_name,variant_label,attributes,stock\n,Tee,,,5\n,Tee,M,,5\n,Tee,,Size=M,5\n',
    );
    expect(r.errors.map((e) => e.row)).toEqual([2]);
    expect(r.rows).toHaveLength(2);
  });

  it('silently ignores blank lines and counts rows with nothing to identify them as skipped', () => {
    const r = parseInventoryCsv('sku,stock,brand\nA,1,\n\n,5,acme\n   ,  ,  \nB,2,\n');
    expect(r.rows.map((x) => x.sku)).toEqual(['A', 'B']);
    expect(r.sourceRows).toEqual([2, 6]);
    expect(r.skipped).toBe(1);
    expect(r.errors).toEqual([]);
  });

  it('enforces the length limits the server would 422 on', () => {
    const long = 'x'.repeat(65);
    const r = parseInventoryCsv(`sku,stock\n${long},1\nOK,1\n`);
    expect(r.rows).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/64/);
  });

  it(`refuses more than ${MAX_IMPORT_ROWS} rows (the server limit) as a whole-file problem`, () => {
    const lines = ['sku,stock'];
    for (let i = 0; i < MAX_IMPORT_ROWS + 1; i++) lines.push(`S${i},1`);
    const r = parseInventoryCsv(lines.join('\n'));
    expect(r.rows).toHaveLength(MAX_IMPORT_ROWS + 1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].row).toBe(0);
    expect(r.errors[0].message).toContain('5000');
  });

  it('accepts exactly the limit', () => {
    const lines = ['sku,stock'];
    for (let i = 0; i < MAX_IMPORT_ROWS; i++) lines.push(`S${i},1`);
    expect(parseInventoryCsv(lines.join('\n')).errors).toEqual([]);
  });

  it('keeps file row numbers right across a quoted multi-line cell', () => {
    const r = parseInventoryCsv('sku,stock,product_name\nA,1,"two\nlines"\nB,x,\n');
    // The multi-line cell is one record, so B is the 3rd record (not the 4th line).
    expect(parseCsv('sku,stock,product_name\nA,1,"two\nlines"\nB,x,\n')).toHaveLength(3);
    expect(r.errors[0].row).toBe(3);
  });
});

describe('buildImportPayload', () => {
  const rows = [{ sku: 'A', stock: 3 }];

  it('always carries an explicit dryRun flag', () => {
    expect(buildImportPayload(rows, true)).toEqual({ rows, dryRun: true });
    expect(buildImportPayload(rows, false)).toEqual({ rows, dryRun: false });
  });

  it('sends only server fields (no file-row bookkeeping) and copies the rows', () => {
    const parsed = parseInventoryCsv('sku,stock\nA,3\n');
    const payload = buildImportPayload(parsed.rows, false);
    expect(Object.keys(payload).sort()).toEqual(['dryRun', 'rows']);
    expect(payload.rows[0]).toEqual({ sku: 'A', stock: 3 });
    expect(payload.rows[0]).not.toBe(parsed.rows[0]);
  });
});

describe('dry-run result handling', () => {
  const dry = (over: Partial<InventoryImportDryRun>): InventoryImportDryRun => ({
    dryRun: true,
    applied: 0,
    summary: {
      parsed: 3,
      stockUpdates: 2,
      variantCreates: 1,
      listingCreates: 0,
      noChange: 0,
      errors: 0,
    },
    plan: [],
    errors: [],
    ...over,
  });

  it('normalizes a sparse response so the screen can trust every field', () => {
    const r = normalizeDryRun({ dryRun: true, summary: { stockUpdates: 4 } });
    expect(r.plan).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(r.summary.stockUpdates).toBe(4);
    expect(r.summary.errors).toBe(0);
    expect(normalizeDryRun(undefined).summary.parsed).toBe(0);
  });

  it('prefers errors[] and falls back to error plan entries', () => {
    const fromList = normalizeDryRun({
      errors: [{ row: 2, sku: 'A', reason: 'sku_not_found' }],
      plan: [{ row: 9, identifier: 'Z', action: 'error', error: { reason: 'x' } }],
    });
    expect(fromList.errors).toEqual([{ row: 2, sku: 'A', reason: 'sku_not_found' }]);

    const fromPlan = normalizeDryRun({
      plan: [
        { row: 1, identifier: 'A', action: 'stock_update' },
        { row: 2, identifier: 'B', action: 'error', error: { reason: 'below_reserved', detail: '3 reserved' } },
      ],
    });
    expect(fromPlan.errors).toEqual([
      { row: 2, sku: 'B', reason: 'below_reserved', detail: '3 reserved' },
    ]);
  });

  it('lets a clean dry run with writes be applied', () => {
    const v = judgeDryRun(dry({}));
    expect(v).toEqual({ writes: 3, canApply: true, blockers: [] });
  });

  it('blocks apply while any row has an error (nothing is applied then)', () => {
    const v = judgeDryRun(dry({ errors: [{ row: 1, sku: 'A', reason: 'sku_not_found' }] }));
    expect(v.canApply).toBe(false);
    expect(v.blockers[0]).toMatch(/nothing is applied/i);
  });

  it('blocks apply above 500 new products, as the server does', () => {
    const v = judgeDryRun(
      dry({
        summary: { parsed: 600, stockUpdates: 0, variantCreates: 0, listingCreates: 501, noChange: 0, errors: 0 },
      }),
    );
    expect(v.canApply).toBe(false);
    expect(v.blockers.join(' ')).toContain('501');
    expect(
      judgeDryRun(
        dry({
          summary: { parsed: 500, stockUpdates: 0, variantCreates: 0, listingCreates: 500, noChange: 0, errors: 0 },
        }),
      ).canApply,
    ).toBe(true);
  });

  it('says there is nothing to do when every row already matches', () => {
    const v = judgeDryRun(
      dry({
        summary: { parsed: 2, stockUpdates: 0, variantCreates: 0, listingCreates: 0, noChange: 2, errors: 0 },
      }),
    );
    expect(v.canApply).toBe(false);
    expect(v.writes).toBe(0);
    expect(v.blockers[0]).toMatch(/nothing to change/i);
  });
});

describe('error reporting', () => {
  it('maps a server row (index into what was sent) back to the file row', () => {
    const sourceRows = [2, 3, 7];
    expect(fileRowFor(3, sourceRows)).toBe(7);
    expect(fileRowFor(1, sourceRows)).toBe(2);
    expect(fileRowFor(9, sourceRows)).toBe(9);
    expect(fileRowFor(2)).toBe(2);
    expect(
      describeImportError({ row: 3, sku: 'A-1', reason: 'below_reserved', detail: '4 reserved' }, sourceRows),
    ).toBe('Row 7 · A-1: Would drop below the reserved stock (4 reserved)');
  });

  it('turns every reason code into words and keeps unknown ones readable', () => {
    expect(importReasonLabel('sku_not_found')).toMatch(/sku/i);
    expect(importReasonLabel('gender_missing')).toMatch(/gender/);
    expect(importReasonLabel('some_new_reason')).toBe('some new reason');
  });

  it('reads the per-row errors out of a 422 apply failure, and ignores other bodies', () => {
    const e = {
      code: 'validation_error',
      status: 422,
      message: 'Validation failed - no rows applied',
      details: [
        { row: 2, sku: 'A', reason: 'sku_not_found' },
        { nonsense: true },
        { row: 5, sku: 'B', reason: 'below_reserved', detail: '2 reserved' },
      ],
    };
    expect(importErrorsFromApiError(e)).toEqual([
      { row: 2, sku: 'A', reason: 'sku_not_found' },
      { row: 5, sku: 'B', reason: 'below_reserved', detail: '2 reserved' },
    ]);
    expect(importErrorsFromApiError({ details: { applicationId: 'x' } })).toEqual([]);
    expect(importErrorsFromApiError(new Error('boom'))).toEqual([]);
    expect(importErrorsFromApiError(null)).toEqual([]);
  });

  it('builds a CSV error report with a header and quoting', () => {
    const csv = buildErrorReport([
      { row: 4, sku: 'A,1', message: 'Invalid stock "x"' },
      { row: 0, message: 'too many rows' },
    ]);
    expect(parseCsv(csv)).toEqual([
      ['row', 'sku', 'problem'],
      ['4', 'A,1', 'Invalid stock "x"'],
      ['0', '', 'too many rows'],
    ]);
  });

  it('summarises counts and plan lines', () => {
    expect(describeCounts({ stockUpdates: 1, variantCreates: 2, listingCreates: 0 })).toBe(
      '1 stock update · 2 new variants',
    );
    expect(describeCounts({ stockUpdates: 0, variantCreates: 0, listingCreates: 0 })).toBe('');
    expect(
      importPlanLabel({
        row: 1,
        identifier: 'A-1',
        action: 'stock_update',
        stockUpdate: {
          variantId: 'v',
          sku: 'A-1',
          currentStock: 3,
          newStock: 9,
          delta: 6,
          currentPricePaise: 100,
          newPricePaise: 200,
        },
      }),
    ).toEqual({ tag: 'Stock', text: 'A-1: 3 → 9 + price' });
  });
});
