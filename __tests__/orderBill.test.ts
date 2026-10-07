/**
 * Order detail data completeness: the bill rows must add up to the total whatever
 * promotions / GST split applied, and the history paging + search helpers.
 */
import { orderBill, dedupeOrders, matchesOrderSearch, nextOrderOffset } from '../src/utils/orders';
import { orderListParams } from '../src/api/orders';
import { itemOutcomeMeta } from '../src/types/orders';
import type { OrderDetail, OrderRow } from '../src/types/orders';

function detail(extra: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 'ord_01abcdefgh',
    status: 'delivered',
    deliveryMethod: 'express',
    paymentMethod: 'upi',
    placedAt: '2026-10-01T10:00:00.000Z',
    items: [],
    grandTotalPaise: 0,
    ...extra,
  };
}

const sum = (rows: { amountPaise: number }[]) => rows.reduce((s, r) => s + r.amountPaise, 0);

describe('orderBill', () => {
  it('adds up with store + Trendzo offers, coupon, points and an intra-state GST split', () => {
    // 1000 − 100 (store) − 50 (trendzo) − 30 (coupon) − 20 (points) = 800 taxable
    // GST 5% = 40 → CGST 20 + SGST 20; + delivery 40 + handling 10 + convenience 5
    const o = detail({
      itemsSubtotalPaise: 100000,
      retailerPromoPaise: 10000,
      platformPromoPaise: 5000,
      couponPaise: 3000,
      pointsRedeemedPaise: 2000,
      taxPaise: 4000,
      taxSplitKind: 'intra_state',
      cgstPaise: 2000,
      sgstPaise: 2000,
      igstPaise: 0,
      deliveryFeePaise: 4000,
      handlingFeePaise: 1000,
      convenienceFeePaise: 500,
      grandTotalPaise: 80000 + 4000 + 4000 + 1000 + 500,
    });
    const b = orderBill(o);
    expect(b.rows.map((r) => r.key)).toEqual([
      'items',
      'retailerPromo',
      'platformPromo',
      'coupon',
      'points',
      'cgst',
      'sgst',
      'delivery',
      'handling',
      'convenience',
    ]);
    expect(b.rows.find((r) => r.key === 'retailerPromo')?.amountPaise).toBe(-10000);
    expect(sum(b.rows)).toBe(o.grandTotalPaise);
    expect(b.reconciled).toBe(true);
    expect(b.rows.some((r) => r.kind === 'adjustment')).toBe(false);
  });

  it('shows a single IGST row for an inter-state sale', () => {
    const o = detail({
      itemsSubtotalPaise: 50000,
      taxPaise: 2500,
      taxSplitKind: 'inter_state',
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 2500,
      grandTotalPaise: 52500,
    });
    const b = orderBill(o);
    expect(b.rows.map((r) => r.key)).toEqual(['items', 'igst']);
    expect(sum(b.rows)).toBe(52500);
  });

  it('falls back to one GST row for an order without the split fields', () => {
    const o = detail({ itemsSubtotalPaise: 10000, taxPaise: 500, grandTotalPaise: 10500 });
    const b = orderBill(o);
    expect(b.rows.map((r) => r.label)).toEqual(['Items', 'Tax (GST)']);
    expect(sum(b.rows)).toBe(10500);
  });

  it('never subtracts the wallet — it is a tender, not a discount', () => {
    const o = detail({ itemsSubtotalPaise: 10000, taxPaise: 500, grandTotalPaise: 10500, walletAppliedPaise: 4000 });
    const b = orderBill(o);
    expect(b.rows.some((r) => r.label === 'Wallet')).toBe(false);
    expect(sum(b.rows)).toBe(10500);
    expect(b.walletPaise).toBe(4000);
    expect(b.chargedPaise).toBe(6500);
  });

  it('caps the wallet at the total', () => {
    const b = orderBill(detail({ itemsSubtotalPaise: 1000, grandTotalPaise: 1000, walletAppliedPaise: 99999 }));
    expect(b.walletPaise).toBe(1000);
    expect(b.chargedPaise).toBe(0);
  });

  it('keeps the rows summing to the total by surfacing any unexplained gap', () => {
    // discounts floored the tax base to 0 in the engine, so parts overshoot the total
    const o = detail({
      itemsSubtotalPaise: 10000,
      couponPaise: 12000,
      deliveryFeePaise: 4000,
      grandTotalPaise: 4000,
    });
    const b = orderBill(o);
    expect(sum(b.rows)).toBe(4000);
    expect(b.reconciled).toBe(false);
    const adj = b.rows.find((r) => r.kind === 'adjustment');
    expect(adj?.amountPaise).toBe(2000);
  });

  it('derives the items row from the lines when the subtotal is missing', () => {
    const o = detail({
      items: [
        { id: 'i1', listingId: 'l1', listingNameSnap: 'A', unitPricePaise: 2500, qty: 2, netLinePaise: 5000 },
        { id: 'i2', listingId: 'l2', listingNameSnap: 'B', unitPricePaise: 1000, qty: 1, netLinePaise: 1000, lineSubtotalPaise: 1000 },
      ],
      grandTotalPaise: 6000,
    });
    const b = orderBill(o);
    expect(b.rows[0]).toMatchObject({ key: 'items', amountPaise: 6000 });
    expect(sum(b.rows)).toBe(6000);
  });
});

