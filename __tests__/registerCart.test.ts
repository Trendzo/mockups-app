// The cart store pulls in the API client (native storage) — stub what it touches.
jest.mock('../src/api/pos', () => ({ resolveScan: jest.fn() }));
jest.mock('../src/api/request', () => ({ idempotencyKey: (p: string) => `${p}-test` }));
jest.mock('../src/store/auth', () => ({ useAuth: { subscribe: () => () => {} } }));

import {
  CartLine,
  billDiscountPaise,
  customerInput,
  lineDiscountPaise,
  quoteRequest,
  useRegister,
} from '../src/store/register';
import type { PosLookupRow } from '../src/types/pos';

function line(extra: Partial<CartLine> = {}): CartLine {
  return {
    variantId: 'var_1',
    name: 'Kurta',
    attributesLabel: 'M',
    unitPricePaise: 999_00,
    qty: 2,
    availableQty: 10,
    discountMode: 'amount',
    discountValue: 0,
    ...extra,
  };
}

const row = (variantId: string, pricePaise = 500_00): PosLookupRow => ({
  variantId,
  listingId: 'lst_1',
  name: 'Shirt',
  brand: null,
  attributesLabel: 'L',
  sku: 'SKU-1',
  barcode: null,
  hsn: null,
  pricePaise,
  compareAtPaise: null,
  availableQty: 3,
  imageUrl: null,
});

describe('counter discounts (same rules as the web register)', () => {
  it('takes ₹ discounts in rupees and % of the line, clamped to the line total', () => {
    expect(lineDiscountPaise(line({ discountValue: 100 }))).toBe(100_00);
    expect(lineDiscountPaise(line({ discountMode: 'percent', discountValue: 10 }))).toBe(199_80);
    // ₹5,000 off a ₹1,998 line can't exceed the line.
    expect(lineDiscountPaise(line({ discountValue: 5000 }))).toBe(1998_00);
    expect(lineDiscountPaise(line({ discountMode: 'percent', discountValue: 150 }))).toBe(1998_00);
    expect(lineDiscountPaise(line({ discountValue: -20 }))).toBe(0);
  });

  it('applies the bill discount after line discounts', () => {
    const lines = [line({ discountValue: 98 }), line({ variantId: 'var_2', unitPricePaise: 500_00, qty: 1 })];
    // Lines net ₹1,900 + ₹500 = ₹2,400.
    expect(billDiscountPaise(lines, 'percent', 10)).toBe(240_00);
    expect(billDiscountPaise(lines, 'amount', 9999)).toBe(2400_00);
    const q = quoteRequest(lines, 'amount', 100);
    expect(q).toEqual({
      lines: [
        { variantId: 'var_1', qty: 2, lineDiscountPaise: 98_00 },
        { variantId: 'var_2', qty: 1, lineDiscountPaise: 0 },
      ],
      billDiscountPaise: 100_00,
      pricingMode: 'tax_inclusive',
    });
  });
});

describe('customer on the bill', () => {
  it('sends {} for a walk-in and the GSTIN only on a B2B bill', () => {
    expect(customerInput({ phone: '', name: ' ', gstin: '', b2b: false })).toEqual({});
    expect(
      customerInput({ phone: '98765 43210', name: 'Asha', gstin: '27abcde1234f1z5', b2b: false }),
    ).toEqual({ phone: '9876543210', name: 'Asha' });
    expect(
      customerInput({ phone: '9876543210', name: 'Asha', gstin: '27abcde1234f1z5', b2b: true }),
    ).toEqual({ phone: '9876543210', name: 'Asha', gstin: '27ABCDE1234F1Z5' });
  });
});

describe('cart store', () => {
  beforeEach(() => useRegister.getState().reset());

  it('adds a scanned item once and bumps the quantity on a repeat scan', () => {
    const s = useRegister.getState();
    s.addRow(row('v1'));
    s.addRow(row('v1'));
    s.addRow(row('v2'));
    const lines = useRegister.getState().lines;
    expect(lines.map((l) => [l.variantId, l.qty])).toEqual([
      ['v2', 1],
      ['v1', 2],
    ]);
  });

  it('drops a line when its quantity reaches 0 and starts a fresh bill on reset', () => {
    const s = useRegister.getState();
    s.addRow(row('v1'));
    s.setQty('v1', 0);
    expect(useRegister.getState().lines).toHaveLength(0);
    s.addRow(row('v1'));
    s.setBillDiscount('percent', 5);
    s.reset();
    const after = useRegister.getState();
    expect(after.lines).toHaveLength(0);
    expect(after.billDiscountValue).toBe(0);
    expect(after.holdSaleId).toBeNull();
  });
});
