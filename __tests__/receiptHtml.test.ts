/**
 * The counter receipt printed from the phone: totals, GST lines, tenders and change must match the
 * sale, and the return / exchange documents the server mislabels must come out right.
 */
import { PosReceipt, PosSaleDetail } from '../src/types/pos';
import {
  adaptReceipt,
  buildReceiptHtml,
  escapeHtml,
  gstRateText,
  isExchangeDoc,
  rupeeAmount,
  rupeesText,
} from '../src/utils/receiptHtml';

const receipt = (extra: Partial<PosReceipt> = {}): PosReceipt => ({
  title: 'TAX INVOICE',
  storeName: 'Kaush Fashions',
  storeAddress: '12 MG Road, Indore',
  storeGstin: '23ABCDE1234F1Z5',
  invoiceNumber: 'INV-A-0042',
  saleId: 'sale_1',
  isReturn: false,
  dateTime: '07/10/2026, 06:42 pm',
  cashier: 'Asha',
  customerName: 'Ravi',
  customerPhone: '9876543210',
  customerGstin: null,
  lines: [
    { name: 'Kurta (M)', qty: 2, unitPaise: 499_00, gstRateBp: 1200, lineTotalPaise: 998_00 },
    { name: 'Scarf (Free)', qty: 1, unitPaise: 250_00, gstRateBp: 500, lineTotalPaise: 250_00 },
  ],
  itemsGrossPaise: 1248_00,
  discountPaise: 0,
  taxableValuePaise: 1112_37,
  cgstPaise: 67_82,
  sgstPaise: 67_81,
  igstPaise: 0,
  roundOffPaise: 0,
  payablePaise: 1248_00,
  tenders: [{ method: 'cash', amountPaise: 1248_00, changePaise: 52_00 }],
  changePaise: 52_00,
  headerText: null,
  footerText: 'Thank you! Please visit again.',
  showGstBreakup: true,
  charsPerLine: 48,
  ...extra,
});

describe('money formatting', () => {
  it('always shows two decimals with Indian grouping', () => {
    expect(rupeesText(0)).toBe('0.00');
    expect(rupeesText(5)).toBe('0.05');
    expect(rupeesText(1248_00)).toBe('1,248.00');
    expect(rupeesText(12_34_567_89)).toBe('12,34,567.89');
    expect(rupeesText(-4000)).toBe('-40.00');
    expect(rupeeAmount(1248_00)).toBe('₹1,248.00');
    expect(rupeeAmount(-40_00)).toBe('−₹40.00');
  });

  it('writes GST rates without trailing zeros', () => {
    expect(gstRateText(1200)).toBe('12%');
    expect(gstRateText(500)).toBe('5%');
    expect(gstRateText(250)).toBe('2.5%');
  });

  it('escapes HTML so a store or product name cannot break the page', () => {
    expect(escapeHtml(`A & B <b>"x"</b> 'y'`)).toBe('A &amp; B &lt;b&gt;&quot;x&quot;&lt;/b&gt; &#39;y&#39;');
    expect(escapeHtml(null)).toBe('');
  });
});

