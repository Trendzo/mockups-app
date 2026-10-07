import { useEffect, useState } from 'react';
import {
  NEEDS_ATTENTION,
  ORDER_TABS,
  OrderDetail,
  OrderRow,
  OrderStatus,
  OrderTab,
} from '../types/orders';
import type { ReturnRow } from '../types/returns';
import { isSameDay, parseDate, shortRef, toYmd } from './format';

/** "Linen shirt ×2, Kurta ×1 +2 more" */
export function itemsPreview(row: OrderRow): string {
  const items = row.items ?? [];
  if (!items.length) return `${row.itemCount} item${row.itemCount === 1 ? '' : 's'}`;
  const shown = items.slice(0, 2).map((i) => `${i.name} ×${i.qty}`);
  const shownQty = items.slice(0, 2).reduce((s, i) => s + i.qty, 0);
  const more = row.itemCount - shownQty;
  return more > 0 ? `${shown.join(', ')} +${more} more` : shown.join(', ');
}

export function tabFor(status: OrderStatus): OrderTab | null {
  return ORDER_TABS.find((t) => t.statuses.includes(status))?.key ?? null;
}

const time = (iso?: string | null) => parseDate(iso)?.getTime() ?? 0;

/**
 * Order within a tab the way the web board does: new orders by the soonest
 * acceptance deadline; work queues FIFO with try-and-buy first; exceptions
 * first in shipped/returns; finished orders newest first.
 */
export function sortForTab(tab: OrderTab, rows: OrderRow[]): OrderRow[] {
  const out = [...rows];
  if (tab === 'new') {
    return out.sort(
      (a, b) =>
        (time(a.acceptanceDeadlineAt) || Infinity) - (time(b.acceptanceDeadlineAt) || Infinity) ||
        time(a.placedAt) - time(b.placedAt),
    );
  }
  if (tab === 'preparing' || tab === 'transit' || tab === 'returns') {
    const rank = (r: OrderRow) =>
      (NEEDS_ATTENTION.includes(r.status) ? 0 : 2) + (r.deliveryMethod === 'try_and_buy' ? 0 : 1);
    return out.sort((a, b) => rank(a) - rank(b) || time(a.placedAt) - time(b.placedAt));
  }
  return out.sort((a, b) => time(b.placedAt) - time(a.placedAt));
}

/** Re-render every `ms` (live countdowns). */
export function useNow(ms = 1000, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return now;
}

