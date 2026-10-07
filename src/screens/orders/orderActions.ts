import { OrderDetail, OrderReturn, OrderStatus } from '../../types/orders';
import { goodsAtStore } from '../../types/returns';
import { parseDate } from '../../utils/format';
import type { PermissionKey } from '../../utils/usePermission';

export type OrderActionKey =
  | 'accept'
  | 'reject'
  | 'pack'
  | 'handover'
  | 'pickup-handover'
  | 'depart'
  | 'mark-delivered'
  | 'mark-undelivered'
  | 'request-cancel'
  | 'door-close'
  | 'door-extend'
  | 'confirm-return-received'
  | 'accept-return'
  | 'decline-return'
  | 'counter-return';

export interface OrderActionDef {
  key: OrderActionKey;
  label: string;
  primary?: boolean;
  danger?: boolean;
  /** Status this moves the order to — checked against the server's allowed moves. */
  target?: OrderStatus;
  disabledReason?: string;
}

/**
 * The permission the server checks for each move (backend retailer/orders +
 * retailer/returns routes). The app hides what a login cannot do; the server still
 * enforces every one. Staff (floor) hold orders.accept / pack / handover /
 * mark_delivered and returns.accept, but not orders.cancel_request.
 */
export const ACTION_PERMISSION: Record<OrderActionKey, PermissionKey> = {
  accept: 'orders.accept',
  reject: 'orders.accept',
  pack: 'orders.pack',
  handover: 'orders.handover',
  'pickup-handover': 'orders.mark_delivered',
  depart: 'orders.handover',
  'mark-delivered': 'orders.mark_delivered',
  'mark-undelivered': 'orders.mark_delivered',
  'request-cancel': 'orders.cancel_request',
  'door-close': 'orders.handover',
  'door-extend': 'orders.handover',
  'confirm-return-received': 'orders.mark_delivered',
  'accept-return': 'returns.accept',
  'decline-return': 'returns.accept',
  'counter-return': 'returns.accept',
};

/** `can('orders.accept')` from usePermissions(); omitted = show everything (tests, previews). */
export type CanFn = (key: PermissionKey) => boolean;

/** Counter returns are allowed for 7 days after delivery (server rule). */
export const COUNTER_RETURN_DAYS = 7;

/** Toast shown after each action succeeds. */
export const ACTION_DONE: Record<OrderActionKey, string> = {
  accept: 'Order accepted — start packing',
  reject: 'Order rejected',
  pack: 'Marked as packed',
  handover: 'Handed over for delivery',
  'pickup-handover': 'Order collected by the customer',
  depart: 'Out for delivery',
  'mark-delivered': 'Marked as delivered',
  'mark-undelivered': 'Marked as undelivered',
  'request-cancel': 'Cancellation requested — Trendzo will review it',
  'door-close': 'Door visit closed',
  'door-extend': 'Door window extended',
  'confirm-return-received': 'Return received at store',
  'accept-return': 'Return accepted — refund issued',
  'decline-return': 'Return declined — Trendzo will review the dispute',
  'counter-return': 'Return opened',
};

export const pendingReturns = (o: OrderDetail): OrderReturn[] =>
  (o.returns ?? []).filter((r) => r.storeDecision === 'pending');

export const pendingReturnIds = (o: OrderDetail) => pendingReturns(o).map((r) => r.id);

/**
 * What the store can do next, by status (the web portal's rules, order-actions.tsx).
 * Moves with a `target` are disabled unless the server lists them in
 * availableTransitions for the retailer — when the server sends that list at all.
 * With `can`, moves this login has no permission for are left out.
 */
