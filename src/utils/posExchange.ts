/**
 * Pure money / selection logic for counter returns and exchanges. No React, no I/O.
 *
 * Mirrors the server (backend `createPosReturn` / `createPosExchange`) so the amounts the cashier
 * sees are the amounts the server will insist on:
 *   - the refund for a returned line is the original line's net (tax-inclusive, after discounts)
 *     pro-rated by quantity and rounded: round(net × qty / soldQty);
 *   - refund / collect tenders must add up to the amount due EXACTLY (else a 400);
 *   - an exchange settles only the difference, on ONE side: the customer pays (collect) when the new
 *     items cost more, the store pays back (refund) when the returned ones are worth more, and an even
 *     swap takes no tenders at all.
 */
import {
  PosExchangeNewLine,
  PosExchangeRequest,
  PosReturnLineInput,
  PosReturnRequest,
  PosSaleDetail,
  PosSaleItem,
  PosSettleTender,
  PosTenderMethod,
  TENDER_LABEL,
  TENDER_REFERENCE_MAX,
} from '../types/pos';
import { formatPaise, paiseToRupeeInput, parseRupeesToPaise } from './money';

// ---- Eligibility ----

/** A return / exchange can only be raised on a completed sale that isn't itself a return/exchange. */
export const canReturnAgainst = (sale: Pick<PosSaleDetail, 'status' | 'originalSaleId'>): boolean =>
  sale.status === 'completed' && !sale.originalSaleId;

// ---- Refund maths ----

/** Refund for `qty` of a sold line: the server's pro-rata of the line net, rounded to paise. */
export function lineRefundPaise(item: Pick<PosSaleItem, 'netLinePaise' | 'qty'>, qty: number): number {
  if (!item.qty || qty <= 0) return 0;
  return Math.round((item.netLinePaise * qty) / item.qty);
}

/** How many of each original line have already been handed back (keyed by original sale item id). */
export type QtyMap = Record<string, number>;

/** Sum return lines per original sale item. */
export function returnedQtyByItem(
  lines: { originalSaleItemId?: string | null; qty: number }[] | null | undefined,
): QtyMap {
  const out: QtyMap = {};
  for (const l of lines ?? []) {
    if (!l.originalSaleItemId) continue;
    out[l.originalSaleItemId] = (out[l.originalSaleItemId] ?? 0) + l.qty;
  }
  return out;
}

/**
 * Combine independent sources of "already returned" (what the server reports, what this device
 * recorded). They can describe the same returns, so take the larger figure per item rather than adding.
 */
export function mergeReturned(...maps: (QtyMap | null | undefined)[]): QtyMap {
  const out: QtyMap = {};
  for (const m of maps) {
    for (const [k, v] of Object.entries(m ?? {})) out[k] = Math.max(out[k] ?? 0, v);
  }
  return out;
}

/** Add freshly returned lines to a ledger, keeping only the `max` most recently touched items. */
export function addReturned(ledger: QtyMap, lines: PosReturnLineInput[], max = 800): QtyMap {
  const out: QtyMap = { ...ledger };
  for (const l of lines) {
    const prev = out[l.originalSaleItemId] ?? 0;
    delete out[l.originalSaleItemId]; // re-insert → most recent last
    out[l.originalSaleItemId] = prev + l.qty;
  }
  const keys = Object.keys(out);
  if (keys.length <= max) return out;
  const trimmed: QtyMap = {};
  for (const k of keys.slice(keys.length - max)) trimmed[k] = out[k] as number;
  return trimmed;
}

/** What can still be returned of a line: sold qty minus what's already gone back. */
export const remainingQty = (item: Pick<PosSaleItem, 'id' | 'qty'>, returned: QtyMap): number =>
  Math.max(0, item.qty - (returned[item.id] ?? 0));

// ---- Line selection (which original lines go back, and how many) ----

export interface ReturnPick {
  qty: number;
  /** Put the item back on the shelf (default true; off for damaged goods). */
  restock: boolean;
}
/** Selection by original sale item id. Missing / qty 0 = not returned. */
export type ReturnSelection = Record<string, ReturnPick>;

