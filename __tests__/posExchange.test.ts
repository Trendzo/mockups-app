/**
 * Counter returns / exchanges: the money has to be what the server insists on (refund = pro-rata of
 * the original line, tenders must add up EXACTLY, exchanges settle one side only).
 */
import {
  PosExchangeNewLine,
  PosSaleItem,
} from '../src/types/pos';
import {
  QtyMap,
  ReturnSelection,
  TenderDraft,
  addReturned,
  addTenderRow,
  buildExchangeRequest,
  buildReturnRequest,
  canReturnAgainst,
  cleanReason,
  exchangeNet,
  exchangeProblem,
  lineRefundPaise,
  mergeNewLines,
  mergeReturned,
  newTenderDraft,
  originalTenderMethod,
  remainingQty,
  removeTenderRow,
  resolveTenders,
  returnProblem,
  returnValuePaise,
  returnedQtyByItem,
  selectedLines,
  setPickQty,
  setPickRestock,
  settlementFor,
  settlementLabel,
  tendersFrom,
  updateTenderRow,
  validateSelection,
} from '../src/utils/posExchange';

function item(id: string, qty: number, netLinePaise: number, extra: Partial<PosSaleItem> = {}): PosSaleItem {
  return {
    id,
    variantId: `var_${id}`,
    listingId: `lst_${id}`,
    listingNameSnap: `Item ${id}`,
    brandSnap: null,
    attributesLabelSnap: 'M',
    skuSnap: null,
    hsnSnap: null,
    qty,
    unitMrpPaise: Math.round(netLinePaise / qty),
    lineDiscountPaise: 0,
    taxableValuePaise: Math.round(netLinePaise / 1.12),
    gstRateBp: 1200,
    gstPaise: netLinePaise - Math.round(netLinePaise / 1.12),
    netLinePaise,
    ...extra,
  };
}

/** A draft with the typed amount set (the LAST row's text is ignored — it takes the rest). */
const draft = (method: TenderDraft['method'], amountText = '', reference = ''): TenderDraft => ({
  ...newTenderDraft(method),
  amountText,
  reference,
});

const sum = (xs: { amountPaise: number }[]) => xs.reduce((s, t) => s + t.amountPaise, 0);

describe('refund maths (same pro-rata the server uses)', () => {
  it('refunds the original line net pro-rated by quantity, rounded to paise', () => {
    const it = item('a', 3, 1000_00);
    expect(lineRefundPaise(it, 1)).toBe(333_33);
    expect(lineRefundPaise(it, 2)).toBe(666_67);
    expect(lineRefundPaise(it, 3)).toBe(1000_00);
    expect(lineRefundPaise(it, 0)).toBe(0);
    // half-paise rounds up, exactly like Math.round on the server
    expect(lineRefundPaise(item('b', 2, 1001), 1)).toBe(501);
  });

  it('is zero for a bad quantity or an empty line instead of NaN', () => {
    expect(lineRefundPaise(item('a', 2, 500), -1)).toBe(0);
    expect(lineRefundPaise({ qty: 0, netLinePaise: 500 }, 1)).toBe(0);
  });

  it('sums the chosen lines (return value / refund due)', () => {
    const items = [item('a', 3, 1000_00), item('b', 1, 499_00)];
    const sel: ReturnSelection = { a: { qty: 2, restock: true }, b: { qty: 1, restock: false } };
    expect(returnValuePaise(items, sel)).toBe(666_67 + 499_00);
    expect(returnValuePaise(items, {})).toBe(0);
  });

  it('keeps the discount: refund follows what was PAID for the line, not its MRP', () => {
    // 2 × ₹500 with ₹100 off → net ₹900; one back = ₹450
    expect(lineRefundPaise(item('a', 2, 900_00, { lineDiscountPaise: 100_00 }), 1)).toBe(450_00);
  });
});