export function actionsFor(o: OrderDetail, can?: CanFn): OrderActionDef[] {
  const list: OrderActionDef[] = [];
  const hasPendingReturn = pendingReturnIds(o).length > 0;
  switch (o.status) {
    case 'routing':
      list.push({ key: 'accept', label: 'Accept order', primary: true, target: 'accepted' });
      list.push({ key: 'reject', label: 'Reject', danger: true });
      break;
    case 'accepted':
      list.push({ key: 'pack', label: 'Mark as packed', primary: true, target: 'packed' });
      list.push({ key: 'request-cancel', label: 'Request cancellation' });
      break;
    case 'packed':
      if (o.deliveryMethod === 'pickup') {
        list.push({ key: 'pickup-handover', label: 'Hand to customer', primary: true });
      } else {
        list.push({ key: 'handover', label: 'Hand to delivery', primary: true, target: 'picked_up' });
      }
      list.push({ key: 'request-cancel', label: 'Request cancellation' });
      break;
    case 'picked_up':
      list.push({ key: 'depart', label: 'Out for delivery', primary: true, target: 'out_for_delivery' });
      break;
    case 'out_for_delivery':
      list.push({ key: 'mark-delivered', label: 'Mark delivered', primary: true, target: 'delivered' });
      list.push({ key: 'mark-undelivered', label: 'Not delivered', target: 'undelivered' });
      break;
    case 'at_door':
      list.push({ key: 'door-close', label: 'Close door visit', primary: true });
      if (!o.doorWindowExtendedAt) list.push({ key: 'door-extend', label: 'More time' });
      list.push({ key: 'mark-undelivered', label: 'Not delivered', target: 'undelivered' });
      break;
    case 'returning_to_store':
      // Goods are on their way back. Like the web portal: when a return is already
      // waiting for a decision, offer accept / decline; otherwise the one move is to
      // confirm the goods arrived. Never both side by side.
      //
      // One refinement the web card lacks: the server refuses an accept (409) until
      // the goods are physically at the store, and for a door return the only way to
      // say so is this order-level "received" (which then refunds the door return on
      // arrival). So while a pending return is known NOT to be at the store yet
      // (goodsReceivedAt === null) the one move offered is "Mark received", not an
      // accept that cannot succeed. A server that does not send the field keeps the
      // web rule.
      if (hasPendingReturn && pendingReturns(o).every(goodsAtStore)) {
        list.push({ key: 'accept-return', label: 'Accept return', primary: true });
        list.push({ key: 'decline-return', label: 'Decline', danger: true });
      } else {
        list.push({ key: 'confirm-return-received', label: 'Mark received', primary: true });
      }
      break;
    case 'returned_to_store':
      if (hasPendingReturn) {
        list.push({ key: 'accept-return', label: 'Accept return', primary: true });
        list.push({ key: 'decline-return', label: 'Decline', danger: true });
      }
      break;
    case 'delivered': {
      const delivered = parseDate(o.deliveredAt);
      const open =
        !!delivered && Date.now() - delivered.getTime() <= COUNTER_RETURN_DAYS * 86400000;
      list.push({
        key: 'counter-return',
        label: 'Return at counter',
        disabledReason: open ? undefined : `Return window has closed (${COUNTER_RETURN_DAYS} days)`,
      });
      break;
    }
    default:
      break;
  }

  const permitted = can ? list.filter((a) => can(ACTION_PERMISSION[a.key])) : list;
  const allowed = o.availableTransitions;
  if (!allowed?.length) return permitted;
  return permitted.map((a) =>
    a.target &&
    !a.disabledReason &&
    !allowed.some((t) => t.to === a.target && t.actors.includes('retailer'))
      ? { ...a, disabledReason: 'Not available right now' }
      : a,
  );
}

export type IssueActionKey = 'raise-issue' | 'request-refund';

export interface IssueActionDef {
  key: IssueActionKey;
  label: string;
  disabledReason?: string;
}

/** Orders that can no longer be refunded (web: TERMINAL minus delivered). */
const NO_REFUND: OrderStatus[] = ['cancelled', 'closed', 'payment_failed'];

/**
 * "Raise dispute" / "Request refund" on the order page. Both file a dispute
 * (POST /retailer/issues, kind 'dispute') and need `issues.create`. Neither is
 * offered while a dispute is already open on the order — funds are held until an
 * admin decides, so a second one would only muddy it.
 */
export function issueActionsFor(
  o: Pick<OrderDetail, 'status' | 'openDispute'>,
  can?: CanFn,
): IssueActionDef[] {
  if (o.openDispute) return [];
  if (can && !can('issues.create')) return [];
  return [
    { key: 'raise-issue', label: 'Raise dispute' },
    {
      key: 'request-refund',
      label: 'Request refund',
      ...(NO_REFUND.includes(o.status)
        ? { disabledReason: 'Order is closed — no refund possible' }
        : {}),
    },
  ];
}
