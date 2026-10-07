import { create } from 'zustand';
import { resolveScan } from '../api/pos';
import { idempotencyKey } from '../api/request';
import { useAuth } from './auth';
import {
  PosBillLine,
  PosCustomerInput,
  PosLookupRow,
  PosQuoteRequest,
  PosSaleDetail,
} from '../types/pos';

export type DiscountMode = 'amount' | 'percent';

export interface CartLine {
  variantId: string;
  listingId?: string;
  name: string;
  brand?: string | null;
  attributesLabel: string;
  sku?: string | null;
  imageUrl?: string | null;
  /** Tax-inclusive selling price per unit. */
  unitPricePaise: number;
  qty: number;
  /** Stock the server reported when the line was added (a hint, not a block). */
  availableQty: number;
  discountMode: DiscountMode;
  /** Rupees when mode is 'amount', percent when 'percent'. */
  discountValue: number;
}

export interface RegisterCustomer {
  phone: string;
  name: string;
  gstin: string;
  /** "B2B — add GSTIN to invoice". */
  b2b: boolean;
}

const EMPTY_CUSTOMER: RegisterCustomer = { phone: '', name: '', gstin: '', b2b: false };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const lineGrossPaise = (l: CartLine) => l.unitPricePaise * l.qty;

/** Same rule as the web Register: ₹ typed in rupees, % of the line, clamped to the line. */
export function lineDiscountPaise(l: CartLine): number {
  const gross = lineGrossPaise(l);
  const v = Math.max(0, l.discountValue || 0);
  const raw = l.discountMode === 'percent' ? (gross * v) / 100 : v * 100;
  return clamp(Math.round(raw), 0, gross);
}

export const lineNetPaise = (l: CartLine) => lineGrossPaise(l) - lineDiscountPaise(l);

/** Bill-level discount, applied after line discounts and clamped to what's left. */
export function billDiscountPaise(lines: CartLine[], mode: DiscountMode, value: number): number {
  const net = lines.reduce((s, l) => s + lineNetPaise(l), 0);
  const v = Math.max(0, value || 0);
  const raw = mode === 'percent' ? (net * v) / 100 : v * 100;
  return clamp(Math.round(raw), 0, net);
}

export const billLines = (lines: CartLine[]): PosBillLine[] =>
  lines.map((l) => ({ variantId: l.variantId, qty: l.qty, lineDiscountPaise: lineDiscountPaise(l) }));

export function quoteRequest(
  lines: CartLine[],
  mode: DiscountMode,
  value: number,
): PosQuoteRequest {
  return {
    lines: billLines(lines),
    billDiscountPaise: billDiscountPaise(lines, mode, value),
    pricingMode: 'tax_inclusive',
  };
}

/** Walk-in = {}. GSTIN only travels on a B2B bill, upper-cased. */
export function customerInput(c: RegisterCustomer): PosCustomerInput {
  const out: PosCustomerInput = {};
  const phone = c.phone.replace(/\D/g, '');
  if (phone) out.phone = phone;
  if (c.name.trim()) out.name = c.name.trim();
  if (c.b2b && c.gstin.trim()) out.gstin = c.gstin.trim().toUpperCase();
  return out;
}

/**
 * What a held bill stores (lines, discounts, customer). Compared against
 * `resumedSignature` to tell whether a resumed bill has been edited since.
 */
export function billSignature(s: {
  lines: CartLine[];
  customer: RegisterCustomer;
  billDiscountMode: DiscountMode;
  billDiscountValue: number;
}): string {
  return JSON.stringify([
    quoteRequest(s.lines, s.billDiscountMode, s.billDiscountValue),
    customerInput(s.customer),
  ]);
}

interface RegisterState {
  lines: CartLine[];
  customer: RegisterCustomer;
  billDiscountMode: DiscountMode;
  billDiscountValue: number;
  /** The held bill this cart was resumed from (sent with the sale). */
  holdSaleId: string | null;
  /** billSignature() of the held bill as it was resumed. */
  resumedSignature: string | null;
  /** Stable per bill so a retried "complete" can't double-charge; new after reset. */
  billKey: string;
  addRow: (row: PosLookupRow) => void;
  /** Fresh lookup rows → current stock hint, price and thumbnail for matching lines. */
  syncRows: (rows: PosLookupRow[]) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  setLineDiscount: (variantId: string, mode: DiscountMode, value: number) => void;
  setBillDiscount: (mode: DiscountMode, value: number) => void;
  setCustomer: (patch: Partial<RegisterCustomer>) => void;
  loadHeld: (sale: PosSaleDetail) => void;
  reset: () => void;
}