describe('what is still returnable', () => {
  const a = item('a', 3, 900);
  const b = item('b', 1, 400);

  it('subtracts what already went back', () => {
    expect(remainingQty(a, {})).toBe(3);
    expect(remainingQty(a, { a: 1 })).toBe(2);
    expect(remainingQty(a, { a: 3 })).toBe(0);
    expect(remainingQty(a, { a: 9 })).toBe(0); // never negative
  });

  it('sums return lines per original item, skipping lines without an item id', () => {
    expect(
      returnedQtyByItem([
        { originalSaleItemId: 'a', qty: 1 },
        { originalSaleItemId: 'a', qty: 1 },
        { originalSaleItemId: 'b', qty: 1 },
        { qty: 5 },
        { originalSaleItemId: null, qty: 2 },
      ]),
    ).toEqual({ a: 2, b: 1 });
    expect(returnedQtyByItem(undefined)).toEqual({});
  });

  it('merges sources by taking the larger figure (they may describe the same returns)', () => {
    expect(mergeReturned({ a: 1, b: 2 }, { a: 3 }, undefined, null)).toEqual({ a: 3, b: 2 });
  });

  it('records new returns on the ledger and trims it to the most recent items', () => {
    let ledger: QtyMap = {};
    ledger = addReturned(ledger, [{ originalSaleItemId: 'a', qty: 1 }]);
    ledger = addReturned(ledger, [{ originalSaleItemId: 'a', qty: 1 }, { originalSaleItemId: 'b', qty: 1 }]);
    expect(ledger).toEqual({ a: 2, b: 1 });

    let big: QtyMap = {};
    for (let i = 0; i < 5; i++) big = addReturned(big, [{ originalSaleItemId: `i${i}`, qty: 1 }], 3);
    expect(Object.keys(big)).toEqual(['i2', 'i3', 'i4']);
  });

  it('clamps a picked quantity to 0…remaining and keeps the restock choice', () => {
    let sel: ReturnSelection = {};
    sel = setPickQty(sel, 'a', 5, 2);
    expect(sel.a).toEqual({ qty: 2, restock: true });
    sel = setPickRestock(sel, 'a', false);
    sel = setPickQty(sel, 'a', -3, 2);
    expect(sel.a).toEqual({ qty: 0, restock: false });
    sel = setPickQty(sel, 'a', 1.9, 3);
    expect(sel.a?.qty).toBe(1);
    sel = setPickQty(sel, 'a', NaN, 3);
    expect(sel.a?.qty).toBe(0);
  });

  it('lists only chosen lines, in the sale order, with an explicit restock flag', () => {
    const sel: ReturnSelection = { b: { qty: 1, restock: false }, a: { qty: 2, restock: true } };
    expect(selectedLines([a, b], sel)).toEqual([
      { originalSaleItemId: 'a', qty: 2, restock: true },
      { originalSaleItemId: 'b', qty: 1, restock: false },
    ]);
    expect(selectedLines([a, b], { a: { qty: 0, restock: true } })).toEqual([]);
  });

  it('refuses nothing chosen, or more than is left to return', () => {
    expect(validateSelection([a, b], {}, {})).toMatch(/at least one/i);
    expect(validateSelection([a, b], { a: { qty: 3, restock: true } }, { a: 1 })).toMatch(/more than/i);
    expect(validateSelection([a, b], { a: { qty: 2, restock: true } }, { a: 1 })).toBeNull();
    expect(validateSelection([a], { zzz: { qty: 1, restock: true } }, {})).toMatch(/at least one/i);
  });

  it('only completed, non-return sales can be returned against', () => {
    expect(canReturnAgainst({ status: 'completed', originalSaleId: null })).toBe(true);
    expect(canReturnAgainst({ status: 'completed', originalSaleId: 'sale_1' })).toBe(false);
    expect(canReturnAgainst({ status: 'voided', originalSaleId: null })).toBe(false);
    expect(canReturnAgainst({ status: 'held', originalSaleId: undefined })).toBe(false);
  });
});

