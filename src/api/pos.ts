import { getJson, postJson, unwrapEnvelope } from './client';
import { http, req } from './request';
import {
  PosCreateSaleRequest,
  PosCustomer,
  PosDaySummary,
  PosHeldRow,
  PosHoldRequest,
  PosLookupResponse,
  PosLookupRow,
  PosQuote,
  PosQuoteRequest,
  PosSaleCreated,
  PosSaleDetail,
  PosSaleRow,
  RegisterInfo,
} from '../types/pos';

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

// ---- In-app billing counter (same endpoints as the web portal's Register) ----

/** Search by barcode, SKU or name. `exact` is set for a barcode/SKU hit. */
export const lookupProducts = (q: string) =>
  req<PosLookupResponse>(() => http.get('/retailer/pos/lookup', { params: { q } }));

/**
 * A scanned code → one product: the scan resolver first (Trendzo QR `cx:v:`,
 * barcode or SKU), then search (an exact hit or a single result). null = no
 * match; a failing search (network, server) throws.
 */
export async function findByCode(code: string): Promise<PosLookupRow | null> {
  const resolved = await resolveScan(code).catch(() => null);
  if (resolved) return resolved;
  const res = await lookupProducts(code);
  return res?.exact ?? (res?.results?.length === 1 ? res.results[0] : null);
}

/** Price the cart: discounts, GST split, round-off, payable. */
export const quoteBill = (body: PosQuoteRequest) =>
  req<PosQuote>(() => http.post('/retailer/pos/quote', body));

/** Complete a sale. Reuse the bill's idempotency key on retries. */
export const createSale = (body: PosCreateSaleRequest) =>
  req<PosSaleCreated>(() => http.post('/retailer/pos/sales', body));

/** Park the current bill (no tenders) to resume later. */
export const holdSale = (body: PosHoldRequest) =>
  req<unknown>(() => http.post('/retailer/pos/sales/hold', body));

export const listHeldBills = () => req<PosHeldRow[]>(() => http.get('/retailer/pos/held'));

/** Returning customers by phone (last 10 digits). */
export const findCustomers = (phone: string) =>
  req<PosCustomer[]>(() => http.get('/retailer/pos/customers', { params: { phone } }));

/** Sales history. `from`/`to` are ISO instants; `q` matches the invoice number. */
export const listSales = async (params: { q?: string; from?: string; to?: string }) => {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (v) clean[k] = v;
  const data = await req<{ rows: PosSaleRow[] } | PosSaleRow[]>(() =>
    http.get('/retailer/pos/sales', { params: clean }),
  );
  return Array.isArray(data) ? data : data?.rows ?? [];
};

export const getSale = (id: string) =>
  req<PosSaleDetail>(() => http.get(`/retailer/pos/sales/${encodeURIComponent(id)}`));

/** Tax-invoice PDF. `pdfUrl` is absent while it's still being generated. */
export const getSaleInvoice = (id: string) =>
  req<{ pdfUrl?: string | null }>(() =>
    http.get(`/retailer/pos/sales/${encodeURIComponent(id)}/invoice`),
  );

/** Void a completed sale: restores stock and issues a credit note. Irreversible. */
export const voidSale = (id: string, reason: string) =>
  req<unknown>(() => http.post(`/retailer/pos/sales/${encodeURIComponent(id)}/void`, { reason }));

/** Day report for an IST calendar date ("YYYY-MM-DD"). */
export const getDaySummary = (date: string) =>
  req<PosDaySummary>(() => http.get('/retailer/pos/summary', { params: { date } }));

/** Open the cash drawer with a starting float. */
export const openDay = (openingFloatPaise: number, date: string) =>
  req<unknown>(() => http.post('/retailer/pos/day/open', { openingFloatPaise, date }));

/** Close the day (Z-report) with the counted cash. */
export const closeDay = (countedCashPaise: number, date: string, note?: string) =>
  req<unknown>(() =>
    http.post('/retailer/pos/day/close', {
      countedCashPaise,
      date,
      ...(note?.trim() ? { note: note.trim() } : {}),
    }),
  );