describe('receipt HTML (80mm layout)', () => {
  it('is a complete narrow-roll document', () => {
    const html = buildReceiptHtml(receipt());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('size: 80mm auto');
    expect(html).toContain('width: 72mm');
    expect(buildReceiptHtml(receipt(), { widthMm: 58 })).toContain('width: 58mm');
  });

  it('prints the store block, invoice meta and customer', () => {
    const html = buildReceiptHtml(receipt());
    expect(html).toContain('Kaush Fashions');
    expect(html).toContain('12 MG Road, Indore');
    expect(html).toContain('GSTIN: 23ABCDE1234F1Z5');
    expect(html).toContain('TAX INVOICE');
    expect(html).toContain('INV-A-0042');
    expect(html).toContain('07/10/2026, 06:42 pm');
    expect(html).toContain('Cashier');
    expect(html).toContain('Asha');
    expect(html).toContain('Ravi');
    expect(html).toContain('9876543210');
    expect(html).not.toContain('Cust GSTIN');
  });

  it('shows the customer GSTIN on a B2B bill', () => {
    const html = buildReceiptHtml(receipt({ customerGstin: '27AAAAA0000A1Z5' }));
    expect(html).toContain('Cust GSTIN');
    expect(html).toContain('27AAAAA0000A1Z5');
  });

  it('lists each line: quantity × rate, GST rate and the line total', () => {
    const html = buildReceiptHtml(receipt());
    expect(html).toContain('Kurta (M)');
    expect(html).toContain('2 × 499.00 · GST 12%');
    expect(html).toContain('998.00');
    expect(html).toContain('1 × 250.00 · GST 5%');
  });

  it('totals: subtotal, GST split (CGST + SGST), grand total', () => {
    const html = buildReceiptHtml(receipt());
    expect(html).toContain('Subtotal');
    expect(html).toContain('₹1,248.00');
    expect(html).toContain('Taxable');
    expect(html).toContain('₹1,112.37');
    expect(html).toContain('CGST');
    expect(html).toContain('₹67.82');
    expect(html).toContain('SGST');
    expect(html).toContain('₹67.81');
    expect(html).not.toContain('IGST');
    expect(html).toMatch(/TOTAL<\/td><td class="r">₹1,248\.00/);
  });

  it('inter-state: IGST instead of CGST + SGST', () => {
    const html = buildReceiptHtml(
      receipt({ cgstPaise: 0, sgstPaise: 0, igstPaise: 135_63, customerGstin: '27AAAAA0000A1Z5' }),
    );
    expect(html).toContain('IGST');
    expect(html).toContain('₹135.63');
    expect(html).not.toContain('CGST');
    expect(html).not.toContain('SGST');
  });

  it('hides the GST breakup when the store has it switched off', () => {
    const html = buildReceiptHtml(receipt({ showGstBreakup: false }));
    expect(html).not.toContain('Taxable');
    expect(html).not.toContain('CGST');
    expect(html).toContain('Subtotal');
  });

  it('shows a discount and a signed round-off', () => {
    const html = buildReceiptHtml(receipt({ discountPaise: 100_00, roundOffPaise: -40 }));
    expect(html).toContain('Discount');
    expect(html).toContain('− ₹100.00');
    expect(html).toContain('Round off');
    expect(html).toContain('− ₹0.40');
    expect(buildReceiptHtml(receipt({ roundOffPaise: 40 }))).toContain('+ ₹0.40');
    expect(buildReceiptHtml(receipt())).not.toContain('Round off');
  });

  it('tenders: method, reference, amount — and change on cash', () => {
    const html = buildReceiptHtml(
      receipt({
        tenders: [
          { method: 'cash', amountPaise: 700_00, changePaise: 0 },
          { method: 'upi', amountPaise: 548_00, changePaise: 0, reference: 'UTR 42' },
        ],
        changePaise: 0,
      }),
    );
    expect(html).toContain('CASH');
    expect(html).toContain('₹700.00');
    expect(html).toContain('UPI (UTR 42)');
    expect(html).toContain('₹548.00');
    expect(html).not.toContain('Change');

    const withChange = buildReceiptHtml(receipt());
    expect(withChange).toContain('Change');
    expect(withChange).toContain('₹52.00');
  });

  it('header / footer text from the store settings, escaped', () => {
    const html = buildReceiptHtml(receipt({ headerText: 'Sale <3\nDiwali', footerText: 'No returns\nafter 7 days' }));
    expect(html).toContain('Sale &lt;3');
    expect(html).toContain('Diwali');
    expect(html).toContain('No returns');
    expect(html).toContain('after 7 days');
    expect(buildReceiptHtml(receipt({ footerText: null }))).toContain('Thank you! Please visit again.');
  });

  it('escapes names and references', () => {
    const html = buildReceiptHtml(
      receipt({
        storeName: 'A & B <Traders>',
        lines: [{ name: '<img src=x>', qty: 1, unitPaise: 100, gstRateBp: 0, lineTotalPaise: 100 }],
      }),
    );
    expect(html).toContain('A &amp; B &lt;Traders&gt;');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toContain('<img');
  });

  it('stamps a voided sale', () => {
    expect(buildReceiptHtml(receipt(), { voided: true })).toContain('*** VOIDED ***');
    expect(buildReceiptHtml(receipt())).not.toContain('VOIDED');
  });

  it('a pure return prints as a credit note with positive amounts and a REFUND total', () => {
    const html = buildReceiptHtml(
      receipt({
        title: 'CREDIT NOTE',
        isReturn: true,
        lines: [{ name: 'Kurta (M)', qty: 1, unitPaise: 499_00, gstRateBp: 1200, lineTotalPaise: 499_00 }],
        itemsGrossPaise: -499_00,
        taxableValuePaise: -445_54,
        cgstPaise: -26_73,
        sgstPaise: -26_73,
        payablePaise: -499_00,
        tenders: [{ method: 'upi', amountPaise: 499_00, changePaise: 0 }],
        changePaise: 0,
      }),
    );
    expect(html).toContain('CREDIT NOTE');
    expect(html).toMatch(/REFUND<\/td><td class="r">₹499\.00/);
    expect(html).toContain('REFUND UPI');
    expect(html).not.toContain('−₹');
    expect(html).not.toContain('-499');
  });
});