describe('tender split — legs must add up to the amount due exactly', () => {
  it('one method takes the whole amount', () => {
    const r = resolveTenders([draft('cash')], 1000_00);
    expect(r).toEqual({ amounts: [1000_00], remainingPaise: 0, error: null });
  });

  it('typed amounts first, the LAST method takes the rest', () => {
    const r = resolveTenders([draft('cash', '600'), draft('upi')], 1000_00);
    expect(r.amounts).toEqual([600_00, 400_00]);
    expect(r.remainingPaise).toBe(0);
    expect(r.error).toBeNull();
    const three = resolveTenders([draft('cash', '100'), draft('card', '250.50'), draft('upi')], 1000_00);
    expect(three.amounts).toEqual([100_00, 250_50, 649_50]);
  });

  it('rejects typed amounts that cover or exceed the total', () => {
    expect(resolveTenders([draft('cash', '1000'), draft('upi')], 1000_00).error).toMatch(/already cover/i);
    expect(resolveTenders([draft('cash', '1200'), draft('upi')], 1000_00).error).toMatch(/more than/i);
  });

  it('rejects a typed leg with no / zero / junk amount', () => {
    expect(resolveTenders([draft('cash', ''), draft('upi')], 1000_00).error).toMatch(/enter the cash amount/i);
    expect(resolveTenders([draft('card', '0'), draft('upi')], 1000_00).error).toMatch(/enter the card amount/i);
    expect(resolveTenders([draft('card', 'abc'), draft('upi')], 1000_00).error).toMatch(/enter the card amount/i);
  });

  it('rejects a reference longer than 120 characters', () => {
    expect(resolveTenders([draft('upi', '', 'x'.repeat(121))], 500_00).error).toMatch(/120/);
    expect(resolveTenders([draft('upi', '', 'x'.repeat(120))], 500_00).error).toBeNull();
  });

  it('needs at least one method when money is due', () => {
    expect(resolveTenders([], 500_00).error).toBeTruthy();
    expect(resolveTenders([], 0).error).toBeNull();
  });

  it('splitting freezes the old last row so the new one starts at zero', () => {
    const rows = addTenderRow([draft('cash')], 1000_00);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.amountText).toBe('1000');
    expect(rows[1]?.method).toBe('card'); // next unused method
    // lowering the first amount hands the difference to the last method
    const lowered = updateTenderRow(rows, 0, { amountText: '700' });
    expect(resolveTenders(lowered, 1000_00).amounts).toEqual([700_00, 300_00]);
    // …and until then the cashier is told to reduce it
    expect(resolveTenders(rows, 1000_00).error).toMatch(/already cover/i);
  });

  it('removing a method hands its share back to the last one; a single method cannot be removed', () => {
    const rows = [draft('cash', '300'), draft('card', '200'), draft('upi')];
    const fewer = removeTenderRow(rows, 1);
    expect(resolveTenders(fewer, 1000_00).amounts).toEqual([300_00, 700_00]);
    expect(removeTenderRow([draft('cash')], 0)).toHaveLength(1);
  });

  it('builds request tenders: cash carries no reference, card/UPI carry a trimmed one', () => {
    const rows = [draft('cash', '400', 'ignored'), draft('upi', '', '  UTR123  ')];
    const t = tendersFrom(rows, 1000_00);
    expect(t).toEqual([
      { method: 'cash', amountPaise: 400_00 },
      { method: 'upi', amountPaise: 600_00, reference: 'UTR123' },
    ]);
    expect(sum(t)).toBe(1000_00);
  });

  it('builds nothing from an invalid split', () => {
    expect(tendersFrom([draft('cash', '2000'), draft('upi')], 1000_00)).toEqual([]);
  });

  it('a fully-discounted return (₹0 due) still sends the one refund leg the server requires', () => {
    expect(tendersFrom([draft('cash')], 0, { minOne: true })).toEqual([{ method: 'cash', amountPaise: 0 }]);
    expect(tendersFrom([draft('cash')], 0)).toEqual([]);
  });

  it('refunds default to the way the customer paid', () => {
    const pay = (method: 'cash' | 'card' | 'upi', direction: 'collect' | 'refund') => ({
      id: 'p',
      method,
      direction,
      amountPaise: 1,
    });
    expect(originalTenderMethod({ payments: [pay('upi', 'collect'), pay('cash', 'collect')] })).toBe('upi');
    expect(originalTenderMethod({ payments: [pay('card', 'refund'), pay('cash', 'collect')] })).toBe('cash');
    expect(originalTenderMethod({ payments: [] })).toBe('cash');
    expect(originalTenderMethod(null)).toBe('cash');
  });
});

