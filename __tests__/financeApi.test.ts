// API-module request shaping with the HTTP client mocked.
const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('../src/api/client', () => ({
  http: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) },
  // Same unwrap as the real client: { success, data } -> data.
  unwrapEnvelope: (p: unknown) =>
    p && typeof p === 'object' && 'data' in (p as object) ? (p as { data: unknown }).data : p,
  getJson: jest.fn(),
  postJson: jest.fn(),
}));

// catalogManagement re-exports the image upload (native compressor); not exercised here.
jest.mock('../src/api/catalog', () => ({ uploadImage: jest.fn() }));
// invoices.ts also holds the PDF helpers (native blob-util); not exercised here.
jest.mock('react-native-blob-util', () => ({ __esModule: true, default: {} }));

import {
  getBillingStatement,
  getPayout,
  listBillingStatements,
  listPayouts,
} from '../src/api/earnings';
import { getInvoice, listInvoices } from '../src/api/invoices';
import {
  adjustVariantStock,
  getDeadStock,
  getStockAdjustments,
  shapeDeadStock,
} from '../src/api/catalogManagement';
import {
  applyInventoryImport,
  dryRunInventoryImport,
  fetchInventoryTemplate,
} from '../src/api/inventoryImport';
import {
  billingStatusMeta,
  cycleLabel,
  earlyStatusMeta,
  invoiceGstPaise,
  invoiceKindMeta,
  toPayoutRow,
} from '../src/types/earnings';

const env = (data: unknown) => Promise.resolve({ data: { success: true, data } });

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

// What the server really sends for one payout (shapePayoutRow in settlement.controller).
const SERVER_PAYOUT = {
  id: 'pay_1',
  storeId: 'str_1',
  period: 'Aug 1–Aug 15, 2025',
  cycleStart: '2025-08-01T00:00:00.000Z',
  cycleEnd: '2025-08-15T23:59:59.000Z',
  grossPaise: 1_250_000,
  commissionPaise: 150_000,
  commissionTaxPaise: 27_000,
  refundsHeldPaise: 0,
  adjustmentsPaise: 0,
  amountPaise: 1_073_000,
  netPaise: 1_073_000,
  status: 'paid',
  bankAccountMasked: '•••• 4321',
  bankConfirmationRef: 'UTR123',
  retryCount: 0,
  initiatedAt: '2025-08-16T04:00:00.000Z',
  settledAt: '2025-08-16T09:00:00.000Z',
  statementUrl: 'https://cdn.example/stmt.pdf',
  createdAt: '2025-08-16T03:00:00.000Z',
};

describe('PayoutRow mapping', () => {
  it('keeps the cycle, gross, net and statement link the screens used to drop', () => {
    expect(toPayoutRow(SERVER_PAYOUT)).toEqual({
      id: 'pay_1',
      period: 'Aug 1–Aug 15, 2025',
      status: 'paid',
      cycleStart: '2025-08-01T00:00:00.000Z',
      cycleEnd: '2025-08-15T23:59:59.000Z',
      grossPaise: 1_250_000,
      netPaise: 1_073_000,
      amountPaise: 1_073_000,
      bankAccountMasked: '•••• 4321',
      bankConfirmationRef: 'UTR123',
      retryCount: 0,
      initiatedAt: '2025-08-16T04:00:00.000Z',
      settledAt: '2025-08-16T09:00:00.000Z',
      statementUrl: 'https://cdn.example/stmt.pdf',
    });
  });

  it('coerces string money and fills holes without throwing', () => {
    const r = toPayoutRow({ id: 'p', grossPaise: '500', netPaise: '400', statementUrl: '' });
    expect(r.grossPaise).toBe(500);
    expect(r.netPaise).toBe(400);
    expect(r.amountPaise).toBe(400);
    expect(r.statementUrl).toBeNull();
    expect(r.cycleStart).toBeNull();
    expect(r.bankConfirmationRef).toBeNull();
    expect(r.status).toBe('pending');
    expect(toPayoutRow(null).id).toBe('');
  });

  it('falls back to netPaise for an amount-less row and to amountPaise for a net-less one', () => {
    expect(toPayoutRow({ id: 'a', netPaise: 700 }).amountPaise).toBe(700);
    expect(toPayoutRow({ id: 'b', amountPaise: 900 }).netPaise).toBe(900);
  });

  it('labels the cycle from its dates, or falls back to the server text', () => {
    const label = cycleLabel({
      cycleStart: '2025-08-01T10:00:00.000Z',
      cycleEnd: '2025-08-15T10:00:00.000Z',
      period: 'x',
    });
    expect(label).toBe('1 Aug – 15 Aug 2025');
    expect(
      cycleLabel({ cycleStart: '2024-12-20T10:00:00.000Z', cycleEnd: '2025-01-05T10:00:00.000Z', period: 'x' }),
    ).toBe('20 Dec 2024 – 5 Jan 2025');
    expect(cycleLabel({ cycleStart: null, cycleEnd: null, period: 'Aug 1–15' })).toBe('Aug 1–15');
  });
});