/** Set one line's quantity, clamped to 0…`max` (whole units); keeps its restock choice. */
export function setPickQty(sel: ReturnSelection, itemId: string, qty: number, max: number): ReturnSelection {
  const q = Math.max(0, Math.min(Math.max(0, Math.floor(max)), Math.floor(Number.isFinite(qty) ? qty : 0)));
  const prev = sel[itemId];
  return { ...sel, [itemId]: { qty: q, restock: prev?.restock ?? true } };
}

export function setPickRestock(sel: ReturnSelection, itemId: string, restock: boolean): ReturnSelection {
  const prev = sel[itemId];
  return { ...sel, [itemId]: { qty: prev?.qty ?? 0, restock } };
}

/** The chosen lines in the sale's own order, as the request body wants them. */
export function selectedLines(items: Pick<PosSaleItem, 'id'>[], sel: ReturnSelection): PosReturnLineInput[] {
  const out: PosReturnLineInput[] = [];
  for (const it of items) {
    const p = sel[it.id];
    if (p && p.qty > 0) out.push({ originalSaleItemId: it.id, qty: p.qty, restock: p.restock });
  }
  return out;
}

/** Total value of the chosen lines — the refund due (return) or the credit (exchange). */
export function returnValuePaise(items: Pick<PosSaleItem, 'id' | 'netLinePaise' | 'qty'>[], sel: ReturnSelection): number {
  return items.reduce((sum, it) => sum + lineRefundPaise(it, sel[it.id]?.qty ?? 0), 0);
}

/** First problem with the chosen lines, or null. */
export function validateSelection(
  items: Pick<PosSaleItem, 'id' | 'qty'>[],
  sel: ReturnSelection,
  returned: QtyMap,
): string | null {
  const lines = selectedLines(items, sel);
  if (lines.length === 0) return 'Choose at least one item to return';
  for (const l of lines) {
    const it = items.find((i) => i.id === l.originalSaleItemId);
    if (!it) return 'One of the chosen items isn’t on this sale';
    if (!Number.isInteger(l.qty) || l.qty > remainingQty(it, returned)) {
      return 'You can’t return more than was bought and not yet returned';
    }
  }
  return null;
}

// ---- Tender split (refund / collect legs that must add up to the amount due) ----

export interface TenderDraft {
  /** Stable React key. */
  key: string;
  method: PosTenderMethod;
  /** Typed rupees. Ignored on the LAST row, which always takes whatever is left. */
  amountText: string;
  /** Card slip / UPI id (card + UPI only). */
  reference: string;
}

const METHOD_ORDER: PosTenderMethod[] = ['cash', 'card', 'upi'];

let draftSeq = 0;
const nextKey = () => `t${++draftSeq}`;

export const newTenderDraft = (method: PosTenderMethod = 'cash'): TenderDraft => ({
  key: nextKey(),
  method,
  amountText: '',
  reference: '',
});

/** The method the customer paid with originally — where a refund goes by default. */
export function originalTenderMethod(sale: Pick<PosSaleDetail, 'payments'> | null | undefined): PosTenderMethod {
  return sale?.payments.find((p) => p.direction === 'collect')?.method ?? 'cash';
}

export interface ResolvedTenders {
  /** Amount of each row, in paise (same order as the rows). */
  amounts: number[];
  /** Due minus what the rows add up to (0 when it balances). */
  remainingPaise: number;
  /** First thing wrong with the split, or null when it can be submitted. */
  error: string | null;
}

/**
 * Work out each row's amount against what's due. Every row but the last is typed; the last one takes
 * the rest, so the rows always add up to `duePaise` unless the typed rows already overshoot.
 */
