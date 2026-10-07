/**
 * Store-side order actions: the web portal's rule table, permission gating, and the
 * dispute / refund actions on the order page.
 */
import { ACTION_PERMISSION, actionsFor, issueActionsFor } from '../src/screens/orders/orderActions';
import { routeForDeepLink } from '../src/utils/orders';
import { defaultForRole } from '../src/utils/usePermission';
import type { OrderDetail, OrderReturn, OrderStatus } from '../src/types/orders';

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

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

const pendingReturn = (extra: Partial<OrderReturn> = {}): OrderReturn => ({
  id: 'r1',
  kind: 'door_return',
  storeDecision: 'pending',
  openedAt: iso(),
  ...extra,
});

const keys = (o: OrderDetail, can?: (k: string) => boolean) =>
  actionsFor(o, can as never).map((a) => a.key);

describe('returning_to_store: one move, never both (web parity)', () => {
  it('offers only "Mark received" while no return is waiting for a decision', () => {
    expect(keys(detail('returning_to_store'))).toEqual(['confirm-return-received']);
    const [a] = actionsFor(detail('returning_to_store'));
    expect(a.primary).toBe(true);
  });

  it('offers only accept / decline when a return is waiting and the server sends no custody info', () => {
    const o = detail('returning_to_store', { returns: [pendingReturn()] });
    expect(keys(o)).toEqual(['accept-return', 'decline-return']);
    expect(keys(o)).not.toContain('confirm-return-received');
  });

  it('steers to "Mark received" while a pending return is known to be still on its way', () => {
    // accepting would 409 ("mark the return received first"): offer the move that works
    const o = detail('returning_to_store', { returns: [pendingReturn({ goodsReceivedAt: null })] });
    expect(keys(o)).toEqual(['confirm-return-received']);
  });

  it('offers accept / decline once the goods are at the store', () => {
    const o = detail('returning_to_store', { returns: [pendingReturn({ goodsReceivedAt: iso(-1000) })] });
    expect(keys(o)).toEqual(['accept-return', 'decline-return']);
  });

  it('ignores returns that were already decided', () => {
    const o = detail('returning_to_store', { returns: [pendingReturn({ storeDecision: 'accepted' })] });
    expect(keys(o)).toEqual(['confirm-return-received']);
  });

  it('returned_to_store only ever offers the return decision', () => {
    expect(keys(detail('returned_to_store', { returns: [pendingReturn()] }))).toEqual([
      'accept-return',
      'decline-return',
    ]);
    expect(keys(detail('returned_to_store'))).toEqual([]);
  });
});

describe('permission gating', () => {
  // staff (floor) defaults straight from the app's role table
  const staff = (k: string) => defaultForRole('staff', k);
  const owner = (k: string) => defaultForRole('owner', k);

  it('maps every action to the permission the server checks', () => {
    expect(ACTION_PERMISSION).toMatchObject({
      accept: 'orders.accept',
      reject: 'orders.accept',
      pack: 'orders.pack',
      handover: 'orders.handover',
      depart: 'orders.handover',
      'door-close': 'orders.handover',
      'door-extend': 'orders.handover',
      'pickup-handover': 'orders.mark_delivered',
      'mark-delivered': 'orders.mark_delivered',
      'mark-undelivered': 'orders.mark_delivered',
      'confirm-return-received': 'orders.mark_delivered',
      'request-cancel': 'orders.cancel_request',
      'accept-return': 'returns.accept',
      'decline-return': 'returns.accept',
      'counter-return': 'returns.accept',
    });
  });

  it('keeps every move for the owner', () => {
    expect(keys(detail('accepted'), owner)).toEqual(['pack', 'request-cancel']);
    expect(keys(detail('packed'), owner)).toEqual(['handover', 'request-cancel']);
  });

  it('hides cancellation requests from floor staff but keeps the work they do', () => {
    expect(keys(detail('accepted'), staff)).toEqual(['pack']);
    expect(keys(detail('packed'), staff)).toEqual(['handover']);
    expect(keys(detail('routing'), staff)).toEqual(['accept', 'reject']);
    expect(keys(detail('out_for_delivery'), staff)).toEqual(['mark-delivered', 'mark-undelivered']);
    expect(keys(detail('returned_to_store', { returns: [pendingReturn()] }), staff)).toEqual([
      'accept-return',
      'decline-return',
    ]);
  });

  it('hides a whole group of moves when the login lacks that permission', () => {
    const noAccept = (k: string) => k !== 'orders.accept';
    expect(keys(detail('routing'), noAccept)).toEqual([]);
    const noReturns = (k: string) => k !== 'returns.accept';
    expect(keys(detail('delivered', { deliveredAt: iso(-1000) }), noReturns)).toEqual([]);
  });

  it('still disables a permitted move the state machine does not allow', () => {
    const o = detail('routing', {
      availableTransitions: [{ from: 'routing', to: 'accepted', actors: ['admin'] }],
    });
    const accept = actionsFor(o, (k) => defaultForRole('staff', k)).find((a) => a.key === 'accept');
    expect(accept?.disabledReason).toBeTruthy();
  });
});

