import type { StatusTone } from '../components/StatusChip';
import { MONTHS, parseDate } from '../utils/format';

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
  /** The settled window the payout covers (ISO). Null if the server omits it. */
  cycleStart: string | null;
  cycleEnd: string | null;
  /** Sales in the window, before fees and deductions. */
  grossPaise: number;
  /** What the bank receives (gross minus fees, holds and adjustments). */
  netPaise: number;
  /** Amount sent to the bank (the server mirrors netPaise here). */
  amountPaise: number;
  bankAccountMasked: string;
  /** Bank UTR once settled. */
  bankConfirmationRef: string | null;
  retryCount: number;
  initiatedAt: string | null;
  settledAt: string | null;
  /** Hosted statement PDF for the cycle, once rendered. */
  statementUrl: string | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/**
 * Shape one /retailer/payouts row (or /payouts/:id). The server sends bigint money as
 * numbers but older builds sent strings, and a few fields are absent on in-flight rows,
 * so coerce once here and let the screens trust the type.
 */
export function toPayoutRow(raw: unknown): PayoutRow {
  const r = (raw ?? {}) as Record<string, unknown>;
  const net = num(r.netPaise ?? r.amountPaise);
  return {
    id: String(r.id ?? ''),
    period: typeof r.period === 'string' ? r.period : '',
    status: typeof r.status === 'string' ? r.status : 'pending',
    cycleStart: str(r.cycleStart),
    cycleEnd: str(r.cycleEnd),
    grossPaise: num(r.grossPaise),
    netPaise: net,
    amountPaise: r.amountPaise == null ? net : num(r.amountPaise),
    bankAccountMasked: typeof r.bankAccountMasked === 'string' ? r.bankAccountMasked : '',
    bankConfirmationRef: str(r.bankConfirmationRef),
    retryCount: num(r.retryCount),
    initiatedAt: str(r.initiatedAt),
    settledAt: str(r.settledAt),
    statementUrl: str(r.statementUrl),
  };
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

/**
 * "1 Aug – 15 Aug 2025" (year on the start only when the cycle crosses a year), built
 * from the cycle dates on the device; falls back to the server's `period` text.
 */
export function cycleLabel(p: Pick<PayoutRow, 'cycleStart' | 'cycleEnd' | 'period'>): string {
  const a = parseDate(p.cycleStart);
  const b = parseDate(p.cycleEnd);
  if (!a || !b) return p.period;
  const day = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const start = a.getFullYear() === b.getFullYear() ? day(a) : `${day(a)} ${a.getFullYear()}`;
  return `${start} – ${day(b)} ${b.getFullYear()}`;
}

/** Retailer-facing label + chip tone per early-payout request status. */
export const EARLY_STATUS_META: Record<EarlyDisbursementStatus, { label: string; tone: StatusTone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

export function earlyStatusMeta(status: string): { label: string; tone: StatusTone } {
  return (
    EARLY_STATUS_META[status as EarlyDisbursementStatus] ?? {
      label: String(status ?? '').replace(/_/g, ' ') || 'Unknown',
      tone: 'neutral',
    }
  );
}

// ---- Billing statements (GET /retailer/billing-statements) -------------------

export type BillingStatementStatus = 'open' | 'closing' | 'closed';

/**
 * One settlement cycle's summary. `id` is the payout id, so a statement and its
 * payout open each other. Money is paise.
 */
export interface BillingStatement {
  id: string;
  period: string;
  storeId: string;
  status: BillingStatementStatus | string;
  ordersCount: number;
  grossPaise: number;
  commissionPaise: number;
  /**
   * Tax on the platform fee. NOTE the server fills this from the payout's
   * commission tax (GST on commission) while the web portal labels it "TCS".
   */
  tcsPaise: number;
  refundsPaise: number;
  holdsPaise: number;
  adjustmentsPaise: number;
  netPaise: number;
  generatedAt: string | null;
}

export interface LiabilityBooking {
  id: string;
  issueId: string;
  description: string;
  amountPaise: number;
}

/** GET /retailer/billing-statements/:id. */
export interface BillingStatementDetail extends BillingStatement {
  liabilityBookings: LiabilityBooking[];
}

export function toBillingStatement(raw: unknown): BillingStatement {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id ?? ''),
    period: typeof r.period === 'string' ? r.period : '',
    storeId: typeof r.storeId === 'string' ? r.storeId : '',
    status: typeof r.status === 'string' ? r.status : 'open',
    ordersCount: num(r.ordersCount),
    grossPaise: num(r.grossPaise),
    commissionPaise: num(r.commissionPaise),
    tcsPaise: num(r.tcsPaise),
    refundsPaise: num(r.refundsPaise),
    holdsPaise: num(r.holdsPaise),
    adjustmentsPaise: num(r.adjustmentsPaise),
    netPaise: num(r.netPaise),
    generatedAt: str(r.generatedAt),
  };
}