describe('order item outcome labels', () => {
  it('stays quiet for a plain pending item and labels the rest', () => {
    expect(itemOutcomeMeta('pending_delivery')).toBeNull();
    expect(itemOutcomeMeta(undefined)).toBeNull();
    expect(itemOutcomeMeta('store_rejected_held')?.label).toBe('Return declined · held');
    expect(itemOutcomeMeta('brand_new_outcome')?.label).toBe('Brand new outcome');
  });
});

function row(id: string, extra: Partial<OrderRow> = {}): OrderRow {
  return {
    id,
    status: 'delivered',
    deliveryMethod: 'express',
    paymentMethod: 'upi',
    grandTotalPaise: 10000,
    placedAt: '2026-10-01T10:00:00.000Z',
    itemCount: 1,
    ...extra,
  };
}

describe('orders list query + history paging', () => {
  it('sends only the params that are set, so an old server sees a plain request', () => {
    expect(orderListParams(['delivered', 'closed'], 50)).toEqual({ limit: 50, statusIn: 'delivered,closed' });
    expect(orderListParams(undefined, 200)).toEqual({ limit: 200 });
    expect(
      orderListParams(['cancelled'], 50, {
        offset: 50,
        q: '  priya ',
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-30T23:59:59.000Z',
        deliveryMethod: 'pickup',
      }),
    ).toEqual({
      limit: 50,
      statusIn: 'cancelled',
      offset: 50,
      q: 'priya',
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.000Z',
      deliveryMethod: 'pickup',
    });
    // offset 0 and a blank search are not sent
    expect(orderListParams(['cancelled'], 50, { offset: 0, q: '   ' })).toEqual({ limit: 50, statusIn: 'cancelled' });
  });

  const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => row(`o${from + i}`));

  it('pages by the number of rows already loaded and stops on a short page', () => {
    expect(nextOrderOffset([page(0, 3)], 3)).toBe(3);
    expect(nextOrderOffset([page(0, 3), page(3, 3)], 3)).toBe(6);
    expect(nextOrderOffset([page(0, 3), page(3, 2)], 3)).toBeUndefined();
    expect(nextOrderOffset([], 3)).toBeUndefined();
  });

  it('stops when a page adds nothing new (an old server ignoring offset)', () => {
    // the server answers every offset with the first page
    expect(nextOrderOffset([page(0, 3), page(0, 3)], 3)).toBeUndefined();
    // a partly overlapping page (rows shifted) still continues
    expect(nextOrderOffset([page(0, 3), page(2, 3)], 3)).toBe(6);
  });

  it('dedupes across pages, first occurrence wins', () => {
    const merged = dedupeOrders([page(0, 3), page(2, 3)]);
    expect(merged.map((r) => r.id)).toEqual(['o0', 'o1', 'o2', 'o3', 'o4']);
  });

  it('searches the loaded rows by ref, id, customer, phone and item', () => {
    const r = row('ord_01j9xk2mzzzz', {
      consumerName: 'Priya Sharma',
      consumerPhone: '+91 98765 43210',
      items: [{ listingId: 'l1', name: 'Linen shirt', qty: 1 }],
    });
    expect(matchesOrderSearch(r, '')).toBe(true);
    expect(matchesOrderSearch(r, 'priya')).toBe(true);
    expect(matchesOrderSearch(r, '#01J9XK2M')).toBe(true);
    expect(matchesOrderSearch(r, '01j9xk2m')).toBe(true);
    expect(matchesOrderSearch(r, 'linen')).toBe(true);
    expect(matchesOrderSearch(r, '98765')).toBe(true);
    expect(matchesOrderSearch(r, 'nobody')).toBe(false);
    // a 2-digit fragment is too loose to match a phone
    expect(matchesOrderSearch(r, '43')).toBe(false);
  });
});
