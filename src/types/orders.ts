/**
 * Online orders placed on the Trendzo consumer app, as the store sees them.
 * Mirrors the backend order state machine (same shapes the web portal reads).
 * Money is integer paise.
 */
import type { StatusTone } from '../components/StatusChip';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'routing'
  | 'accepted'
  | 'packed'
  | 'picked_up'
  | 'out_for_delivery'
  | 'at_door'
  | 'undelivered'
  | 'returning_to_store'
  | 'returned_to_store'
  | 'delivered'
  | 'closed'
  | 'cancelled'
  | 'payment_failed';

export type DeliveryMethod = 'express' | 'standard' | 'pickup' | 'try_and_buy';
export type PaymentMethod = 'upi' | 'card' | 'cod' | 'wallet' | 'gift_card';

/** GET /retailer/orders row (plain array, newest first). */
export interface OrderRow {
  id: string;
  status: OrderStatus;
  deliveryMethod: DeliveryMethod;
  paymentMethod: PaymentMethod;
  grandTotalPaise: number;
  placedAt: string;
  consumerName?: string | null;
  consumerPhone?: string | null;
  itemCount: number;
  /** Line preview; "+N more" when itemCount exceeds it. */
  items?: { listingId: string; name: string; qty: number }[];
  acceptedAt?: string | null;
  deliveredAt?: string | null;
  acceptanceDeadlineAt?: string | null;
  doorWindowExpiresAt?: string | null;
  hasPendingReturn?: boolean;
}

export interface OrderItem {
  id: string;
  listingId: string;
  variantId?: string;
  listingNameSnap: string;
  brandSnap?: string | null;
  attributesLabelSnap?: string | null;
  galleryImageSnap?: string | null;
  unitPricePaise: number;
  qty: number;
  netLinePaise: number;
}

export interface OrderTransition {
  id: string;
  at: string;
  actorType: 'consumer' | 'retailer' | 'admin' | 'delivery_agent' | 'system' | string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  reason?: string | null;
}

export type ReturnDecision = 'pending' | 'accepted' | 'rejected';

export interface OrderReturn {
  id: string;
  kind: 'door_return' | 'standard_return' | string;
  storeDecision: ReturnDecision;
  openedAt: string;
  reasonText?: string | null;
  agentDisposition?: string | null;
}

export interface OrderRefund {
  id: string;
  status: 'pending' | 'processing' | 'succeeded' | 'partially_disbursed' | 'failed' | string;
  totalRefundPaise: number;
  disbursements?: {
    id: string;
    status: 'pending' | 'succeeded' | 'failed' | string;
    destination: string;
    amountPaise: number;
  }[];
}

/** GET /retailer/orders/:id */
export interface OrderDetail {
  id: string;
  status: OrderStatus;
  deliveryMethod: DeliveryMethod;
  paymentMethod: PaymentMethod;
  placedAt: string;
  acceptedAt?: string | null;
  deliveredAt?: string | null;
  acceptanceDeadlineAt?: string | null;
  doorWindowExpiresAt?: string | null;
  /** Set once the one allowed extension has been used. */
  doorWindowExtendedAt?: string | null;
  consumerNameSnap?: string | null;
  consumerPhoneSnap?: string | null;
  consumerEmailSnap?: string | null;
  addressLine1Snap?: string | null;
  addressLine2Snap?: string | null;
  addressCitySnap?: string | null;
  addressPincodeSnap?: string | null;
  pickupSlotStart?: string | null;
  pickupSlotEnd?: string | null;
  /** Counter code the customer shows at pickup. */
  pickupCode?: string | null;
  /** A Trendzo agent is assigned → handover needs their code. */
  assignedAgentId?: string | null;
  items: OrderItem[];
  payments?: { id: string; status: string; amountPaise: number; gatewayRef?: string | null }[];
  itemsSubtotalPaise?: number;
  couponPaise?: number;
  walletAppliedPaise?: number;
  pointsRedeemedPaise?: number;
  taxPaise?: number;
  deliveryFeePaise?: number;
  handlingFeePaise?: number;
  convenienceFeePaise?: number;
  grandTotalPaise: number;
  transitions?: OrderTransition[];
  availableTransitions?: { from: OrderStatus; to: OrderStatus; actors: string[] }[];
  returns?: OrderReturn[];
  refunds?: OrderRefund[];
  openDispute?: { id: string } | null;
}

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; tone: StatusTone }> = {
  pending: { label: 'Awaiting payment', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'pending' },
  routing: { label: 'New · accept now', tone: 'warning' },
  accepted: { label: 'Accepted', tone: 'pending' },
  packed: { label: 'Packed', tone: 'pending' },
  picked_up: { label: 'Picked up', tone: 'pending' },
  out_for_delivery: { label: 'Out for delivery', tone: 'pending' },
  at_door: { label: 'At customer door', tone: 'pending' },
  undelivered: { label: 'Delivery failed', tone: 'warning' },
  returning_to_store: { label: 'Returning to store', tone: 'warning' },
  returned_to_store: { label: 'Awaiting verification', tone: 'warning' },
  delivered: { label: 'Delivered', tone: 'success' },
  closed: { label: 'Completed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  payment_failed: { label: 'Payment failed', tone: 'danger' },
};

export function orderStatusMeta(status: string): { label: string; tone: StatusTone } {
  return (
    ORDER_STATUS_META[status as OrderStatus] ?? {
      label: status.replace(/_/g, ' '),
      tone: 'neutral',
    }
  );
}

export const DELIVERY_LABEL: Record<DeliveryMethod, string> = {
  express: 'Express',
  standard: 'Standard',
  pickup: 'Store pickup',
  try_and_buy: 'Try & buy',
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  upi: 'UPI',
  card: 'Card',
  cod: 'Cash on delivery',
  wallet: 'Wallet',
  gift_card: 'Gift card',
};

export const ACTOR_LABEL: Record<string, string> = {
  consumer: 'Customer',
  retailer: 'Store',
  admin: 'Trendzo',
  delivery_agent: 'Delivery agent',
  system: 'System',
};

/** Statuses on the live board (polled) — everything still in motion. */
export const ACTIVE_STATUSES: OrderStatus[] = [
  'routing',
  'accepted',
  'packed',
  'picked_up',
  'out_for_delivery',
  'at_door',
  'undelivered',
  'returning_to_store',
  'returned_to_store',
];

/** Finished orders (history). */
export const DONE_STATUSES: OrderStatus[] = ['delivered', 'closed', 'cancelled', 'payment_failed'];

export type OrderTab = 'new' | 'preparing' | 'transit' | 'returns' | 'completed' | 'cancelled';

/** Mobile order tabs — the portal's board columns, condensed. */
export const ORDER_TABS: { key: OrderTab; label: string; statuses: OrderStatus[] }[] = [
  { key: 'new', label: 'New', statuses: ['routing'] },
  { key: 'preparing', label: 'To pack', statuses: ['accepted', 'packed'] },
  { key: 'transit', label: 'Shipped', statuses: ['picked_up', 'out_for_delivery', 'at_door', 'undelivered'] },
  { key: 'returns', label: 'Returns', statuses: ['returning_to_store', 'returned_to_store'] },
  { key: 'completed', label: 'Completed', statuses: ['delivered', 'closed'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled', 'payment_failed'] },
];

export const NEEDS_ATTENTION: OrderStatus[] = ['undelivered', 'returning_to_store', 'returned_to_store'];

/** Items kept / returned / refused at a try-and-buy door visit. */
export type DoorDecision = 'kept' | 'returned' | 'refused';
