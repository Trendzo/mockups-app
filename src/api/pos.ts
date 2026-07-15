import { getJson, postJson, unwrapEnvelope } from './client';
import { PosLookupRow, RegisterInfo } from '../types/pos';

/**
 * POS scan endpoints. The app is the QR scanner: resolve a scanned code to a product (for the
 * confirm card), list the store's open web registers (device picker), and push a confirmed pick
 * to the chosen register - which receives it live over SSE and drops it into the cart.
 */

/** GET /retailer/pos/scan/resolve - scanned code (`cx:v:<id>` or barcode/SKU) → product row. */
export async function resolveScan(code: string): Promise<PosLookupRow> {
  const res = await getJson<unknown>(
    `/retailer/pos/scan/resolve?code=${encodeURIComponent(code)}`,
  );
  return unwrapEnvelope<{ row: PosLookupRow }>(res).row;
}

/** GET /retailer/pos/registers - the store's currently-connected web Register instances. */
export async function listRegisters(): Promise<RegisterInfo[]> {
  const res = await getJson<unknown>('/retailer/pos/registers');
  return unwrapEnvelope<{ registers: RegisterInfo[] }>(res).registers;
}

/** POST /retailer/pos/scan - push a confirmed pick (with quantity) to `target` (a register id
 *  or "all"). Returns how many registers received it (0 → nothing was listening). */
export async function pushScan(variantId: string, target: string, qty = 1): Promise<number> {
  const res = await postJson<unknown>('/retailer/pos/scan', { variantId, target, qty });
  return unwrapEnvelope<{ delivered: number }>(res).delivered;
}
