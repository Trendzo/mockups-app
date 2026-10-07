import { OrderDetail, OrderStatus } from '../../types/orders';
import { parseDate } from '../../utils/format';

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

export const pendingReturnIds = (o: OrderDetail) =>
  (o.returns ?? []).filter((r) => r.storeDecision === 'pending').map((r) => r.id);

/**
 * What the store can do next, by status (the web portal's rules). Moves with a
 * `target` are disabled unless the server lists them in availableTransitions
 * for the retailer — when the server sends that list at all.
 */
export function actionsFor(o: OrderDetail): OrderActionDef[] {
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
      if (hasPendingReturn) {
        list.push({ key: 'accept-return', label: 'Accept return', primary: true });
        list.push({ key: 'decline-return', label: 'Decline', danger: true });
      }
      list.push({
        key: 'confirm-return-received',
        label: 'Mark received',
        primary: !hasPendingReturn,
      });
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

  const allowed = o.availableTransitions;
  if (!allowed?.length) return list;
  return list.map((a) =>
    a.target &&
    !a.disabledReason &&
    !allowed.some((t) => t.to === a.target && t.actors.includes('retailer'))
      ? { ...a, disabledReason: 'Not available right now' }
      : a,
  );
}