export function resolveTenders(rows: TenderDraft[], duePaise: number): ResolvedTenders {
  const due = Math.max(0, Math.round(duePaise));
  if (rows.length === 0) {
    return { amounts: [], remainingPaise: due, error: due > 0 ? 'Choose how to settle the amount' : null };
  }
  const amounts: number[] = [];
  let error: string | null = null;
  let typed = 0;
  for (let i = 0; i < rows.length - 1; i++) {
    const row = rows[i] as TenderDraft;
    const p = parseRupeesToPaise(row.amountText);
    if (p == null || p <= 0) {
      error ??= `Enter the ${TENDER_LABEL[row.method]} amount`;
      amounts.push(0);
      continue;
    }
    amounts.push(p);
    typed += p;
  }
  const last = due - typed;
  amounts.push(Math.max(0, last));
  if (!error && due > 0 && last < 0) error = 'Those amounts add up to more than the total';
  else if (!error && due > 0 && last === 0) {
    error = 'Those amounts already cover the total — remove a payment method';
  }
  if (!error) {
    const long = rows.find((r) => r.reference.trim().length > TENDER_REFERENCE_MAX);
    if (long) error = `Reference can be at most ${TENDER_REFERENCE_MAX} characters`;
  }
  const sum = amounts.reduce((s, a) => s + a, 0);
  return { amounts, remainingPaise: due - sum, error };
}

/**
 * Add a payment method to split the amount. The row that was "the rest" becomes a typed row holding
 * its current amount, so the new last row starts at zero until the cashier lowers an earlier amount.
 */
export function addTenderRow(rows: TenderDraft[], duePaise: number): TenderDraft[] {
  const { amounts } = resolveTenders(rows, duePaise);
  const frozen = rows.map((r, i) =>
    i === rows.length - 1 ? { ...r, amountText: paiseToRupeeInput(amounts[i] ?? 0) } : r,
  );
  const used = new Set(rows.map((r) => r.method));
  const method = METHOD_ORDER.find((m) => !used.has(m)) ?? 'cash';
  return [...frozen, newTenderDraft(method)];
}

export function removeTenderRow(rows: TenderDraft[], index: number): TenderDraft[] {
  if (rows.length <= 1) return rows;
  return rows.filter((_, i) => i !== index);
}

export function updateTenderRow(rows: TenderDraft[], index: number, patch: Partial<Omit<TenderDraft, 'key'>>): TenderDraft[] {
  return rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
}

/**
 * Request tenders for the rows. Empty when nothing is due and `minOne` is off (an even exchange).
 * A refund with nothing due (₹0 line) still needs one leg: the server requires ≥ 1 refund tender.
 */
export function tendersFrom(
  rows: TenderDraft[],
  duePaise: number,
  opts: { minOne?: boolean } = {},
): PosSettleTender[] {
  const due = Math.max(0, Math.round(duePaise));
  const { amounts, error } = resolveTenders(rows, due);
  if (error) return [];
  if (due === 0) {
    const first = rows[0];
    return opts.minOne && first ? [{ method: first.method, amountPaise: 0 }] : [];
  }
  const out: PosSettleTender[] = [];
  rows.forEach((r, i) => {
    const t: PosSettleTender = { method: r.method, amountPaise: amounts[i] ?? 0 };
    const ref = r.reference.trim();
    if (r.method !== 'cash' && ref) t.reference = ref.slice(0, TENDER_REFERENCE_MAX);
    out.push(t);
  });
  return out;
}

// ---- Exchange ----

export type Settlement =
  | { kind: 'collect'; amountPaise: number }
  | { kind: 'refund'; amountPaise: number }
  | { kind: 'even'; amountPaise: 0 };

/** New items minus returned items: > 0 the customer pays, < 0 the store pays back. */
export const exchangeNet = (newValuePaise: number, returnValuePaise: number): number =>
  newValuePaise - returnValuePaise;

/** Which single side of an exchange gets settled, and for how much. */
export function settlementFor(net: number): Settlement {
  if (net > 0) return { kind: 'collect', amountPaise: net };
  if (net < 0) return { kind: 'refund', amountPaise: -net };
  return { kind: 'even', amountPaise: 0 };
}

/** Headline for the settlement row ("Customer pays ₹120"). */
export function settlementLabel(s: Settlement): string {
  if (s.kind === 'collect') return `Customer pays ${formatPaise(s.amountPaise)}`;
  if (s.kind === 'refund') return `Refund ${formatPaise(s.amountPaise)}`;
  return 'Even exchange';
}

