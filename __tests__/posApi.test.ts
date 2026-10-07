/**
 * Request shaping for the counter API: the exact paths / bodies sent for returns, exchanges, receipts,
 * held-bill discard and the sale body (customer GSTIN, tender reference). The HTTP client is mocked.
 */
jest.mock('../src/api/client', () => {
  const http = { get: jest.fn(), post: jest.fn(), delete: jest.fn() };
  return {
    http,
    unwrapEnvelope: (payload: unknown) =>
      payload && typeof payload === 'object' && 'data' in (payload as object)
        ? (payload as { data: unknown }).data
        : payload,
    getJson: jest.fn(),
    postJson: jest.fn(),
  };
});
// request.ts normalises errors through the auth client (native storage + stores) — pass them through.
jest.mock('../src/api/auth', () => ({ normalizeAuthError: (e: unknown) => e }));
jest.mock('../src/store/auth', () => ({
  useAuth: { getState: () => ({ token: null }), subscribe: () => () => {} },
}));

import { http } from '../src/api/client';
import {
  createSale,
  discardHeldBill,
  exchangeSale,
  getSaleInvoice,
  getSaleReceipt,
  getSaleReceiptText,
  isDiscardUnsupported,
  quoteBill,
  returnSale,
} from '../src/api/pos';
import { billLines, customerInput, quoteRequest, CartLine } from '../src/store/register';
import { PosExchangeRequest, PosReturnRequest, PosTender } from '../src/types/pos';

const h = http as unknown as { get: jest.Mock; post: jest.Mock; delete: jest.Mock };
const ok = (data: unknown) => ({ data: { success: true, data } });

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
  h.delete.mockReset();
});

describe('returns', () => {
  const body: PosReturnRequest = {
    idempotencyKey: 'posret-sale_1-abcdef12',
    reason: 'Wrong size',
    lines: [{ originalSaleItemId: 'psi_1', qty: 1, restock: false }],
    refundTenders: [{ method: 'upi', amountPaise: 499_00, reference: 'UTR9' }],
  };

  it('POSTs the return to /sales/:id/returns exactly as built and unwraps the reply', async () => {
    h.post.mockResolvedValue(ok({ returnSaleId: 'sale_r1', refundPaise: 499_00, creditNoteId: 'cn_1' }));
    const res = await returnSale('sale_1', body);
    expect(h.post).toHaveBeenCalledTimes(1);
    expect(h.post).toHaveBeenCalledWith('/retailer/pos/sales/sale_1/returns', body);
    expect(res).toEqual({ returnSaleId: 'sale_r1', refundPaise: 499_00, creditNoteId: 'cn_1' });
  });

  it('url-encodes the sale id', async () => {
    h.post.mockResolvedValue(ok({}));
    await returnSale('a/b c', body);
    expect(h.post.mock.calls[0][0]).toBe('/retailer/pos/sales/a%2Fb%20c/returns');
  });

  it('a retry sends the SAME idempotency key (so a dropped reply can never refund twice)', async () => {
    h.post.mockRejectedValueOnce({ code: 'unreachable', message: 'offline' });
    h.post.mockResolvedValueOnce(ok({ returnSaleId: 'sale_r1', refundPaise: -499_00, creditNoteId: null }));
    await expect(returnSale('sale_1', body)).rejects.toMatchObject({ code: 'unreachable' });
    const retry = await returnSale('sale_1', body);
    expect(h.post.mock.calls[0][1].idempotencyKey).toBe(h.post.mock.calls[1][1].idempotencyKey);
    // the server echoes the stored (negative) ledger value on an idempotent replay
    expect(Math.abs(retry.refundPaise)).toBe(499_00);
  });

  it('surfaces a refused refund (tenders ≠ refund due) as the server error', async () => {
    h.post.mockRejectedValue({ code: 'validation_error', message: 'Refund tenders (1) must equal the refund due (2)', status: 400 });
    await expect(returnSale('sale_1', body)).rejects.toMatchObject({ status: 400 });
  });
});

describe('exchanges', () => {
  it('POSTs the exchange with ONE settlement side', async () => {
    const collect: PosExchangeRequest = {
      idempotencyKey: 'posexc-sale_1-abcdef12',
      reason: 'Size swap',
      returnLines: [{ originalSaleItemId: 'psi_1', qty: 1, restock: true }],
      newLines: [{ variantId: 'var_9', qty: 1 }],
      collectTenders: [{ method: 'cash', amountPaise: 300_00 }],
      pricingMode: 'tax_inclusive',
    };
    h.post.mockResolvedValue(
      ok({ exchangeSaleId: 'sale_x', newInvoiceId: 'inv_2', newInvoiceNumber: 'INV-2', returnRefundPaise: 500_00, newPayablePaise: 800_00, netPaise: 300_00, creditNoteId: 'cn_2' }),
    );
    const res = await exchangeSale('sale_1', collect);
    expect(h.post).toHaveBeenCalledWith('/retailer/pos/sales/sale_1/exchange', collect);
    expect(h.post.mock.calls[0][1]).not.toHaveProperty('refundTenders');
    expect(res.exchangeSaleId).toBe('sale_x');
    expect(res.netPaise).toBe(300_00);
  });
});