describe('payouts API', () => {
  it('maps every row of /retailer/payouts, whether bare or wrapped', async () => {
    mockGet.mockReturnValueOnce(env([SERVER_PAYOUT]));
    const rows = await listPayouts();
    expect(mockGet).toHaveBeenCalledWith('/retailer/payouts');
    expect(rows[0].netPaise).toBe(1_073_000);

    mockGet.mockReturnValueOnce(env({ rows: [SERVER_PAYOUT] }));
    expect(await listPayouts()).toHaveLength(1);
    mockGet.mockReturnValueOnce(env(null));
    expect(await listPayouts()).toEqual([]);
  });

  it('maps one payout', async () => {
    mockGet.mockReturnValueOnce(env({ ...SERVER_PAYOUT, deductions: [] }));
    const p = await getPayout('pay 1');
    expect(mockGet).toHaveBeenCalledWith('/retailer/payouts/pay%201');
    expect(p.cycleEnd).toBe('2025-08-15T23:59:59.000Z');
  });
});

describe('billing statements API', () => {
  const STATEMENT = {
    id: 'pay_1',
    period: 'Aug 1–Aug 15, 2025',
    storeId: 'str_1',
    status: 'closed',
    ordersCount: 42,
    grossPaise: 1_250_000,
    commissionPaise: 150_000,
    tcsPaise: 27_000,
    refundsPaise: 10_000,
    holdsPaise: 0,
    adjustmentsPaise: -5_000,
    netPaise: 1_058_000,
    generatedAt: '2025-08-16T03:00:00.000Z',
  };

  it('lists statements with the server limit cap', async () => {
    mockGet.mockReturnValueOnce(env([STATEMENT]));
    const rows = await listBillingStatements(500);
    expect(mockGet).toHaveBeenCalledWith('/retailer/billing-statements', { params: { limit: 100 } });
    expect(rows[0]).toMatchObject({ id: 'pay_1', ordersCount: 42, netPaise: 1_058_000, adjustmentsPaise: -5_000 });
  });

  it('loads a statement with its dispute outcomes (empty when the server sends none)', async () => {
    mockGet.mockReturnValueOnce(
      env({
        ...STATEMENT,
        liabilityBookings: [{ id: 'b1', issueId: 'iss_9', description: 'Wrong size', amountPaise: 99_00 }],
      }),
    );
    const d = await getBillingStatement('pay_1');
    expect(mockGet).toHaveBeenCalledWith('/retailer/billing-statements/pay_1');
    expect(d.liabilityBookings).toEqual([
      { id: 'b1', issueId: 'iss_9', description: 'Wrong size', amountPaise: 9900 },
    ]);

    mockGet.mockReturnValueOnce(env(STATEMENT));
    expect((await getBillingStatement('pay_1')).liabilityBookings).toEqual([]);
  });

  it('has a chip for every statement and early-payout status, and survives unknown ones', () => {
    expect(billingStatusMeta('closed').tone).toBe('success');
    expect(billingStatusMeta('open').label).toBe('Open');
    expect(billingStatusMeta('weird_state').label).toBe('weird state');
    expect(earlyStatusMeta('approved').tone).toBe('success');
    expect(earlyStatusMeta('rejected').tone).toBe('danger');
    expect(earlyStatusMeta('nope').tone).toBe('neutral');
  });
});

describe('invoices API', () => {
  const INVOICE = {
    id: 'inv_1',
    number: 'INV/25-26/0001',
    kind: 'invoice',
    status: 'issued',
    orderId: 'ord_01abc',
    storeId: 'str_1',
    consumerName: 'Asha',
    issuedAt: '2025-08-02T00:00:00.000Z',
    totalPaise: 118_000,
    taxableValuePaise: 100_000,
    cgstPaise: 9_000,
    sgstPaise: 9_000,
    igstPaise: 0,
    tcsPaise: 0,
    tcsRateBp: 0,
    pdfUrl: null,
    linkedInvoiceId: null,
    createdAt: '2025-08-02T00:00:00.000Z',
  };

  it('sends kind and limit (capped at 200) and shapes the rows', async () => {
    mockGet.mockReturnValueOnce(env([INVOICE]));
    const rows = await listInvoices({ kind: 'commission', limit: 999 });
    expect(mockGet).toHaveBeenCalledWith('/retailer/invoices', {
      params: { kind: 'commission', limit: 200 },
    });
    expect(rows[0]).toMatchObject({ number: 'INV/25-26/0001', pdfUrl: null, totalPaise: 118_000 });
    expect(invoiceGstPaise(rows[0])).toBe(18_000);
  });

  it('defaults to every kind and passes an order filter through', async () => {
    mockGet.mockReturnValueOnce(env([]));
    await listInvoices({ orderId: 'ord_1' });
    expect(mockGet).toHaveBeenCalledWith('/retailer/invoices', {
      params: { kind: 'all', orderId: 'ord_1', limit: 100 },
    });
    mockGet.mockReturnValueOnce(env('not an array'));
    expect(await listInvoices()).toEqual([]);
  });

  it('loads one invoice with its credit notes', async () => {
    mockGet.mockReturnValueOnce(
      env({
        ...INVOICE,
        creditNotes: [
          {
            id: 'cn_1',
            creditNoteNumber: 'CN/1',
            reason: 'return',
            grandTotalReversedPaise: 50_000,
            pdfUrl: 'https://cdn.example/cn.pdf',
            issuedAt: '2025-08-05T00:00:00.000Z',
          },
        ],
      }),
    );
    const d = await getInvoice('inv/1');
    expect(mockGet).toHaveBeenCalledWith('/retailer/invoices/inv%2F1');
    expect(d.creditNotes[0]).toMatchObject({ creditNoteNumber: 'CN/1', grandTotalReversedPaise: 50_000 });
    expect(invoiceKindMeta('supplementary').label).toBe('Supplementary');
    expect(invoiceKindMeta('commission').tone).toBe('neutral');
  });
});

