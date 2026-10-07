/**
 * The store's returns queue (GET /retailer/returns, GET /retailer/returns/:id).
 * Two kinds: a door return (try-and-buy, the customer handed items back at the
 * door) and a standard return (opened after delivery). Money is integer paise.
 */
import type { StatusTone } from '../components/StatusChip';
import type { HeldItem, ReturnDecision } from './orders';

export type ReturnKind = 'door_return' | 'standard_return';
export type AgentDisposition = 'kept' | 'returned' | 'refused';

/** COD refund the store still owes the customer in cash. Only present while unpaid. */
export interface CashRefundDue {
  refundId: string;
  disbursementId: string;
  amountPaise: number;
}

/** GET /retailer/returns row. */
export interface ReturnRow {
  id: string;
  orderItemId: string;
  kind: ReturnKind | string;
  openedAt: string;
  reasonText: string | null;
  reasonCategory?: string | null;
  agentDisposition: AgentDisposition | string | null;
  storeDecision: ReturnDecision;
  storeDecidedAt?: string | null;
  /** null = the goods are not at the store yet (accepting would 409). */
  goodsReceivedAt?: string | null;
  verificationWindowExpiresAt: string | null;
  photos?: string[];
  consumerPhotos?: string[];
  storeRejectPhotos?: string[];
  orderItem: {
    id: string;
    orderId: string;
    listingNameSnap: string;
    attributesLabelSnap?: string | null;
    qty?: number;
    order: {
      id: string;
      consumerNameSnap?: string | null;
      deliveryMethod?: string;
      status?: string;
    };
  };
  /** Cash still owed to the customer on this order (COD refunds). */
  cashRefundDue?: CashRefundDue | null;
}

/** GET /retailer/returns/:id — the row plus the held items it created. */
export interface ReturnDetail extends ReturnRow {
  heldItems?: HeldItem[];
}

/** `GET /retailer/returns?decision=` — omit for every decision. */
export interface ReturnFilters {
  decision?: ReturnDecision;
  /** 1-200, server default 50. */
  limit?: number;
}

export const RETURN_DECISION_META: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: 'Awaiting verification', tone: 'warning' },
  accepted: { label: 'Accepted', tone: 'success' },
  rejected: { label: 'Declined', tone: 'danger' },
};

export function returnDecisionMeta(d: string): { label: string; tone: StatusTone } {
  return (
    RETURN_DECISION_META[d] ?? {
      label: d.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
      tone: 'neutral',
    }
  );
}

export const RETURN_KIND_LABEL: Record<string, string> = {
  door_return: 'Door return',
  standard_return: 'Standard return',
};

export const RETURN_REASON_LABEL: Record<string, string> = {
  damaged: 'Damaged',
  wrong_item: 'Wrong item',
  not_as_described: 'Not as described',
  doesnt_fit: "Doesn't fit",
  other: 'Other',
};

export const AGENT_DISPOSITION_LABEL: Record<string, string> = {
  kept: 'Customer kept it',
  returned: 'Returned by customer',
  refused: 'Refused by customer',
};

/**
 * Whether the store may accept this return yet. The server refuses an accept (409)
 * until the goods are physically at the store, so the app steers the store to
 * "mark received" first. `undefined` (an older server that does not send the
 * custody field) is treated as "ask the server".
 */
export function goodsAtStore(r: Pick<ReturnRow, 'goodsReceivedAt'>): boolean {
  return r.goodsReceivedAt !== null;
}
