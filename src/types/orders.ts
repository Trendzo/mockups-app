/**
 * Online orders placed on the Trendzo consumer app, as the store sees them.
 * Mirrors the backend order state machine (same shapes the web portal reads).
 * Money is integer paise.
 */
import type { StatusTone } from '../components/StatusChip';
import type { IssueDecision, IssueStatus } from './issues';

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

/** Where one line of an order ended up (order_item_outcome). */
export type OrderItemOutcome =
  | 'pending_delivery'
  | 'delivered_kept'
  | 'at_door_kept'
  | 'at_door_returned'
  | 'at_door_refused'
  | 'at_door_return_rejected'
  | 'at_store_pending_verification'
  | 'store_accepted_return'
  | 'store_rejected_held'
  | 'held_collected_at_counter'
  | 'held_redelivered'
  | 'held_abandoned'
  | 'held_window_expired'
  | 'dispute_open'
  | 'dispute_resolved_refund'
  | 'dispute_resolved_fresh_delivery'
  | 'dispute_resolved_pickup'
  | 'dispute_resolved_no_refund'
  | 'cancelled';

/** Shown under an item once it has left the plain "waiting to be delivered" state. */
export const ITEM_OUTCOME_LABEL: Record<OrderItemOutcome, { label: string; tone: StatusTone } | null> = {
  pending_delivery: null,
  delivered_kept: { label: 'Delivered', tone: 'success' },
  at_door_kept: { label: 'Kept at the door', tone: 'success' },
  at_door_returned: { label: 'Returned at the door', tone: 'warning' },
  at_door_refused: { label: 'Refused at the door', tone: 'danger' },
  at_door_return_rejected: { label: 'Return refused by agent', tone: 'neutral' },
  at_store_pending_verification: { label: 'Awaiting your verification', tone: 'warning' },
  store_accepted_return: { label: 'Return accepted', tone: 'neutral' },
  store_rejected_held: { label: 'Return declined · held', tone: 'danger' },
  held_collected_at_counter: { label: 'Collected at counter', tone: 'neutral' },
  held_redelivered: { label: 'Re-delivered', tone: 'neutral' },
  held_abandoned: { label: 'Held · abandoned', tone: 'neutral' },
  held_window_expired: { label: 'Hold window expired', tone: 'neutral' },
  dispute_open: { label: 'In dispute', tone: 'warning' },
  dispute_resolved_refund: { label: 'Dispute: refunded', tone: 'neutral' },
  dispute_resolved_fresh_delivery: { label: 'Dispute: fresh delivery', tone: 'neutral' },
  dispute_resolved_pickup: { label: 'Dispute: pickup', tone: 'neutral' },
  dispute_resolved_no_refund: { label: 'Dispute: no refund', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

export function itemOutcomeMeta(outcome?: string | null): { label: string; tone: StatusTone } | null {
  if (!outcome) return null;
  const known = ITEM_OUTCOME_LABEL[outcome as OrderItemOutcome];
  if (known !== undefined) return known;
  return { label: outcome.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), tone: 'neutral' };
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
  /** unit price x qty, before any discount. */
  lineSubtotalPaise?: number;
  retailerPromoAllocPaise?: number;
  platformPromoAllocPaise?: number;
  couponAllocPaise?: number;
  pointsAllocPaise?: number;
  gstRateBp?: number;
  gstAllocPaise?: number;
  outcome?: OrderItemOutcome | string;
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
  orderItemId?: string;
  kind: 'door_return' | 'standard_return' | string;
  storeDecision: ReturnDecision;
  openedAt: string;
  reasonText?: string | null;
  reasonCategory?: string | null;
  agentDisposition?: string | null;
  storeDecidedAt?: string | null;
  /** Custody: null while the goods are not yet physically at the store. */
  goodsReceivedAt?: string | null;
  /** The store's decision deadline; the sweep auto-accepts + refunds after it. */
  verificationWindowExpiresAt?: string | null;
}

export type RefundDestination = 'original_tender' | 'wallet' | 'cash' | 'manual_payout' | string;

export interface RefundDisbursement {
  id: string;
  status: 'pending' | 'succeeded' | 'failed' | string;
  destination: RefundDestination;
  amountPaise: number;
}

export interface OrderRefund {
  id: string;
  status: 'pending' | 'processing' | 'succeeded' | 'partially_disbursed' | 'failed' | string;
  totalRefundPaise: number;
  reason?: string | null;
  createdAt?: string;
  disbursements?: RefundDisbursement[];
}

/** A returned item the store is holding for the customer (after a declined return). */
export interface HeldItem {
  id: string;
  returnId: string;
  status: 'holding' | 'expired' | 'resolved' | string;
  disposition?: string | null;
  holdingWindowExpiresAt: string;
}

/** A dispute tied to the order or one of its returns (open or decided). */
export interface OrderDispute {
  id: string;
  status: IssueStatus | string;
  subject: string;
  description: string;
  openedByActorType: string;
  createdAt: string;
  decision: IssueDecision | string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  returnId: string | null;
  /** Payout withheld from the store until the dispute is decided. */
  heldAmountPaise: number | null;
}

export interface DeliveryAttempt {
  id: string;
  attemptNumber: number;
  outcome: 'delivered' | 'undelivered' | 'returning_to_store' | string;
  notes?: string | null;
  proofPhotos?: string[];
  signatureUrl?: string | null;
  attemptedAt: string;
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

  // Bill. grandTotal = items − retailerPromo − platformPromo − coupon − points
  // + tax (cgst + sgst + igst) + delivery + handling + convenience. The wallet is a
  // payment tender (it pays part of the total), NOT a further discount.
  itemsSubtotalPaise?: number;
  retailerPromoPaise?: number;
  platformPromoPaise?: number;
  couponPaise?: number;
  walletAppliedPaise?: number;
  pointsRedeemedPaise?: number;
  taxPaise?: number;
  taxSplitKind?: 'intra_state' | 'inter_state' | string;
  cgstPaise?: number;
  sgstPaise?: number;
  igstPaise?: number;
  deliveryFeePaise?: number;
  handlingFeePaise?: number;
  convenienceFeePaise?: number;
  grandTotalPaise: number;

  /** The checkout this order belongs to. `siblingOrders` is only sent to admins. */
  group?: {
    id: string;
    status?: string;
    placedAt?: string;
    combinedTotalPaise?: number;
    siblingOrders?: OrderRow[];
  } | null;
  transitions?: OrderTransition[];
  deliveryAttempts?: DeliveryAttempt[];
  availableTransitions?: { from: OrderStatus; to: OrderStatus; actors: string[] }[];
  returns?: OrderReturn[];
  refunds?: OrderRefund[];
  heldItems?: HeldItem[];
  /** Every dispute on this order or its returns, newest first. */
  disputes?: OrderDispute[];
  /** The live dispute, if any — hides raise-dispute / request-refund while it is open. */
  openDispute?: { id: string; status?: string } | null;
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
