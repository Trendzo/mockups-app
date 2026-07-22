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
