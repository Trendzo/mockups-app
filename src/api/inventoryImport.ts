import { http, req } from './request';
import { buildImportPayload, normalizeDryRun } from '../utils/inventoryImport';
import type {
  InventoryImportApplied,
  InventoryImportDryRun,
  InventoryImportRow,
} from '../types/catalog';

/**
 * POST /retailer/inventory/import { rows[1..5000], dryRun: true } -> the plan and
 * the per-row errors, nothing written. `inventory.import` permission.
 */
export async function dryRunInventoryImport(
  rows: ReadonlyArray<InventoryImportRow>,
): Promise<InventoryImportDryRun> {
  const data = await req<unknown>(() =>
    http.post('/retailer/inventory/import', buildImportPayload(rows, true)),
  );
  return normalizeDryRun(data);
}

/**
 * Same endpoint with `dryRun: false`. All-or-nothing: any row error is a 422
 * (error.details = the per-row list) and nothing is applied; more than 500 new
 * listings is a 422 too.
 */
export const applyInventoryImport = (rows: ReadonlyArray<InventoryImportRow>) =>
  req<InventoryImportApplied>(() =>
    http.post('/retailer/inventory/import', buildImportPayload(rows, false)),
  );

/** GET /retailer/inventory/template: the CSV text (with a UTF-8 BOM). */
export async function fetchInventoryTemplate(): Promise<string> {
  const data = await req<unknown>(() =>
    http.get('/retailer/inventory/template', {
      responseType: 'text',
      // Keep it a string: the default transform would try to JSON.parse the CSV.
      transformResponse: (d: unknown) => d,
    }),
  );
  return typeof data === 'string' ? data : '';
}
