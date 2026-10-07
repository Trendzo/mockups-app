/**
 * Push payload logic: FCM message -> normalised push -> channel + screen to open.
 * Convention: data.kind, data.deepLink (web-style path), data.orderId?; Android channel
 * `orders` for new-order pushes, `general` otherwise.
 */
import {
  channelFor,
  navDataFrom,
  navDataOf,
  newOrderNotification,
  newOrdersSummaryNotification,
  parsePush,
  targetForPush,
} from '../src/services/push/payload';

describe('parsePush', () => {
  it('reads kind, deepLink and orderId from the data bag and title/body from the notification block', () => {
    const p = parsePush({
      messageId: 'm1',
      notification: { title: 'New order', body: '2 items · ₹1,200' },
      data: { kind: 'order', deepLink: '/retailer/orders/ord_9', orderId: 'ord_9' },
    });
    expect(p).toMatchObject({
      kind: 'order',
      deepLink: '/retailer/orders/ord_9',
      orderId: 'ord_9',
      title: 'New order',
      body: '2 items · ₹1,200',
      channelId: 'orders',
      messageId: 'm1',
      hasNotificationBlock: true,
      isNewOrder: true,
    });
  });

  it('derives the deep link from orderId when the server sent none', () => {
    expect(parsePush({ data: { kind: 'order', orderId: 'ord_7' } }).deepLink).toBe('/retailer/orders/ord_7');
  });

  it('falls back to data.title/body for data-only pushes and flags the missing notification block', () => {
    const p = parsePush({ data: { kind: 'payout', title: 'Payout sent', body: '₹5,000 is on its way' } });
    expect(p.title).toBe('Payout sent');
    expect(p.body).toBe('₹5,000 is on its way');
    expect(p.hasNotificationBlock).toBe(false);
    expect(p.channelId).toBe('general');
  });

  it('survives garbage: missing data, null message, non-string values', () => {
    expect(parsePush(null).kind).toBe('system');
    expect(parsePush({}).deepLink).toBeNull();
    const p = parsePush({ data: { kind: 7, orderId: 12 } as Record<string, unknown> });
    expect(p.kind).toBe('7');
    expect(p.orderId).toBe('12');
  });

  it('recognises new-order alerts by kind, or an order push titled "New order"', () => {
    expect(parsePush({ data: { kind: 'order.new', orderId: 'o' } }).isNewOrder).toBe(true);
    expect(parsePush({ data: { kind: 'new_order', orderId: 'o' } }).isNewOrder).toBe(true);
    expect(parsePush({ data: { kind: 'order', orderId: 'o' }, notification: { title: 'New order received' } }).isNewOrder).toBe(true);
    // A cancellation is an order push (loud channel) but not a new-order alert.
    expect(parsePush({ data: { kind: 'order', orderId: 'o' }, notification: { title: 'Order cancelled' } }).isNewOrder).toBe(false);
  });
});

describe('channelFor', () => {
  it('rings order pushes on `orders`, everything else on `general`', () => {
    expect(channelFor('order')).toBe('orders');
    expect(channelFor('order.new')).toBe('orders');
    expect(channelFor('order_cancelled')).toBe('orders');
    expect(channelFor('payout')).toBe('general');
    expect(channelFor('promotion')).toBe('general');
    expect(channelFor('issue')).toBe('general');
  });

  it('honours an explicit channel the backend named, but only our two ids', () => {
    expect(channelFor('payout', 'orders')).toBe('orders');
    expect(channelFor('order', 'general')).toBe('general');
    expect(channelFor('order', 'some_other_channel')).toBe('orders');
    expect(
      parsePush({ data: { kind: 'kyc' }, notification: { android: { channelId: 'orders' } } }).channelId,
    ).toBe('orders');
  });
});

describe('targetForPush (payload -> route through routeForDeepLink)', () => {
  it('opens the order for an order deep link or just an orderId', () => {
    expect(targetForPush({ deepLink: '/retailer/orders/ord_1' })).toEqual({
      name: 'OrderDetail',
      params: { id: 'ord_1' },
    });
    expect(targetForPush({ orderId: 'ord_2' })).toEqual({ name: 'OrderDetail', params: { id: 'ord_2' } });
  });

  it('maps other web paths the app has screens for', () => {
    expect(targetForPush({ deepLink: '/retailer/payouts/po_3' })).toEqual({
      name: 'PayoutDetail',
      params: { id: 'po_3' },
    });
    expect(targetForPush({ deepLink: '/retailer/orders' })).toEqual({ name: 'Main', params: { screen: 'Orders' } });
    expect(targetForPush({ deepLink: '/retailer/store/kyc' })).toEqual({ name: 'Kyc' });
  });

  it('lands unknown or missing links on the inbox so the tap is never wasted', () => {
    expect(targetForPush({ deepLink: '/retailer/promotions/abc' })).toEqual({ name: 'Notifications' });
    expect(targetForPush({})).toEqual({ name: 'Notifications' });
    expect(targetForPush(null)).toEqual({ name: 'Notifications' });
  });
});

describe('nav data round trip', () => {
  it('stores string-only data on a local notification and reads it back on tap', () => {
    const push = parsePush({ data: { kind: 'order', orderId: 'ord_5' } });
    const data = navDataOf(push);
    expect(data).toEqual({ kind: 'order', deepLink: '/retailer/orders/ord_5', orderId: 'ord_5' });
    expect(Object.values(data).every((v) => typeof v === 'string')).toBe(true);
    expect(targetForPush(navDataFrom(data))).toEqual({ name: 'OrderDetail', params: { id: 'ord_5' } });
  });

  it('navDataFrom tolerates an empty/absent bag', () => {
    expect(navDataFrom(undefined)).toEqual({ kind: undefined, deepLink: null, orderId: null });
  });
});

describe('local new-order notifications', () => {
  it('one order: a stable id (so push + poll update one tray entry) that opens that order', () => {
    const n = newOrderNotification({ id: 'ord_1', itemCount: 2, grandTotalLabel: '₹1,200' });
    expect(n.id).toBe('order-new-ord_1');
    expect(n.title).toBe('New order');
    expect(n.body).toBe('2 items · ₹1,200 — accept it now');
    expect(targetForPush(navDataFrom(n.data))).toEqual({ name: 'OrderDetail', params: { id: 'ord_1' } });
    expect(newOrderNotification({ id: 'o', itemCount: 1, grandTotalLabel: '₹5' }).body).toContain('1 item ·');
  });

  it('several orders: one summary that opens the Orders tab', () => {
    const n = newOrdersSummaryNotification(3);
    expect(n.title).toBe('3 new orders');
    expect(targetForPush(navDataFrom(n.data))).toEqual({ name: 'Main', params: { screen: 'Orders' } });
  });
});