describe('return request', () => {
  const items = [item('a', 3, 1000_00), item('b', 1, 499_00)];
  const sel: ReturnSelection = { a: { qty: 2, restock: true }, b: { qty: 1, restock: false } };

  it('refund tenders add up to the refund due, with the idempotency key passed straight through', () => {
    const due = returnValuePaise(items, sel);
    const body = buildReturnRequest({
      idempotencyKey: 'posret-sale_1-abc123',
      reason: '  Wrong size  ',
      items,
      selection: sel,
      rows: [draft('cash', '500'), draft('upi', '', 'REF9')],
    });
    expect(body.idempotencyKey).toBe('posret-sale_1-abc123');
    expect(body.reason).toBe('Wrong size');
    expect(body.lines).toEqual([
      { originalSaleItemId: 'a', qty: 2, restock: true },
      { originalSaleItemId: 'b', qty: 1, restock: false },
    ]);
    expect(sum(body.refundTenders)).toBe(due);
    expect(body.refundTenders[1]).toEqual({ method: 'upi', amountPaise: due - 500_00, reference: 'REF9' });
  });

  it('is retry-safe: rebuilding the same request gives the identical body', () => {
    const build = () =>
      buildReturnRequest({ idempotencyKey: 'k-12345678', reason: 'r', items, selection: sel, rows: [draft('cash')] });
    expect(build()).toEqual(build());
  });

  it('clips an over-long reason to the server limit', () => {
    expect(cleanReason('x'.repeat(300))).toHaveLength(240);
  });

  it('reports the first problem, in the order the cashier fixes them', () => {
    const base = { items, selection: sel, returned: {} as QtyMap, reason: 'r', rows: [draft('cash')] };
    expect(returnProblem({ ...base, selection: {} })).toMatch(/at least one/i);
    expect(returnProblem({ ...base, returned: { a: 2 } })).toMatch(/more than/i);
    expect(returnProblem({ ...base, reason: '   ' })).toMatch(/reason/i);
    expect(returnProblem({ ...base, rows: [draft('cash', '10'), draft('upi', '', 'x'.repeat(200))] })).toBeTruthy();
    expect(returnProblem(base)).toBeNull();
  });
});

