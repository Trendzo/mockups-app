import { http, req } from './request';
import type { ReturnDetail, ReturnFilters, ReturnRow } from '../types/returns';

/**
 * Returns queue — GET /retailer/returns[/:id] (`returns.view`) plus the store's
 * moves on one return. Accepting (`verify`) and declining reuse the functions
 * the order screen already calls: see `acceptReturn` / `declineReturn` in
 * `./orders`.
 */

/** Query string for GET /retailer/returns; unset filters are left out. */
export function returnListParams(f: ReturnFilters = {}): Record<string, string | number> {
  const p: Record<string, string | number> = {};
  if (f.decision) p.decision = f.decision;
  if (f.limit) p.limit = Math.min(200, Math.max(1, Math.floor(f.limit)));
  return p;
}

/** Newest first. Each row carries `cashRefundDue` while a COD refund is unpaid. */
export async function listReturns(filters: ReturnFilters = {}): Promise<ReturnRow[]> {
  const params = returnListParams(filters);
  const data = await req<unknown>(() => http.get('/retailer/returns', { params }));
  return Array.isArray(data) ? (data as ReturnRow[]) : [];
}

/** The return, the order line it is about, held items and any cash owed. */
export async function getReturn(id: string): Promise<ReturnDetail> {
  const d = await req<ReturnDetail>(() => http.get(`/retailer/returns/${encodeURIComponent(id)}`));
  return {
    ...d,
    photos: d.photos ?? [],
    consumerPhotos: d.consumerPhotos ?? [],
    storeRejectPhotos: d.storeRejectPhotos ?? [],
    heldItems: d.heldItems ?? [],
  };
}

/**
 * The goods of a standard return reached the store: starts the verification
 * window. 409 for door returns, an already-decided return, or a window that is
 * already running.
 */
export const markReturnReceived = (id: string) =>
  req<{ returnId: string; verificationWindowExpiresAt: string }>(() =>
    http.post(`/retailer/returns/${encodeURIComponent(id)}/mark-received`, {}),
  );

/**
 * Record the notes handed to the customer for a COD refund. The amount must equal
 * the leg exactly (the server rejects anything else) and a replay is a 409
 * `disbursement_already_terminal` — paid exactly once.
 */
export const payCashRefund = (
  refundId: string,
  disbursementId: string,
  amountPaise: number,
  note?: string,
) =>
  req<unknown>(() =>
    http.post(
      `/retailer/refunds/${encodeURIComponent(refundId)}/disbursements/${encodeURIComponent(disbursementId)}/pay-cash`,
      { amountPaise, ...(note?.trim() ? { note: note.trim().slice(0, 300) } : {}) },
    ),
  );