describe('raise dispute / request refund', () => {
  it('offers both on a normal order', () => {
    const list = issueActionsFor({ status: 'delivered', openDispute: null });
    expect(list.map((a) => a.key)).toEqual(['raise-issue', 'request-refund']);
    expect(list.every((a) => !a.disabledReason)).toBe(true);
  });

  it('is not offered while a dispute is already open', () => {
    expect(issueActionsFor({ status: 'delivered', openDispute: { id: 'iss_1' } })).toEqual([]);
  });

  it('closes request-refund on a cancelled / closed / failed order but still allows a dispute', () => {
    for (const status of ['cancelled', 'closed', 'payment_failed'] as OrderStatus[]) {
      const [raise, refund] = issueActionsFor({ status, openDispute: null });
      expect(raise.disabledReason).toBeUndefined();
      expect(refund.disabledReason).toMatch(/no refund/);
    }
  });

  it('needs issues.create — which floor staff do not have', () => {
    expect(issueActionsFor({ status: 'delivered', openDispute: null }, (k) => defaultForRole('staff', k))).toEqual([]);
    expect(issueActionsFor({ status: 'delivered', openDispute: null }, (k) => defaultForRole('manager', k))).toHaveLength(2);
  });
});

describe('routeForDeepLink: disputes + returns', () => {
  it('opens a dispute thread from the portal and API paths', () => {
    const t = { name: 'IssueDetail', params: { id: 'iss_9' } };
    expect(routeForDeepLink('/retailer/disputes/iss_9')).toEqual(t);
    expect(routeForDeepLink('/retailer/issues/iss_9')).toEqual(t);
    // notifications carry "/disputes/:id" with no /retailer prefix
    expect(routeForDeepLink('/disputes/iss_9')).toEqual(t);
    expect(routeForDeepLink('https://wp.trendzonow.com/retailer/disputes/iss_9?x=1#top')).toEqual(t);
  });

  it('opens the disputes list when there is no id', () => {
    expect(routeForDeepLink('/retailer/disputes')).toEqual({ name: 'Issues' });
    expect(routeForDeepLink('/retailer/issues/')).toEqual({ name: 'Issues' });
  });

  it('opens the returns queue / one return', () => {
    expect(routeForDeepLink('/retailer/returns')).toEqual({ name: 'Returns' });
    expect(routeForDeepLink('/retailer/returns/ret_1')).toEqual({ name: 'ReturnDetail', params: { id: 'ret_1' } });
  });

  it('decodes ids and leaves other links alone', () => {
    expect(routeForDeepLink('/retailer/disputes/iss%2F1')).toEqual({ name: 'IssueDetail', params: { id: 'iss/1' } });
    expect(routeForDeepLink('/retailer/orders/ord_1')).toEqual({ name: 'OrderDetail', params: { id: 'ord_1' } });
    expect(routeForDeepLink('/retailer/dashboard')).toBeNull();
  });
});