describe('exchange settlement — exactly one side', () => {
  it('works out the net and which side settles', () => {
    expect(exchangeNet(1500_00, 1000_00)).toBe(500_00);
    expect(settlementFor(500_00)).toEqual({ kind: 'collect', amountPaise: 500_00 });
    expect(settlementFor(-300_00)).toEqual({ kind: 'refund', amountPaise: 300_00 });
    expect(settlementFor(0)).toEqual({ kind: 'even', amountPaise: 0 });
  });

  it('labels the settlement for the cashier', () => {
    expect(settlementLabel({ kind: 'collect', amountPaise: 120_00 })).toBe('Customer pays ₹120');
    expect(settlementLabel({ kind: 'refund', amountPaise: 80_50 })).toBe('Refund ₹80.50');
    expect(settlementLabel({ kind: 'even', amountPaise: 0 })).toBe('Even exchange');
  });

  it('merges a variant added twice and drops zero quantities', () => {
    expect(
      mergeNewLines([
        { variantId: 'v1', qty: 1 },
        { variantId: 'v2', qty: 0 },
        { variantId: 'v1', qty: 2 },
      ]),
    ).toEqual([{ variantId: 'v1', qty: 3 }]);
  });

  const items = [item('a', 2, 1000_00)];
  const sel: ReturnSelection = { a: { qty: 1, restock: true } }; // credit ₹500
  const newLines: PosExchangeNewLine[] = [{ variantId: 'v9', qty: 1 }];
  const base = {
    idempotencyKey: 'posexc-sale_1-xyz98765',
    reason: 'Size swap',
    items,
    selection: sel,
    newLines,
  };

  it('customer owes → collect tenders ONLY, summing to the difference', () => {
    const body = buildExchangeRequest({
      ...base,
      newValuePaise: 800_00, // net +₹300
      rows: [draft('cash', '100'), draft('upi')],
    });
    expect(body.refundTenders).toBeUndefined();
    expect(sum(body.collectTenders ?? [])).toBe(300_00);
    expect(body.collectTenders).toEqual([
      { method: 'cash', amountPaise: 100_00 },
      { method: 'upi', amountPaise: 200_00 },
    ]);
    expect(body.returnLines).toEqual([{ originalSaleItemId: 'a', qty: 1, restock: true }]);
    expect(body.newLines).toEqual([{ variantId: 'v9', qty: 1 }]);
    expect(body.pricingMode).toBe('tax_inclusive');
    expect(body.idempotencyKey).toBe('posexc-sale_1-xyz98765');
  });

  it('store owes → refund tenders ONLY, summing to the difference', () => {
    const body = buildExchangeRequest({ ...base, newValuePaise: 350_00, rows: [draft('card', '', 'AUTH1')] });
    expect(body.collectTenders).toBeUndefined();
    expect(body.refundTenders).toEqual([{ method: 'card', amountPaise: 150_00, reference: 'AUTH1' }]);
  });

  it('even swap → no tenders on either side', () => {
    const body = buildExchangeRequest({ ...base, newValuePaise: 500_00, rows: [draft('cash')] });
    expect(body.collectTenders).toBeUndefined();
    expect(body.refundTenders).toBeUndefined();
    expect('collectTenders' in body).toBe(false);
    expect('refundTenders' in body).toBe(false);
  });

  it('says why an exchange cannot be submitted yet', () => {
    const ok = {
      items,
      selection: sel,
      returned: {} as QtyMap,
      newLines,
      quoteReady: true,
      reason: 'Size swap',
      settlement: settlementFor(300_00),
      rows: [draft('cash')],
    };
    expect(exchangeProblem({ ...ok, selection: {} })).toMatch(/at least one/i);
    expect(exchangeProblem({ ...ok, newLines: [] })).toMatch(/add the item/i);
    expect(exchangeProblem({ ...ok, quoteReady: false })).toMatch(/pricing/i);
    expect(exchangeProblem({ ...ok, reason: ' ' })).toMatch(/reason/i);
    expect(exchangeProblem({ ...ok, rows: [draft('cash', '900'), draft('upi')] })).toBeTruthy();
    expect(exchangeProblem(ok)).toBeNull();
    // an even swap needs no payment at all
    expect(exchangeProblem({ ...ok, settlement: settlementFor(0), rows: [] })).toBeNull();
  });

  it('cannot exchange more than is left to return', () => {
    expect(
      exchangeProblem({
        items,
        selection: { a: { qty: 2, restock: true } },
        returned: { a: 1 },
        newLines,
        quoteReady: true,
        reason: 'r',
        settlement: settlementFor(0),
        rows: [],
      }),
    ).toMatch(/more than/i);
  });
});
