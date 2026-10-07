import { http, req } from './request';
import { OrderDetail, OrderRow, OrderStatus } from '../types/orders';

/** Tolerate either a bare array (current API) or a `{ rows | items }` page. */
function asRows<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const d = data as { rows?: T[]; items?: T[] } | null;
  return d?.rows ?? d?.items ?? [];
}

/** GET /retailer/orders — newest first. No paging: `limit` caps the window. */
export async function listOrders(statusIn?: OrderStatus[], limit = 200): Promise<OrderRow[]> {
  const params: Record<string, string | number> = { limit };
  if (statusIn?.length) params.statusIn = statusIn.join(',');
  const data = await req<unknown>(() => http.get('/retailer/orders', { params }));
  return asRows<OrderRow>(data);
}

export async function getOrder(id: string): Promise<OrderDetail> {
  const d = await req<OrderDetail>(() => http.get(`/retailer/orders/${encodeURIComponent(id)}`));
  return { ...d, items: d.items ?? [] };
}

/**
 * Every store-side order move is POST /retailer/orders/:id/<action>:
 * accept · reject · pack · depart · mark-delivered · confirm-return-received ·
 * request-cancel {reason} · mark-undelivered {reason} · handover
 * {handoffCode} | {agentName, agentPhone} · pickup-handover {pickupCode} ·
 * door/close {items} · door/extend {reason} · returns/open-counter {items}.
 */
export const orderAction = (id: string, action: string, body: object = {}) =>
  req<unknown>(() => http.post(`/retailer/orders/${encodeURIComponent(id)}/${action}`, body));

/** Accept a customer return (refund is issued). */
export const acceptReturn = (returnId: string) =>
  req<unknown>(() =>
    http.post(`/retailer/returns/${encodeURIComponent(returnId)}/verify`, { decision: 'accepted' }),
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