/** "2:05" left until `deadline`, or null when there's no deadline / it passed. */
export function countdown(deadline: string | null | undefined, now: number): string | null {
  const t = time(deadline);
  if (!t) return null;
  const left = Math.floor((t - now) / 1000);
  if (left <= 0) return null;
  const m = Math.floor(left / 60);
  const s = left % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Orders that count as a sale (money actually committed). */
const isSale = (s: OrderStatus) => s !== 'pending' && s !== 'payment_failed' && s !== 'cancelled';

export interface DashboardOrderStats {
  newCount: number;
  toPackCount: number;
  shippedCount: number;
  returnsCount: number;
  attentionCount: number;
  ordersToday: number;
  salesTodayPaise: number;
  deliveredToday: number;
  cancelledToday: number;
  /** Last 7 days (oldest → today) of online sales. */
  week: { ymd: string; paise: number; orders: number }[];
  sales30Paise: number;
  orders30: number;
}

/**
 * Store dashboard numbers, computed from the live board (`active`) and the
 * latest orders of every status (`recent`) — the same client-side approach the
 * web dashboard uses, since there's no dashboard endpoint.
 */
export function orderStats(active: OrderRow[], recent: OrderRow[]): DashboardOrderStats {
  const count = (tab: OrderTab) => {
    const statuses = ORDER_TABS.find((t) => t.key === tab)!.statuses;
    return active.filter((o) => statuses.includes(o.status)).length;
  };
  const today = new Date();
  const days: { ymd: string; paise: number; orders: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    days.push({ ymd: toYmd(d), paise: 0, orders: 0 });
  }
  const byDay = new Map(days.map((d) => [d.ymd, d]));
  const since30 = Date.now() - 30 * 86400000;

  let ordersToday = 0;
  let salesTodayPaise = 0;
  let deliveredToday = 0;
  let cancelledToday = 0;
  let sales30Paise = 0;
  let orders30 = 0;
  for (const o of recent) {
    const placed = parseDate(o.placedAt);
    const delivered = parseDate(o.deliveredAt);
    if (delivered && isSameDay(delivered, today)) deliveredToday += 1;
    if (!placed) continue;
    if (o.status === 'cancelled' && isSameDay(placed, today)) cancelledToday += 1;
    if (!isSale(o.status)) continue;
    const amount = o.grandTotalPaise || 0;
    if (isSameDay(placed, today)) {
      ordersToday += 1;
      salesTodayPaise += amount;
    }
    const bucket = byDay.get(toYmd(placed));
    if (bucket) {
      bucket.paise += amount;
      bucket.orders += 1;
    }
    if (placed.getTime() >= since30) {
      sales30Paise += amount;
      orders30 += 1;
    }
  }

  return {
    newCount: count('new'),
    toPackCount: count('preparing'),
    shippedCount: count('transit'),
    returnsCount: count('returns'),
    attentionCount: active.filter((o) => NEEDS_ATTENTION.includes(o.status)).length,
    ordersToday,
    salesTodayPaise,
    deliveredToday,
    cancelledToday,
    week: days,
    sales30Paise,
    orders30,
  };
}

/* ───────────────────────── history paging + search ───────────────────────── */

/** Every row of every page, first occurrence wins (pages can overlap when orders shift). */
export function dedupeOrders(pages: OrderRow[][]): OrderRow[] {
  const seen = new Set<string>();
  const out: OrderRow[] = [];
  for (const page of pages) {
    for (const row of page) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}

/**
 * The `offset` of the next page, or undefined when there is none. A page shorter
 * than asked is the end; so is a page with nothing new in it — the signature of an
 * older server that ignores `offset` and keeps returning the first page.
 */
export function nextOrderOffset(pages: OrderRow[][], pageSize: number): number | undefined {
  const last = pages[pages.length - 1];
  if (!last || last.length < pageSize) return undefined;
  const earlier = new Set(pages.slice(0, -1).flatMap((p) => p.map((r) => r.id)));
  if (earlier.size > 0 && last.every((r) => earlier.has(r.id))) return undefined;
  return pages.reduce((n, p) => n + p.length, 0);
}

/**
 * Local search over the rows already loaded (order ref/id, customer, phone, item
 * names). The server's `q` does the real work; this keeps the list honest against a
 * server that has not learned `q` yet and makes typing feel instant.
 */
export function matchesOrderSearch(o: OrderRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  const hay = [
    o.id,
    shortRef(o.id),
    o.consumerName ?? '',
    ...(o.items ?? []).map((i) => i.name),
  ]
    .join(' ')
    .toLowerCase();
  if (hay.includes(q)) return true;
  return digits.length >= 3 && (o.consumerPhone ?? '').replace(/\D/g, '').includes(digits);
}

/* ───────────────────────────── bill maths ───────────────────────────── */

export interface BillRow {
  key: string;
  label: string;
  /** Signed: discounts are negative so the rows always sum to the total. */
  amountPaise: number;
  kind: 'items' | 'discount' | 'tax' | 'fee' | 'adjustment';
  hint?: string;
}

export interface OrderBill {
  rows: BillRow[];
  /** What the customer owes for the order (the server's grand total). */
  totalPaise: number;
  /** Paid out of the wallet — a tender, not a discount. */
  walletPaise: number;
  /** total − wallet: what went through the gateway / is collected in cash. */
  chargedPaise: number;
  /** True when the server's own parts already summed to its total. */
  reconciled: boolean;
}

const n = (v?: number | null) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * The order's bill as rows that add up to `grandTotalPaise`:
 *
 *   items − store offer − Trendzo offer − coupon − points
 *   + GST (CGST+SGST within the state, IGST across states)
 *   + delivery + handling + convenience  =  total
 *
 * The wallet is NOT a row: it pays part of the total rather than lowering it, and
 * the old panel subtracted it from nothing, which is why the figures never added up.
 * Anything the parts do not explain (rounding, a legacy order) is surfaced as one
 * "Other adjustments" row instead of being silently hidden.
 */
export function orderBill(o: OrderDetail): OrderBill {
  const rows: BillRow[] = [];
  const items =
    o.itemsSubtotalPaise ??
    o.items.reduce((s, it) => s + (it.lineSubtotalPaise ?? it.unitPricePaise * it.qty), 0);
  rows.push({ key: 'items', label: 'Items', amountPaise: items, kind: 'items' });

  const discount = (key: string, label: string, v?: number, hint?: string) => {
    if (n(v) > 0) rows.push({ key, label, amountPaise: -n(v), kind: 'discount', hint });
  };
  discount('retailerPromo', 'Store offer', o.retailerPromoPaise, 'Funded by your store');
  discount('platformPromo', 'Trendzo offer', o.platformPromoPaise, 'Funded by Trendzo');
  discount('coupon', 'Coupon', o.couponPaise);
  discount('points', 'Points', o.pointsRedeemedPaise);

  const split = n(o.cgstPaise) + n(o.sgstPaise) + n(o.igstPaise);
  if (split > 0) {
    if (n(o.cgstPaise) > 0) rows.push({ key: 'cgst', label: 'CGST', amountPaise: n(o.cgstPaise), kind: 'tax' });
    if (n(o.sgstPaise) > 0) rows.push({ key: 'sgst', label: 'SGST', amountPaise: n(o.sgstPaise), kind: 'tax' });
    if (n(o.igstPaise) > 0) {
      rows.push({ key: 'igst', label: 'IGST', amountPaise: n(o.igstPaise), kind: 'tax', hint: 'Inter-state sale' });
    }
  } else if (n(o.taxPaise) > 0) {
    rows.push({ key: 'tax', label: 'Tax (GST)', amountPaise: n(o.taxPaise), kind: 'tax' });
  }

  const fee = (key: string, label: string, v?: number) => {
    if (n(v) > 0) rows.push({ key, label, amountPaise: n(v), kind: 'fee' });
  };
  fee('delivery', 'Delivery fee', o.deliveryFeePaise);
  fee('handling', 'Handling fee', o.handlingFeePaise);
  fee('convenience', 'Convenience fee', o.convenienceFeePaise);

  const total = n(o.grandTotalPaise);
  const parts = rows.reduce((s, r) => s + r.amountPaise, 0);
  const gap = total - parts;
  if (gap !== 0) {
    rows.push({
      key: 'adjustment',
      label: 'Other adjustments',
      amountPaise: gap,
      kind: 'adjustment',
      hint: 'Rounding and order changes',
    });
  }

  const wallet = Math.min(n(o.walletAppliedPaise), Math.max(0, total));
  return {
    rows,
    totalPaise: total,
    walletPaise: wallet,
    chargedPaise: Math.max(0, total - wallet),
    reconciled: gap === 0,
  };
}

/* ─────────────────────── verification windows (returns) ─────────────────────── */

export interface WindowLeft {
  expired: boolean;
  /** "5h 12m left" · "42m left" · "Expired". */
  label: string;
  /** Under an hour to go. */
  urgent: boolean;
}

/**
 * Time left on a return's verification window (the sweep auto-accepts + refunds
 * once it passes). Minute precision — it is a long clock, not a countdown timer.
 */
export function verificationWindowLeft(
  deadline: string | null | undefined,
  now: number,
): WindowLeft | null {
  const t = time(deadline);
  if (!t) return null;
  const ms = t - now;
  if (ms <= 0) return { expired: true, label: 'Expired', urgent: true };
  const mins = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const label = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h left` : h > 0 ? `${h}h ${m}m left` : `${m}m left`;
  return { expired: false, label, urgent: ms < 3_600_000 };
}

/**
 * Returns queue order: what needs a decision first (soonest verification deadline
 * on top), then cash still owed to a customer, then the rest newest first.
 */
export function sortReturnsQueue<T extends ReturnRow>(rows: T[]): T[] {
  const rank = (r: ReturnRow) => (r.storeDecision === 'pending' ? 0 : r.cashRefundDue ? 1 : 2);
  return [...rows].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) {
      const da = time(a.verificationWindowExpiresAt) || Infinity;
      const db = time(b.verificationWindowExpiresAt) || Infinity;
      if (da !== db) return da - db;
    }
    return time(b.openedAt) - time(a.openedAt);
  });
}

/**
 * Cash the store still has to hand to customers. `cashRefundDue` is per ORDER, so
 * several returns of one order carry the same leg — count each leg once.
 */
export function cashOwedTotal(rows: Pick<ReturnRow, 'cashRefundDue'>[]): { paise: number; legs: number } {
  const seen = new Set<string>();
  let paise = 0;
  for (const r of rows) {
    const d = r.cashRefundDue;
    if (!d || seen.has(d.disbursementId)) continue;
    seen.add(d.disbursementId);
    paise += d.amountPaise;
  }
  return { paise, legs: seen.size };
}

/** A navigate() target. */
export type RouteTarget = { name: string; params?: object };

/**
 * Notification deep links are web-portal paths ("/retailer/orders/ord_…").
 * Map the ones the app has a screen for; anything else just marks read.
 */
export function routeForDeepLink(link?: string | null): RouteTarget | null {
  if (!link) return null;
  const path = link.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0].replace(/\/+$/, '');
  const seg = path.replace(/^\/?(retailer\/)?/, '').split('/').filter(Boolean);
  const [a, b, c] = seg;
  switch (a) {
    case 'orders':
      return b && b !== 'history'
        ? { name: 'OrderDetail', params: { id: decodeURIComponent(b) } }
        : { name: 'Main', params: { screen: 'Orders' } };
    case 'returns':
      return b ? { name: 'ReturnDetail', params: { id: decodeURIComponent(b) } } : { name: 'Returns' };
    // Dispute notifications link to "/disputes/:id" (no /retailer prefix); the
    // portal's own paths are /retailer/disputes[/:id] and the API's /retailer/issues.
    case 'disputes':
    case 'issues':
      return b ? { name: 'IssueDetail', params: { id: decodeURIComponent(b) } } : { name: 'Issues' };
    case 'payouts':
      return b && b !== 'upcoming'
        ? { name: 'PayoutDetail', params: { id: decodeURIComponent(b) } }
        : { name: 'Earnings' };
    case 'early-disbursement':
    case 'billing-statements':
    case 'tax-invoices':
    case 'invoices':
      return { name: 'Earnings' };
    case 'kyc':
      return { name: 'Kyc' };
    case 'store':
      if (b === 'kyc') return { name: 'Kyc' };
      if (b === 'status') return { name: 'StoreStatus' };
      if (b === 'hours') return { name: 'StoreProfile', params: { tab: 'hours' } };
      return { name: 'StoreProfile' };
    case 'holiday-calendar':
      return { name: 'HolidayCalendar' };
    case 'pickup-slots':
      return { name: 'PickupSlots' };
    case 'change-requests':
      return { name: 'ChangeRequest' };
    case 'listings':
      return b && b !== 'new'
        ? { name: 'ProductDetail', params: { id: decodeURIComponent(b) } }
        : { name: 'Main', params: { screen: 'Catalog' } };
    case 'inventory':
      return { name: 'Inventory' };
    case 'pos':
      return b === 'sales' && c
        ? { name: 'PosSaleDetail', params: { id: decodeURIComponent(c) } }
        : { name: 'PosSales' };
    default:
      return null;
  }
}
