import { orderStats, routeForDeepLink, sortForTab, countdown, itemsPreview } from '../src/utils/orders';
import { actionsFor } from '../src/screens/orders/orderActions';
import { formatHm, shortRef, toYmd } from '../src/utils/format';
import type { OrderDetail, OrderRow, OrderStatus } from '../src/types/orders';

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

function row(id: string, status: OrderStatus, extra: Partial<OrderRow> = {}): OrderRow {
  return {
    id,
    status,
    deliveryMethod: 'express',
    paymentMethod: 'upi',
    grandTotalPaise: 100_00,
    placedAt: iso(),
    itemCount: 1,
    ...extra,
  };
}

function detail(status: OrderStatus, extra: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'ord_01abcdefgh',
    status,
    deliveryMethod: 'express',
    paymentMethod: 'upi',
    placedAt: iso(),
    items: [],
    grandTotalPaise: 100_00,
    ...extra,
  };
}

describe('orderStats (dashboard)', () => {
  it('counts the live board per tab and sums only real sales placed today', () => {
    const active = [
      row('a', 'routing'),
      row('b', 'accepted'),
      row('c', 'packed'),
      row('d', 'out_for_delivery'),
      row('e', 'undelivered'),
      row('f', 'returned_to_store'),
    ];
    const recent = [
      ...active,
      row('g', 'delivered', { deliveredAt: iso(), grandTotalPaise: 250_00 }),
      row('h', 'cancelled', { grandTotalPaise: 999_00 }),
      row('i', 'pending', { grandTotalPaise: 999_00 }),
      row('j', 'payment_failed', { grandTotalPaise: 999_00 }),
      row('k', 'delivered', { placedAt: iso(-3 * 86400000), grandTotalPaise: 40_00 }),
    ];
    const s = orderStats(active, recent);
    expect(s.newCount).toBe(1);
    expect(s.toPackCount).toBe(2);
    expect(s.shippedCount).toBe(2);
    expect(s.returnsCount).toBe(1);
    expect(s.attentionCount).toBe(2);
    // 6 live (₹100 each) + delivered ₹250 today; cancelled/pending/failed excluded.
    expect(s.ordersToday).toBe(7);
    expect(s.salesTodayPaise).toBe(850_00);
    expect(s.deliveredToday).toBe(1);
    expect(s.cancelledToday).toBe(1);
    expect(s.week).toHaveLength(7);
    expect(s.week[6].ymd).toBe(toYmd(new Date()));
    expect(s.week[6].paise).toBe(850_00);
    expect(s.sales30Paise).toBe(890_00);
  });
});

describe('sortForTab', () => {
  it('puts the soonest acceptance deadline first for new orders', () => {
    const late = row('late', 'routing', { acceptanceDeadlineAt: iso(120_000) });
    const soon = row('soon', 'routing', { acceptanceDeadlineAt: iso(30_000) });
    expect(sortForTab('new', [late, soon]).map((o) => o.id)).toEqual(['soon', 'late']);
  });

  it('works the packing queue oldest-first with try & buy ahead', () => {
    const old = row('old', 'accepted', { placedAt: iso(-60_000) });
    const fresh = row('fresh', 'accepted', { placedAt: iso() });
    const tryOn = row('try', 'accepted', { placedAt: iso(), deliveryMethod: 'try_and_buy' });
    expect(sortForTab('preparing', [fresh, old, tryOn]).map((o) => o.id)).toEqual([
      'try',
      'old',
      'fresh',
    ]);
  });
});

describe('order helpers', () => {
  it('previews items with a "+N more" tail', () => {
    expect(
      itemsPreview(
        row('a', 'accepted', {
          itemCount: 5,
          items: [
            { listingId: 'l1', name: 'Kurta', qty: 2 },
            { listingId: 'l2', name: 'Shirt', qty: 1 },
          ],
        }),
      ),
    ).toBe('Kurta ×2, Shirt ×1 +2 more');
  });

  it('formats countdowns and returns null once the deadline passed', () => {
    const now = Date.now();
    expect(countdown(new Date(now + 125_000).toISOString(), now)).toBe('2:05');
    expect(countdown(new Date(now - 1000).toISOString(), now)).toBeNull();
    expect(countdown(null, now)).toBeNull();
  });
});