export function toBillingStatementDetail(raw: unknown): BillingStatementDetail {
  const r = (raw ?? {}) as { liabilityBookings?: unknown };
  const bookings = Array.isArray(r.liabilityBookings) ? r.liabilityBookings : [];
  return {
    ...toBillingStatement(raw),
    liabilityBookings: bookings.map((b) => {
      const x = (b ?? {}) as Record<string, unknown>;
      return {
        id: String(x.id ?? ''),
        issueId: String(x.issueId ?? ''),
        description: typeof x.description === 'string' ? x.description : '',
        amountPaise: num(x.amountPaise),
      };
    }),
  };
}

export const BILLING_STATUS_META: Record<BillingStatementStatus, { label: string; tone: StatusTone }> = {
  open: { label: 'Open', tone: 'warning' },
  closing: { label: 'Closing', tone: 'pending' },
  closed: { label: 'Closed', tone: 'success' },
};

export function billingStatusMeta(status: string): { label: string; tone: StatusTone } {
  return (
    BILLING_STATUS_META[status as BillingStatementStatus] ?? {
      label: String(status ?? '').replace(/_/g, ' ') || 'Unknown',
      tone: 'neutral',
    }
  );
}

// ---- Invoices (GET /retailer/invoices) ---------------------------------------

/** Rows are always one of these; `all` is a query value only. */
export type InvoiceKind = 'invoice' | 'supplementary' | 'commission';
export type InvoiceKindQuery = InvoiceKind | 'all';
export type InvoiceStatus = 'draft' | 'issued' | 'credited';

export interface TaxInvoice {
  id: string;
  number: string;
  kind: InvoiceKind | string;
  status: InvoiceStatus | string;
  orderId: string;
  storeId: string;
  consumerName: string;
  issuedAt: string | null;
  totalPaise: number;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  tcsPaise: number;
  /** Hosted PDF, once rendered (null while it is still being generated). */
  pdfUrl: string | null;
  createdAt: string | null;
}

export interface CreditNote {
  id: string;
  creditNoteNumber: string;
  reason: string;
  grandTotalReversedPaise: number;
  pdfUrl: string | null;
  issuedAt: string | null;
}

/** GET /retailer/invoices/:id: the invoice plus its credit notes. */
export interface InvoiceDetail extends TaxInvoice {
  creditNotes: CreditNote[];
}

export function toTaxInvoice(raw: unknown): TaxInvoice {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id ?? ''),
    number: typeof r.number === 'string' ? r.number : '',
    kind: typeof r.kind === 'string' ? r.kind : 'invoice',
    status: typeof r.status === 'string' ? r.status : 'issued',
    orderId: typeof r.orderId === 'string' ? r.orderId : '',
    storeId: typeof r.storeId === 'string' ? r.storeId : '',
    consumerName: typeof r.consumerName === 'string' ? r.consumerName : '',
    issuedAt: str(r.issuedAt),
    totalPaise: num(r.totalPaise),
    taxableValuePaise: num(r.taxableValuePaise),
    cgstPaise: num(r.cgstPaise),
    sgstPaise: num(r.sgstPaise),
    igstPaise: num(r.igstPaise),
    tcsPaise: num(r.tcsPaise),
    pdfUrl: str(r.pdfUrl),
    createdAt: str(r.createdAt),
  };
}

export function toInvoiceDetail(raw: unknown): InvoiceDetail {
  const r = (raw ?? {}) as { creditNotes?: unknown };
  const notes = Array.isArray(r.creditNotes) ? r.creditNotes : [];
  return {
    ...toTaxInvoice(raw),
    creditNotes: notes.map((n) => {
      const x = (n ?? {}) as Record<string, unknown>;
      return {
        id: String(x.id ?? ''),
        creditNoteNumber: typeof x.creditNoteNumber === 'string' ? x.creditNoteNumber : '',
        reason: typeof x.reason === 'string' ? x.reason : '',
        grandTotalReversedPaise: num(x.grandTotalReversedPaise),
        pdfUrl: str(x.pdfUrl),
        issuedAt: str(x.issuedAt),
      };
    }),
  };
}

export const INVOICE_KIND_META: Record<InvoiceKind, { label: string; tone: StatusTone }> = {
  invoice: { label: 'Tax invoice', tone: 'pending' },
  supplementary: { label: 'Supplementary', tone: 'warning' },
  commission: { label: 'Commission', tone: 'neutral' },
};

export function invoiceKindMeta(kind: string): { label: string; tone: StatusTone } {
  return (
    INVOICE_KIND_META[kind as InvoiceKind] ?? {
      label: String(kind ?? '').replace(/_/g, ' ') || 'Invoice',
      tone: 'neutral',
    }
  );
}

/** Total GST (CGST + SGST + IGST) on an invoice. */
export const invoiceGstPaise = (i: Pick<TaxInvoice, 'cgstPaise' | 'sgstPaise' | 'igstPaise'>) =>
  i.cgstPaise + i.sgstPaise + i.igstPaise;
