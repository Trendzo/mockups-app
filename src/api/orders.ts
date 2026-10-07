import { http, req } from './request';
import { DeliveryMethod, OrderDetail, OrderRow, OrderStatus } from '../types/orders';

/** Tolerate either a bare array (current API) or a `{ rows | items }` page. */
function asRows<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const d = data as { rows?: T[]; items?: T[] } | null;
  return d?.rows ?? d?.items ?? [];
}

/**
 * Optional narrowing of GET /retailer/orders. Every field is new and optional: an
 * older server silently drops the params it does not know, so callers must cope
 * with getting the unfiltered / un-offset list back (see `useFinishedOrders`).
 */
export interface OrderListExtras {
  /** Rows to skip (paging). */
  offset?: number;
  /** ISO instants bounding `placedAt`. */
  from?: string;
  to?: string;
  /** Free-text search (order id, customer name / phone). */
  q?: string;
  deliveryMethod?: DeliveryMethod;
}

/** Query string for GET /retailer/orders. Empty values are left out entirely. */
export function orderListParams(
  statusIn?: OrderStatus[],
  limit = 200,
  extras: OrderListExtras = {},
): Record<string, string | number> {
  const params: Record<string, string | number> = { limit };
  if (statusIn?.length) params.statusIn = statusIn.join(',');
  if (extras.offset && extras.offset > 0) params.offset = extras.offset;
  if (extras.from) params.from = extras.from;
  if (extras.to) params.to = extras.to;
  const q = extras.q?.trim();
  if (q) params.q = q;
  if (extras.deliveryMethod) params.deliveryMethod = extras.deliveryMethod;
  return params;
}

/**
 * GET /retailer/orders. `limit` is capped at 200 by the server. Order is
 * oldest-first while any live status is requested and newest-first for finished
 * ones (delivered / closed / cancelled / payment_failed), so `offset` paging
 * walks backwards through history.
 */
export async function listOrders(
  statusIn?: OrderStatus[],
  limit = 200,
  extras: OrderListExtras = {},
): Promise<OrderRow[]> {
  const params = orderListParams(statusIn, limit, extras);
  const data = await req<unknown>(() => http.get('/retailer/orders', { params }));
  return asRows<OrderRow>(data);
}

export async function getOrder(id: string): Promise<OrderDetail> {
  const d = await req<OrderDetail>(() => http.get(`/retailer/orders/${encodeURIComponent(id)}`));
  return { ...d, items: d.items ?? [] };
}

/**
 * Every store-side order move is POST /retailer/orders/:id/<action>:
 * accept · reject · pack · depart · mark-delivered {otp, note?} ·
 * confirm-return-received · request-cancel {reason} · mark-undelivered {reason} ·
 * handover {handoffCode} | {agentName, agentPhone} · pickup-handover {pickupCode} ·
 * door/close {items} · door/extend {reason} · returns/open-counter {items}.
 */
export const orderAction = (id: string, action: string, body: object = {}) =>
  req<unknown>(() => http.post(`/retailer/orders/${encodeURIComponent(id)}/${action}`, body));

/** Accept a customer return (refund is issued). */
export const acceptReturn = (returnId: string, reasonNote?: string) =>
  req<unknown>(() =>
    http.post(`/retailer/returns/${encodeURIComponent(returnId)}/verify`, {
      decision: 'accepted',
      ...(reasonNote?.trim() ? { reasonNote: reasonNote.trim() } : {}),
    }),
  );

/** Decline a return — opens a dispute and holds the funds pending Trendzo review. */
export const declineReturn = (returnId: string, reasonNote: string, rejectPhotos: string[] = []) =>
  req<unknown>(() =>
    http.post(`/retailer/returns/${encodeURIComponent(returnId)}/decline`, {
      reasonNote,
      rejectPhotos,
    }),
  );

/** Tax invoices raised for an order (normally one). */
export const listOrderInvoices = async (orderId: string) => {
  const data = await req<unknown>(() =>
    http.get('/retailer/invoices', { params: { orderId, kind: 'invoice', limit: 5 } }),
  );
  return asRows<{ id: string; kind: string; number: string }>(data);
};