describe('routeForDeepLink (notifications)', () => {
  it('maps portal paths to app screens', () => {
    expect(routeForDeepLink('/retailer/orders/ord_123')).toEqual({
      name: 'OrderDetail',
      params: { id: 'ord_123' },
    });
    expect(routeForDeepLink('https://wp.trendzonow.com/retailer/payouts/po_9?x=1')).toEqual({
      name: 'PayoutDetail',
      params: { id: 'po_9' },
    });
    expect(routeForDeepLink('/retailer/payouts')).toEqual({ name: 'Earnings' });
    expect(routeForDeepLink('/retailer/store/kyc')).toEqual({ name: 'Kyc' });
    // The returns queue + return detail have their own screens now.
    expect(routeForDeepLink('/retailer/returns')).toEqual({ name: 'Returns' });
    expect(routeForDeepLink('/retailer/returns/ret_1')).toEqual({
      name: 'ReturnDetail',
      params: { id: 'ret_1' },
    });
    expect(routeForDeepLink('/retailer/disputes/iss_1')).toEqual({
      name: 'IssueDetail',
      params: { id: 'iss_1' },
    });
    expect(routeForDeepLink('/retailer/listings/lst_7')).toEqual({
      name: 'ProductDetail',
      params: { id: 'lst_7' },
    });
    expect(routeForDeepLink('/retailer/dashboard')).toBeNull();
    expect(routeForDeepLink(null)).toBeNull();
  });
});

describe('actionsFor (order detail)', () => {
  const keys = (o: OrderDetail) => actionsFor(o).map((a) => a.key);

  it('follows the store-side state machine', () => {
    expect(keys(detail('routing'))).toEqual(['accept', 'reject']);
    expect(keys(detail('accepted'))).toEqual(['pack', 'request-cancel']);
    expect(keys(detail('packed'))).toEqual(['handover', 'request-cancel']);
    expect(keys(detail('packed', { deliveryMethod: 'pickup' }))).toEqual([
      'pickup-handover',
      'request-cancel',
    ]);
    expect(keys(detail('at_door'))).toEqual(['door-close', 'door-extend', 'mark-undelivered']);
    expect(keys(detail('at_door', { doorWindowExtendedAt: iso() }))).toEqual([
      'door-close',
      'mark-undelivered',
    ]);
    expect(keys(detail('cancelled'))).toEqual([]);
  });

  it('offers return decisions only while a return is pending', () => {
    const pending = detail('returned_to_store', {
      returns: [{ id: 'r1', kind: 'standard_return', storeDecision: 'pending', openedAt: iso() }],
    });
    expect(keys(pending)).toEqual(['accept-return', 'decline-return']);
    expect(keys(detail('returned_to_store'))).toEqual([]);
  });

  it('in returning_to_store offers "Mark received" OR accept / decline, never both (web parity)', () => {
    const waiting = detail('returning_to_store', {
      returns: [{ id: 'r1', kind: 'door_return', storeDecision: 'pending', openedAt: iso() }],
    });
    expect(keys(waiting)).toEqual(['accept-return', 'decline-return']);
    expect(keys(detail('returning_to_store'))).toEqual(['confirm-return-received']);
    expect(actionsFor(detail('returning_to_store'))[0].primary).toBe(true);
  });

  it('disables moves the server does not allow for the retailer', () => {
    const o = detail('routing', {
      availableTransitions: [{ from: 'routing', to: 'accepted', actors: ['admin'] }],
    });
    expect(actionsFor(o).find((a) => a.key === 'accept')?.disabledReason).toBeTruthy();
  });

  it('closes counter returns 7 days after delivery', () => {
    const fresh = actionsFor(detail('delivered', { deliveredAt: iso(-86400000) }))[0];
    const stale = actionsFor(detail('delivered', { deliveredAt: iso(-8 * 86400000) }))[0];
    expect(fresh.disabledReason).toBeUndefined();
    expect(stale.disabledReason).toMatch(/closed/);
  });
});

describe('format helpers', () => {
  it('matches the portal order reference and formats wall-clock times', () => {
    expect(shortRef('ord_01j9xk2mzzzz')).toBe('#01J9XK2M');
    expect(formatHm('09:00')).toBe('9:00 AM');
    expect(formatHm('18:30')).toBe('6:30 PM');
    expect(formatHm('00:15')).toBe('12:15 AM');
  });
});