describe('inventory API', () => {
  it('asks the server for one variant\'s history instead of filtering the store ledger', async () => {
    mockGet.mockReturnValueOnce(env([]));
    await getStockAdjustments({ variantId: 'var_1' });
    expect(mockGet).toHaveBeenCalledWith('/retailer/inventory/adjustments', {
      params: { limit: 200, variantId: 'var_1' },
    });
  });

  it('posts a stock adjust for floor staff', async () => {
    mockPost.mockReturnValueOnce(env({ ok: true }));
    await adjustVariantStock('var_1', { newStock: 4, reason: 'damage_writeoff' });
    expect(mockPost).toHaveBeenCalledWith('/retailer/inventory/var_1/adjust', {
      newStock: 4,
      reason: 'damage_writeoff',
    });
  });

  it('dry-runs and applies an import with the explicit flag, same rows', async () => {
    const rows = [{ sku: 'A', stock: 5 }];
    mockPost.mockReturnValueOnce(
      env({
        dryRun: true,
        applied: 0,
        summary: { parsed: 1, stockUpdates: 1, variantCreates: 0, listingCreates: 0, noChange: 0, errors: 0 },
        plan: [],
        valid: [],
        errors: [],
      }),
    );
    const dry = await dryRunInventoryImport(rows);
    expect(mockPost).toHaveBeenLastCalledWith('/retailer/inventory/import', { rows, dryRun: true });
    expect(dry.summary.stockUpdates).toBe(1);

    mockPost.mockReturnValueOnce(
      env({ dryRun: false, applied: { stockUpdates: 1, variantCreates: 0, listingCreates: 0, priceUpdates: 0 }, appliedTotal: 1, createdListings: [], createdVariants: [], updatedVariants: [] }),
    );
    const applied = await applyInventoryImport(rows);
    expect(mockPost).toHaveBeenLastCalledWith('/retailer/inventory/import', { rows, dryRun: false });
    expect(applied.appliedTotal).toBe(1);
  });

  it('keeps the template as raw text (no JSON parsing of the CSV)', async () => {
    mockGet.mockReturnValueOnce(Promise.resolve({ data: '﻿sku,stock\nA,1' }));
    expect(await fetchInventoryTemplate()).toBe('﻿sku,stock\nA,1');
    const [url, cfg] = mockGet.mock.calls[0];
    expect(url).toBe('/retailer/inventory/template');
    expect(cfg.responseType).toBe('text');
    expect(cfg.transformResponse('raw')).toBe('raw');
  });

  it('asks for dead stock with the threshold and unwraps the report envelope', async () => {
    mockGet.mockReturnValueOnce(
      env({
        rows: [{ variantId: 'v', listingId: 'l', listingName: 'Tee', label: 'M', sku: null, totalStock: 3, lastSoldAt: null }],
        meta: { generatedAt: 'x', generatedAtIst: '2025-08-02 10:00 IST' },
      }),
    );
    const r = await getDeadStock({ daysWithoutSale: 45 });
    expect(mockGet).toHaveBeenCalledWith('/retailer/reports/listings/dead-stock', {
      params: { daysWithoutSale: 45, limit: 200 },
    });
    expect(r.rows).toHaveLength(1);
    expect(r.generatedAtIst).toBe('2025-08-02 10:00 IST');
  });

  it('shapes dead stock from a bare array or junk', () => {
    expect(shapeDeadStock([{ variantId: 'v' }]).rows).toHaveLength(1);
    expect(shapeDeadStock(null).rows).toEqual([]);
    expect(shapeDeadStock({ rows: 'x' }).rows).toEqual([]);
  });
});