/** Merge duplicate variants (same variant added twice), dropping zero quantities. */
export function mergeNewLines(lines: PosExchangeNewLine[]): PosExchangeNewLine[] {
  const map = new Map<string, number>();
  for (const l of lines) map.set(l.variantId, (map.get(l.variantId) ?? 0) + l.qty);
  return [...map.entries()].filter(([, qty]) => qty > 0).map(([variantId, qty]) => ({ variantId, qty }));
}

const REASON_MAX = 240;
export const cleanReason = (s: string): string => s.trim().slice(0, REASON_MAX);

// ---- Request bodies ----

export function buildReturnRequest(input: {
  idempotencyKey: string;
  reason: string;
  items: PosSaleItem[];
  selection: ReturnSelection;
  rows: TenderDraft[];
}): PosReturnRequest {
  const lines = selectedLines(input.items, input.selection);
  const due = returnValuePaise(input.items, input.selection);
  return {
    idempotencyKey: input.idempotencyKey,
    reason: cleanReason(input.reason),
    lines,
    refundTenders: tendersFrom(input.rows, due, { minOne: true }),
  };
}

export function buildExchangeRequest(input: {
  idempotencyKey: string;
  reason: string;
  items: PosSaleItem[];
  selection: ReturnSelection;
  newLines: PosExchangeNewLine[];
  /** Server-quoted payable for `newLines`. */
  newValuePaise: number;
  rows: TenderDraft[];
}): PosExchangeRequest {
  const returnValue = returnValuePaise(input.items, input.selection);
  const settle = settlementFor(exchangeNet(input.newValuePaise, returnValue));
  const body: PosExchangeRequest = {
    idempotencyKey: input.idempotencyKey,
    reason: cleanReason(input.reason),
    returnLines: selectedLines(input.items, input.selection),
    newLines: mergeNewLines(input.newLines).map((l) => ({ variantId: l.variantId, qty: l.qty })),
    pricingMode: 'tax_inclusive',
  };
  // Exactly ONE side, or none for an even swap — the server rejects anything else.
  if (settle.kind === 'collect') body.collectTenders = tendersFrom(input.rows, settle.amountPaise);
  else if (settle.kind === 'refund') body.refundTenders = tendersFrom(input.rows, settle.amountPaise);
  return body;
}

/** First reason an exchange can't be submitted yet, or null when it's good to go. */
export function exchangeProblem(input: {
  items: Pick<PosSaleItem, 'id' | 'qty'>[];
  selection: ReturnSelection;
  returned: QtyMap;
  newLines: PosExchangeNewLine[];
  quoteReady: boolean;
  reason: string;
  settlement: Settlement;
  rows: TenderDraft[];
}): string | null {
  const sel = validateSelection(input.items, input.selection, input.returned);
  if (sel) return sel;
  if (mergeNewLines(input.newLines).length === 0) return 'Add the item(s) the customer is taking';
  if (!input.quoteReady) return 'Pricing the new items…';
  if (!cleanReason(input.reason)) return 'Add a reason';
  if (input.settlement.kind !== 'even') {
    const r = resolveTenders(input.rows, input.settlement.amountPaise);
    if (r.error) return r.error;
    if (r.remainingPaise !== 0) return 'The payment must add up to the amount due';
  }
  return null;
}

/** First reason a return can't be submitted yet, or null. */
export function returnProblem(input: {
  items: Pick<PosSaleItem, 'id' | 'qty' | 'netLinePaise'>[];
  selection: ReturnSelection;
  returned: QtyMap;
  reason: string;
  rows: TenderDraft[];
}): string | null {
  const sel = validateSelection(input.items, input.selection, input.returned);
  if (sel) return sel;
  if (!cleanReason(input.reason)) return 'Add a reason';
  const due = returnValuePaise(input.items, input.selection);
  if (due > 0) {
    const r = resolveTenders(input.rows, due);
    if (r.error) return r.error;
    if (r.remainingPaise !== 0) return 'The refund must add up to the amount due';
  }
  return null;
}
