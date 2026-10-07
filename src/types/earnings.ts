import type { StatusTone } from '../components/StatusChip';

/** Unsettled earnings + next payout. GET /retailer/payouts/upcoming. All paise. */
export interface UpcomingPayout {
  storeId: string;
  nextCycleDate: string; // ISO — next scheduled payout date
  payoutCadenceDays: number;
  outstandingPayable: number; // net owed right now
  grossPaise: number; // total sales in the window
  commissionPaise: number; // platform fee
  tcsPaise: number;
  heldPaise: number; // held back (disputes)
  pendingAdjustmentsPaise: number; // signed: credit +, debit −
  // Per-order contribution. NOTE the short keys (values are still paise).
  orderBreakdown: Array<{
    orderId: string;
    gross: number;
    commission: number;
    tcs: number;
    net: number;
  }>;
  orderCount: number;
}

export type EarlyDisbursementStatus = 'pending' | 'approved' | 'rejected';

/** GET /retailer/early-disbursement. */
export interface EarlyDisbursementRequest {
  id: string;
  storeId: string;
  storeName: string;
  amountPaise: number;
  reason: string;
  status: EarlyDisbursementStatus;
  requestedAt: string; // ISO
  decidedAt: string | null;
  decisionNote: string | null;
}

export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';

/** GET /retailer/payouts row and GET /retailer/payouts/:id (same shape). */
export interface PayoutRow {
  id: string;
  /** Server-formatted cycle label (e.g. "1–15 Aug 2025"). */
  period: string;
  status: PayoutStatus | string;
  /** Amount sent to the bank. */
  amountPaise: number;
  bankAccountMasked: string;
  /** Bank UTR once settled. */
  bankConfirmationRef: string | null;
  retryCount: number;
  initiatedAt: string | null;
  settledAt: string | null;
}

/** GET /retailer/payouts/:id/deductions — how gross became net. */
export interface PayoutDeductions {
  breakdown: {
    grossPaise: number;
    commissionPaise: number;
    commissionTaxPaise: number;
    tcsPaise: number;
    refundsHeldPaise: number;
    priorOverPayoutsPaise: number;
    disputeHoldPaise: number;
    /** Signed: credit +, debit −. */
    adjustmentsPaise: number;
    netPaise: number;
  };
  holds: {
    id: string;
    disputeId: string;
    amountPaise: number;
    reason: string;
    status: 'active' | 'released' | string;
  }[];
  adjustments: { id: string; direction: 'debit' | 'credit'; amountPaise: number; reason: string }[];
  recoveries: {
    id: string;
    refundId: string;
    orderId: string;
    refundedPaise: number;
    plannedDebitPaise: number;
    status: 'planned' | 'debited' | 'failed' | string;
  }[];
}

/** GET /retailer/fees — rates in basis points (100 bp = 1%). */
export interface StoreFees {
  platformFeeBp: number;
  payoutCadenceDays: number;
  gstRateBp: number;
  tcsRateBp: number;
}

/** Retailer-facing label + chip tone per payout status. */
export const PAYOUT_STATUS_META: Record<PayoutStatus, { label: string; tone: StatusTone }> = {
  paid: { label: 'Paid', tone: 'success' },
  processing: { label: 'Processing', tone: 'pending' },
  pending: { label: 'Scheduled', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
};

export function payoutStatusMeta(status: string): { label: string; tone: StatusTone } {
  return (
    PAYOUT_STATUS_META[status as PayoutStatus] ?? {
      label: String(status ?? '').replace(/_/g, ' ') || 'Unknown',
      tone: 'neutral',
    }
  );
}

/** "XXXXXX1234" → "•••• 1234"; null when the mask carries no digits. */
export function bankTail(masked?: string | null): string | null {
  const digits = (masked ?? '').replace(/\D/g, '');
  return digits ? `•••• ${digits.slice(-4)}` : null;
}
