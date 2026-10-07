import { useEffect, useState } from 'react';
import {
  NEEDS_ATTENTION,
  ORDER_TABS,
  OrderRow,
  OrderStatus,
  OrderTab,
} from '../types/orders';
import { isSameDay, parseDate, toYmd } from './format';

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
      return { name: 'Main', params: { screen: 'Orders', params: { tab: 'returns' } } };
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