describe('receipts and invoices', () => {
  it('fetches the JSON receipt', async () => {
    const receipt = { title: 'TAX INVOICE', lines: [] };
    h.get.mockResolvedValue(ok(receipt));
    expect(await getSaleReceipt('sale_1')).toEqual(receipt);
    expect(h.get).toHaveBeenCalledWith('/retailer/pos/sales/sale_1/receipt', { params: { format: 'json' } });
  });

  it('fetches the text receipt and returns just the text', async () => {
    h.get.mockResolvedValue(ok({ text: 'STORE\n---' }));
    expect(await getSaleReceiptText('sale_1')).toBe('STORE\n---');
    expect(h.get).toHaveBeenCalledWith('/retailer/pos/sales/sale_1/receipt', { params: { format: 'text' } });
  });

  it('fetches the invoice link', async () => {
    h.get.mockResolvedValue(ok({ id: 'inv_1', number: 'INV-1', pdfUrl: 'https://cdn.example/INV-1.pdf' }));
    expect(await getSaleInvoice('sale_1')).toEqual({ id: 'inv_1', number: 'INV-1', pdfUrl: 'https://cdn.example/INV-1.pdf' });
    expect(h.get).toHaveBeenCalledWith('/retailer/pos/sales/sale_1/invoice');
  });
});

describe('held-bill discard', () => {
  it('DELETEs the held sale', async () => {
    h.delete.mockResolvedValue(ok({ ok: true }));
    await discardHeldBill('sale_h1');
    expect(h.delete).toHaveBeenCalledWith('/retailer/pos/sales/sale_h1');
  });

  it('is unsupported when the server has no such route (404 "Route …" or 405), not when the bill is just gone', () => {
    expect(isDiscardUnsupported({ status: 405, message: 'Method Not Allowed' })).toBe(true);
    expect(
      isDiscardUnsupported({ status: 404, code: 'not_found', message: 'Route DELETE:/api/v1/retailer/pos/sales/x not found' }),
    ).toBe(true);
    expect(isDiscardUnsupported({ status: 404, code: 'not_found', message: 'Sale not found' })).toBe(false);
    expect(isDiscardUnsupported({ status: 403, message: 'Forbidden' })).toBe(false);
    expect(isDiscardUnsupported({ status: 500, message: 'Route broke' })).toBe(false);
    expect(isDiscardUnsupported(null)).toBe(false);
    expect(isDiscardUnsupported(undefined)).toBe(false);
  });
});

describe('the sale body from the register', () => {
  const lines: CartLine[] = [
    {
      variantId: 'var_1',
      name: 'Kurta',
      attributesLabel: 'M',
      unitPricePaise: 499_00,
      qty: 2,
      availableQty: 5,
      discountMode: 'amount',
      discountValue: 0,
    },
  ];

  it('carries the customer GSTIN (upper-cased) and each tender reference', async () => {
    h.post.mockResolvedValue(ok({ saleId: 'sale_1', invoiceNumber: 'INV-1', payablePaise: 998_00, changePaise: 0, alreadyExisted: false }));
    const tenders: PosTender[] = [
      { method: 'cash', amountPaise: 500_00, tenderedPaise: 500_00 },
      { method: 'upi', amountPaise: 498_00, tenderedPaise: 498_00, reference: 'UTR42' },
    ];
    await createSale({
      idempotencyKey: 'possale-test',
      customer: customerInput({ phone: '98765 43210', name: 'Ravi', gstin: ' 27aaaaa0000a1z5 ', b2b: true }),
      pricingMode: 'tax_inclusive',
      billDiscountPaise: 0,
      lines: billLines(lines),
      tenders,
    });
    const sent = h.post.mock.calls[0][1];
    expect(h.post.mock.calls[0][0]).toBe('/retailer/pos/sales');
    expect(sent.customer).toEqual({ phone: '9876543210', name: 'Ravi', gstin: '27AAAAA0000A1Z5' });
    expect(sent.tenders[0]).not.toHaveProperty('reference');
    expect(sent.tenders[1]).toEqual({ method: 'upi', amountPaise: 498_00, tenderedPaise: 498_00, reference: 'UTR42' });
    expect(sent.lines).toEqual([{ variantId: 'var_1', qty: 2, lineDiscountPaise: 0 }]);
  });

  it('keeps the GSTIN off the bill unless B2B is on', () => {
    expect(customerInput({ phone: '', name: '', gstin: '27AAAAA0000A1Z5', b2b: false })).toEqual({});
  });

  it('the price quote is requested WITHOUT the customer (the server prices it intra-state)', async () => {
    h.post.mockResolvedValue(ok({ payablePaise: 998_00 }));
    await quoteBill(quoteRequest(lines, 'amount', 0));
    expect(h.post).toHaveBeenCalledWith('/retailer/pos/quote', {
      lines: [{ variantId: 'var_1', qty: 2, lineDiscountPaise: 0 }],
      billDiscountPaise: 0,
      pricingMode: 'tax_inclusive',
    });
    expect(h.post.mock.calls[0][1]).not.toHaveProperty('customer');
  });
});
