import { getJson, postJson, unwrapEnvelope } from './client';
import { http, req } from './request';
import {
  PosCreateSaleRequest,
  PosCustomer,
  PosDaySummary,
  PosExchangeRequest,
  PosExchangeResult,
  PosHeldRow,
  PosHoldRequest,
  PosLookupResponse,
  PosLookupRow,
  PosQuote,
  PosQuoteRequest,
  PosReceipt,
  PosReturnRequest,
  PosReturnResult,
  PosSaleCreated,
  PosSaleDetail,
  PosSaleInvoice,
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
  req<PosSaleInvoice>(() => http.get(`/retailer/pos/sales/${encodeURIComponent(id)}/invoice`));

/**
 * The sale as a printable receipt object (built from the sale's frozen snapshots, so a reprint
 * matches the original). Used to render the 80mm receipt on the phone.
 */
export const getSaleReceipt = (id: string) =>
  req<PosReceipt>(() =>
    http.get(`/retailer/pos/sales/${encodeURIComponent(id)}/receipt`, { params: { format: 'json' } }),
  );

/** The same receipt as server-rendered plain text (`{ text }`). */
export const getSaleReceiptText = async (id: string) =>
  (
    await req<{ text: string }>(() =>
      http.get(`/retailer/pos/sales/${encodeURIComponent(id)}/receipt`, { params: { format: 'text' } }),
    )
  ).text;

/**
 * Return items from a completed sale and refund them. The refund tenders must add up to the
 * refund due exactly; reuse the request's idempotency key on retries.
 */
export const returnSale = (saleId: string, body: PosReturnRequest) =>
  req<PosReturnResult>(() =>
    http.post(`/retailer/pos/sales/${encodeURIComponent(saleId)}/returns`, body),
  );

/**
 * Exchange: hand back lines of a completed sale and sell replacements, settling only the
 * difference (one side, or neither for an even swap).
 */
export const exchangeSale = (saleId: string, body: PosExchangeRequest) =>
  req<PosExchangeResult>(() =>
    http.post(`/retailer/pos/sales/${encodeURIComponent(saleId)}/exchange`, body),
  );

/**
 * Throw away a HELD bill (it never reached a customer, so nothing to refund). The backend track is
 * adding this; an older server answers 404 "Route … not found" / 405 — see `isDiscardUnsupported`.
 */
export const discardHeldBill = (id: string) =>
  req<unknown>(() => http.delete(`/retailer/pos/sales/${encodeURIComponent(id)}`));

/** True when the server has no "discard a held bill" endpoint yet (hide the action then). */
export function isDiscardUnsupported(e: unknown): boolean {
  const err = e as { status?: number; message?: string } | null;
  if (err?.status === 405) return true;
  // A genuinely missing bill is "Sale not found"; a missing ROUTE says "Route DELETE:… not found".
  return err?.status === 404 && /^route\b/i.test(err.message ?? '');
}

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