const fresh = () => ({
  lines: [] as CartLine[],
  customer: EMPTY_CUSTOMER,
  billDiscountMode: 'amount' as DiscountMode,
  billDiscountValue: 0,
  holdSaleId: null as string | null,
  resumedSignature: null as string | null,
  billKey: idempotencyKey('possale'),
});

/**
 * The bill being rung up at the counter. In memory only: a bill that has to
 * wait is parked server-side with "Hold", and an in-progress cart must never
 * leak into the next account on this device.
 */
export const useRegister = create<RegisterState>()((set) => ({
  ...fresh(),
  addRow: (row) =>
    set((s) => {
      const existing = s.lines.find((l) => l.variantId === row.variantId);
      if (existing) {
        return {
          lines: s.lines.map((l) =>
            l.variantId === row.variantId
              ? { ...l, qty: l.qty + 1, availableQty: row.availableQty }
              : l,
          ),
        };
      }
      const line: CartLine = {
        variantId: row.variantId,
        listingId: row.listingId,
        name: row.name,
        brand: row.brand,
        attributesLabel: row.attributesLabel,
        sku: row.sku,
        imageUrl: row.imageUrl,
        unitPricePaise: row.pricePaise,
        qty: 1,
        availableQty: row.availableQty,
        discountMode: 'amount',
        discountValue: 0,
      };
      return { lines: [line, ...s.lines] };
    }),
  syncRows: (rows) =>
    set((s) => ({
      lines: s.lines.map((l) => {
        const row = rows.find((r) => r.variantId === l.variantId);
        if (!row) return l;
        return {
          ...l,
          availableQty: row.availableQty,
          unitPricePaise: row.pricePaise,
          imageUrl: l.imageUrl ?? row.imageUrl,
          sku: l.sku ?? row.sku,
        };
      }),
    })),
  setQty: (variantId, qty) =>
    set((s) => ({
      lines:
        qty <= 0
          ? s.lines.filter((l) => l.variantId !== variantId)
          : s.lines.map((l) => (l.variantId === variantId ? { ...l, qty } : l)),
    })),
  remove: (variantId) => set((s) => ({ lines: s.lines.filter((l) => l.variantId !== variantId) })),
  setLineDiscount: (variantId, mode, value) =>
    set((s) => ({
      lines: s.lines.map((l) =>
        l.variantId === variantId ? { ...l, discountMode: mode, discountValue: value } : l,
      ),
    })),
  setBillDiscount: (mode, value) => set({ billDiscountMode: mode, billDiscountValue: value }),
  setCustomer: (patch) => set((s) => ({ customer: { ...s.customer, ...patch } })),
  loadHeld: (sale) => {
    const next = {
      ...fresh(),
      holdSaleId: sale.id,
      lines: sale.items.map((it): CartLine => ({
        variantId: it.variantId,
        listingId: it.listingId,
        name: it.listingNameSnap,
        brand: it.brandSnap,
        attributesLabel: it.attributesLabelSnap,
        sku: it.skuSnap,
        imageUrl: null,
        unitPricePaise: it.unitMrpPaise,
        qty: it.qty,
        // Unknown until re-looked-up; the server still enforces stock at sale.
        availableQty: 9999,
        discountMode: 'amount',
        discountValue: (it.lineDiscountPaise || 0) / 100,
      })),
      customer: {
        phone: sale.customerPhoneSnap ?? '',
        name: sale.customerNameSnap ?? '',
        gstin: sale.customerGstinSnap ?? '',
        b2b: !!sale.customerGstinSnap,
      },
      billDiscountMode: 'amount' as DiscountMode,
      billDiscountValue: (sale.billDiscountPaise || 0) / 100,
    };
    set({ ...next, resumedSignature: billSignature(next) });
  },
  reset: () => set(fresh()),
}));

/**
 * Re-read stock (plus current price and thumbnail) for every line in the bill:
 * a resumed held bill doesn't know its stock, and a sale that bounced on stock
 * needs fresh numbers so "Only N left" shows on the right lines. Best-effort.
 */
export async function refreshCartStock(): Promise<void> {
  const ids = useRegister.getState().lines.map((l) => l.variantId);
  if (!ids.length) return;
  const settled = await Promise.allSettled(ids.map((id) => resolveScan(`cx:v:${id}`)));
  const rows = settled.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []));
  if (rows.length) useRegister.getState().syncRows(rows);
}

// A logout (or expired session) ends the bill too — the next account on this
// device must start from an empty counter.
useAuth.subscribe((s, prev) => {
  if (prev.token && !s.token) useRegister.getState().reset();
});