describe('return / exchange documents', () => {
  const baseSale = (extra: Partial<PosSaleDetail> = {}): PosSaleDetail => ({
    id: 'sale_x',
    status: 'completed',
    originalSaleId: 'sale_1',
    completedAt: '2026-10-07T13:12:00.000Z',
    invoice: { invoiceNumber: 'INV-A-0043' },
    storeLegalNameSnap: 'Kaush Fashions',
    storeAddressSnap: '12 MG Road',
    storeGstinSnap: '23ABCDE1234F1Z5',
    customerNameSnap: null,
    customerPhoneSnap: null,
    customerGstinSnap: null,
    billDiscountPaise: 0,
    taxableValuePaise: 0,
    taxPaise: 0,
    cgstPaise: 0,
    sgstPaise: 0,
    roundOffPaise: 0,
    payablePaise: 0,
    changePaise: 0,
    items: [],
    payments: [],
    ...extra,
  });

  // Customer returned a ₹500 shirt and took a ₹800 jacket → pays ₹300 (server's net ledger row).
  const exchangeSale = baseSale({
    items: [
      {
        id: 'it_new',
        variantId: 'v9',
        listingId: 'l9',
        listingNameSnap: 'Jacket',
        brandSnap: null,
        attributesLabelSnap: 'L',
        skuSnap: null,
        hsnSnap: null,
        qty: 1,
        unitMrpPaise: 800_00,
        lineDiscountPaise: 0,
        taxableValuePaise: 714_29,
        gstRateBp: 1200,
        gstPaise: 85_71,
        netLinePaise: 800_00,
      },
    ],
    returnLines: [{ originalSaleItemId: 'it_old', qty: 1, refundPaise: 500_00, restock: true }],
    payablePaise: 300_00,
    changePaise: 0,
    payments: [{ id: 'p1', method: 'cash', amountPaise: 300_00, direction: 'collect', reference: null, changePaise: 0 }],
  });
  // What the server's receipt says for that document: a "credit note" with ledger-net numbers.
  const serverReceipt = receipt({
    title: 'CREDIT NOTE',
    isReturn: true,
    lines: [{ name: 'Jacket (L)', qty: 1, unitPaise: 800_00, gstRateBp: 1200, lineTotalPaise: 800_00 }],
    itemsGrossPaise: 300_00, // 800 − 500
    taxableValuePaise: 267_86,
    cgstPaise: 16_07,
    sgstPaise: 16_07,
    payablePaise: 300_00,
    tenders: [], // server only lists refund-direction tenders for an "isReturn" document
    changePaise: 0,
  });

  it('recognises an exchange (new items + handed-back lines) but not a pure return', () => {
    expect(isExchangeDoc(exchangeSale)).toBe(true);
    expect(isExchangeDoc(baseSale({ returnLines: [{ qty: 1, refundPaise: 100 }] }))).toBe(false);
    expect(isExchangeDoc(baseSale({ originalSaleId: null, items: exchangeSale.items }))).toBe(false);
  });

  it('exchange: new items less the returned credit, the real payments, not a "credit note"', () => {
    const adapted = adaptReceipt(serverReceipt, exchangeSale);
    expect(adapted.isReturn).toBe(false);
    expect(adapted.title).toBe('TAX INVOICE');
    expect(adapted.returnedCreditPaise).toBe(500_00);
    expect(adapted.showGstBreakup).toBe(false);
    expect(adapted.tenders).toEqual([
      { method: 'cash', amountPaise: 300_00, changePaise: 0, reference: null, direction: 'collect' },
    ]);

    // The printed numbers reconcile: subtotal (new items) − credit = net payable.
    expect(adapted.itemsGrossPaise - (adapted.returnedCreditPaise ?? 0) + adapted.roundOffPaise).toBe(
      adapted.payablePaise,
    );

    const html = buildReceiptHtml(adapted);
    expect(html).toContain('Jacket (L)');
    expect(html).toContain('Subtotal');
    expect(html).toContain('₹800.00');
    expect(html).toContain('Returned credit');
    expect(html).toContain('− ₹500.00');
    expect(html).toMatch(/NET PAYABLE<\/td><td class="r">₹300\.00/);
    expect(html).toContain('CASH');
    expect(html).not.toContain('CREDIT NOTE');
    expect(html).not.toContain('Taxable');
  });

  it('exchange that refunds the difference: NET REFUND and a REFUND tender', () => {
    const refunded = baseSale({
      ...exchangeSale,
      payablePaise: -120_00,
      payments: [
        { id: 'p1', method: 'upi', amountPaise: 120_00, direction: 'refund', reference: 'RF77', changePaise: 0 },
      ],
    });
    const adapted = adaptReceipt({ ...serverReceipt, payablePaise: -120_00, itemsGrossPaise: 380_00 }, refunded);
    const html = buildReceiptHtml(adapted);
    expect(html).toMatch(/NET REFUND<\/td><td class="r">₹120\.00/);
    expect(html).toContain('REFUND UPI (RF77)');
  });

  it('a pure return rebuilds its item lines from the original sale', () => {
    const original = baseSale({
      id: 'sale_1',
      originalSaleId: null,
      items: [
        {
          id: 'it_old',
          variantId: 'v1',
          listingId: 'l1',
          listingNameSnap: 'Shirt',
          brandSnap: null,
          attributesLabelSnap: 'M',
          skuSnap: null,
          hsnSnap: null,
          qty: 2,
          unitMrpPaise: 250_00,
          lineDiscountPaise: 0,
          taxableValuePaise: 446_43,
          gstRateBp: 1200,
          gstPaise: 53_57,
          netLinePaise: 500_00,
        },
      ],
    });
    const returnDoc = baseSale({ returnLines: [{ originalSaleItemId: 'it_old', qty: 1, refundPaise: 250_00, restock: true }] });
    const bare = receipt({ title: 'CREDIT NOTE', isReturn: true, lines: [], payablePaise: -250_00 });
    expect(adaptReceipt(bare, returnDoc).lines).toEqual([]); // no original loaded → untouched
    const adapted = adaptReceipt(bare, returnDoc, original);
    expect(adapted.lines).toEqual([
      { name: 'Shirt (M)', qty: 1, unitPaise: 250_00, gstRateBp: 1200, lineTotalPaise: 250_00 },
    ]);
    expect(buildReceiptHtml(adapted)).toContain('Shirt (M)');
  });

  it('leaves an ordinary sale receipt untouched', () => {
    const r = receipt();
    const sale = baseSale({ originalSaleId: null });
    expect(adaptReceipt(r, sale)).toBe(r);
  });
});
