/**
 * De-duplication (one ring per order across the FCM foreground handler and the 15 s poll),
 * the registration ledger, and the poll-alert composer.
 */
import { createAlertRegistry } from '../src/services/push/alertRegistry';
import {
  createRegistrationLedger,
  REREGISTER_AFTER_MS,
  UNSUPPORTED_RETRY_MS,
} from '../src/services/push/ledger';
import { createOrderAlerter } from '../src/services/push/localAlerts';
import { CHANNELS } from '../src/services/push/channels';

describe('alert registry', () => {
  it('claims an order once inside the window, again after it', () => {
    let t = 0;
    const r = createAlertRegistry(1000, 100, () => t);
    expect(r.claim('ord_1')).toBe(true);
    expect(r.claim('ord_1')).toBe(false);
    expect(r.has('ord_1')).toBe(true);
    expect(r.claim('ord_2')).toBe(true);
    t = 1000;
    expect(r.has('ord_1')).toBe(false);
    expect(r.claim('ord_1')).toBe(true);
  });

  it('stays bounded on a very busy store, dropping the oldest', () => {
    const r = createAlertRegistry(60_000, 3, () => 0);
    for (const id of ['a', 'b', 'c', 'd']) r.claim(id);
    expect(r.has('a')).toBe(false);
    expect(r.has('d')).toBe(true);
  });
});

describe('registration ledger', () => {
  it('remembers a registered pair for 12h, forgets it for a different session or token', () => {
    const l = createRegistrationLedger();
    expect(l.shouldRegister('jwt', 'tok', 0)).toBe(true);
    l.markRegistered('jwt', 'tok', 0);
    expect(l.shouldRegister('jwt', 'tok', 1000)).toBe(false);
    expect(l.shouldRegister('jwt2', 'tok', 1000)).toBe(true);
    expect(l.shouldRegister('jwt', 'tok2', 1000)).toBe(true);
    expect(l.shouldRegister('jwt', 'tok', REREGISTER_AFTER_MS)).toBe(true);
    expect(l.current()).toEqual({ authKey: 'jwt', token: 'tok' });
    l.clear();
    expect(l.current()).toBeNull();
    expect(l.shouldRegister('jwt', 'tok', 1000)).toBe(true);
  });

  it('backs off after the server said "no such route", then tries again', () => {
    const l = createRegistrationLedger();
    l.markUnsupported(0);
    expect(l.shouldRegister('jwt', 'tok', 1000)).toBe(false);
    expect(l.shouldRegister('jwt', 'tok', UNSUPPORTED_RETRY_MS)).toBe(true);
    l.markRegistered('jwt', 'tok', UNSUPPORTED_RETRY_MS);
    expect(l.shouldRegister('jwt2', 'tok', UNSUPPORTED_RETRY_MS + 1)).toBe(true);
  });
});

describe('poll alert composer (useNewOrderAlerts -> Notifee)', () => {
  const make = () => {
    const alerts = createAlertRegistry();
    const show = jest.fn(async () => true);
    const alertNewOrders = createOrderAlerter({ alerts, show, formatTotal: (p) => `₹${p / 100}` });
    return { alerts, show, alertNewOrders };
  };

  it('rings one order on the orders channel with the order id, count and total', async () => {
    const { show, alertNewOrders } = make();
    await expect(alertNewOrders([{ id: 'ord_1', itemCount: 2, grandTotalPaise: 120000 }])).resolves.toBe(true);
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'order-new-ord_1',
        title: 'New order',
        body: '2 items · ₹1200 — accept it now',
        channelId: 'orders',
        data: { kind: 'order.new', deepLink: '/retailer/orders/ord_1', orderId: 'ord_1' },
      }),
    );
  });

  it('several orders between polls: one summary notification, all claimed', async () => {
    const { alerts, show, alertNewOrders } = make();
    await alertNewOrders([
      { id: 'a', itemCount: 1, grandTotalPaise: 100 },
      { id: 'b', itemCount: 1, grandTotalPaise: 100 },
    ]);
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ title: '2 new orders', channelId: 'orders' }));
    expect(alerts.has('a') && alerts.has('b')).toBe(true);
  });

  it('skips orders an FCM push already announced, and does not ring at all if none are left', async () => {
    const { alerts, show, alertNewOrders } = make();
    alerts.claim('ord_1'); // FCM foreground handler got there first
    await expect(alertNewOrders([{ id: 'ord_1', itemCount: 1, grandTotalPaise: 100 }])).resolves.toBe(false);
    expect(show).not.toHaveBeenCalled();
    // with one new + one already announced, only the new one rings individually
    await alertNewOrders([
      { id: 'ord_1', itemCount: 1, grandTotalPaise: 100 },
      { id: 'ord_2', itemCount: 3, grandTotalPaise: 300 },
    ]);
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ id: 'order-new-ord_2' }));
  });

  it('the same order polled again does not ring again', async () => {
    const { show, alertNewOrders } = make();
    await alertNewOrders([{ id: 'ord_1', itemCount: 1, grandTotalPaise: 100 }]);
    await alertNewOrders([{ id: 'ord_1', itemCount: 1, grandTotalPaise: 100 }]);
    expect(show).toHaveBeenCalledTimes(1);
  });
});

describe('Android channels', () => {
  it('orders is HIGH importance with sound + vibration; general is DEFAULT', () => {
    const orders = CHANNELS.find((c) => c.id === 'orders')!;
    const general = CHANNELS.find((c) => c.id === 'general')!;
    expect(orders).toMatchObject({ importance: 4, sound: 'default', vibration: true });
    expect(orders.vibrationPattern?.length).toBeGreaterThan(0);
    expect(general).toMatchObject({ importance: 3, sound: 'default' });
    expect(CHANNELS.map((c) => c.id).sort()).toEqual(['general', 'orders']);
  });
});
