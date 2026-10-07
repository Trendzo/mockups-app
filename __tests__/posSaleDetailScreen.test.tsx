/**
 * Sale detail: who gets Return / Exchange / Void, and the print / share actions — receipt through the
 * print dialog, A4 invoice via the downloaded PDF, share PDF, and a graceful toast when printing isn't
 * available in the build.
 */
const mockToast = { show: jest.fn() };
jest.mock('../src/components', () => {
  const React = require('react');
  const host = (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never);
  return {
    AppText: host('AppText'),
    Banner: host('Banner'),
    BottomSheet: host('BottomSheet'),
    DetailRow: host('DetailRow'),
    Divider: host('Divider'),
    Field: host('Field'),
    KeyboardStickyView: host('KeyboardStickyView'),
    ListRow: host('ListRow'),
    Panel: host('Panel'),
    PrimaryButton: host('PrimaryButton'),
    Screen: host('Screen'),
    ScreenHeader: host('ScreenHeader'),
    SheetSurface: host('SheetSurface'),
    StatusChip: host('StatusChip'),
    useToast: () => mockToast,
  };
});

let mockSale: Record<string, unknown>;
let mockOriginal: Record<string, unknown> | undefined;
let mockCanRefund = true;
jest.mock('../src/api/posHooks', () => ({
  usePosSale: (id?: string) => ({
    data: id === 'sale_orig' ? mockOriginal : id ? mockSale : undefined,
    isError: false,
    refetch: jest.fn(),
  }),
  useVoidSale: () => ({ mutate: jest.fn(), isPending: false }),
}));
const mockGetReceipt = jest.fn();
const mockGetInvoice = jest.fn();
jest.mock('../src/api/pos', () => ({
  getSaleReceipt: (id: string) => mockGetReceipt(id),
  getSaleInvoice: (id: string) => mockGetInvoice(id),
}));
jest.mock('../src/api/invoices', () => ({ openHostedPdf: jest.fn() }));
jest.mock('../src/api/request', () => ({
  errorMessage: (e: { message?: string } | null, fallback = 'err') => e?.message || fallback,
}));
jest.mock('../src/utils/usePermission', () => ({
  usePermissions: () => ({ can: (k: string) => (k === 'pos.refund' ? mockCanRefund : true) }),
}));
const mockDownload = jest.fn();
const mockSaveOpen = jest.fn();
jest.mock('../src/utils/posPdf', () => ({
  pdfFileName: (n: string | null) => `${n ?? 'invoice'}.pdf`,
  downloadPdfToCache: (...a: unknown[]) => mockDownload(...a),
  savePdfAndOpen: (...a: unknown[]) => mockSaveOpen(...a),
}));

import React from 'react';
import TestRenderer, { act, ReactTestInstance } from 'react-test-renderer';
import { PosSaleDetailScreen } from '../src/screens/PosSaleDetailScreen';
import { PRINT_UNAVAILABLE_MESSAGE, __setPrintModuleForTests } from '../src/utils/printing';

const find = (root: ReactTestInstance, type: string) => root.findAllByType(type as never);
const row = (root: ReactTestInstance, label: string) => find(root, 'ListRow').find((r) => r.props.label === label);
const labels = (root: ReactTestInstance) => find(root, 'ListRow').map((r) => r.props.label);

const item = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  variantId: `v_${id}`,
  listingId: `l_${id}`,
  listingNameSnap: name,
  brandSnap: null,
  attributesLabelSnap: 'M',
  skuSnap: null,
  hsnSnap: null,
  qty: 1,
  unitMrpPaise: 500_00,
  lineDiscountPaise: 0,
  taxableValuePaise: 446_43,
  gstRateBp: 1200,
  gstPaise: 53_57,
  netLinePaise: 500_00,
  ...extra,
});

const baseSale = (extra: Record<string, unknown> = {}) => ({
  id: 'sale_1',
  status: 'completed',
  originalSaleId: null,
  completedAt: '2026-10-07T10:00:00.000Z',
  invoice: { id: 'inv_1', invoiceNumber: 'INV-1', pdfUrl: 'https://cdn.example/INV-1.pdf' },
  storeLegalNameSnap: 'Kaush Fashions',
  storeAddressSnap: '12 MG Road',
  storeGstinSnap: '23ABCDE1234F1Z5',
  customerNameSnap: 'Ravi',
  customerPhoneSnap: '9876543210',
  customerGstinSnap: null,
  billDiscountPaise: 0,
  taxableValuePaise: 446_43,
  taxPaise: 53_57,
  cgstPaise: 26_79,
  sgstPaise: 26_78,
  igstPaise: 0,
  roundOffPaise: 0,
  payablePaise: 500_00,
  changePaise: 0,
  items: [item('a', 'Kurta')],
  payments: [{ id: 'p1', method: 'upi', direction: 'collect', amountPaise: 500_00, reference: 'UTR9' }],
  ...extra,
});

const receipt = {
  title: 'TAX INVOICE',
  storeName: 'Kaush Fashions',
  storeAddress: '12 MG Road',
  storeGstin: '23ABCDE1234F1Z5',
  invoiceNumber: 'INV-1',
  saleId: 'sale_1',
  isReturn: false,
  dateTime: '07/10/2026',
  lines: [{ name: 'Kurta (M)', qty: 1, unitPaise: 500_00, gstRateBp: 1200, lineTotalPaise: 500_00 }],
  itemsGrossPaise: 500_00,
  discountPaise: 0,
  taxableValuePaise: 446_43,
  cgstPaise: 26_79,
  sgstPaise: 26_78,
  igstPaise: 0,
  roundOffPaise: 0,
  payablePaise: 500_00,
  tenders: [{ method: 'upi', amountPaise: 500_00, changePaise: 0, reference: 'UTR9' }],
  changePaise: 0,
  showGstBreakup: true,
  charsPerLine: 48,
};

const mounted: TestRenderer.ReactTestRenderer[] = [];
function setup(params: Record<string, unknown> = { id: 'sale_1' }) {
  const navigation = { goBack: jest.fn(), navigate: jest.fn(), popTo: jest.fn() };
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<PosSaleDetailScreen navigation={navigation as never} route={{ params } as never} />);
  });
  mounted.push(tree);
  return { tree, navigation };
}

afterEach(() => {
  act(() => mounted.splice(0).forEach((t) => t.unmount()));
  __setPrintModuleForTests(undefined);
});
beforeEach(() => {
  mockToast.show.mockReset();
  mockGetReceipt.mockReset().mockResolvedValue(receipt);
  mockGetInvoice.mockReset().mockResolvedValue({ id: 'inv_1', number: 'INV-1', pdfUrl: 'https://cdn.example/INV-1.pdf' });
  mockDownload.mockReset().mockResolvedValue('/cache/INV-1.pdf');
  mockSaveOpen.mockReset().mockResolvedValue(undefined);
  mockCanRefund = true;
  mockSale = baseSale();
  mockOriginal = undefined;
});

describe('who sees Return / Exchange / Void', () => {
  it('a completed sale, for someone with pos.refund: return, exchange and void', () => {
    const { tree } = setup();
    expect(labels(tree.root)).toEqual(expect.arrayContaining(['Return items', 'Exchange items', 'Void sale']));
  });

  it('without pos.refund none of them show (staff still print and share)', () => {
    mockCanRefund = false;
    const { tree } = setup();
    const l = labels(tree.root);
    expect(l).not.toContain('Return items');
    expect(l).not.toContain('Exchange items');
    expect(l).not.toContain('Void sale');
    expect(l).toEqual(expect.arrayContaining(['Print receipt', 'Share receipt']));
  });

  it('a voided sale, or a return / exchange document, cannot be returned again', () => {
    mockSale = baseSale({ status: 'voided' });
    expect(labels(setup().tree.root)).not.toContain('Return items');
    mockSale = baseSale({ originalSaleId: 'sale_orig' });
    const l = labels(setup().tree.root);
    expect(l).not.toContain('Return items');
    expect(l).not.toContain('Exchange items');
    expect(l).not.toContain('Void sale');
  });

  it('opens the Return and Exchange screens for this sale', () => {
    const { tree, navigation } = setup();
    act(() => row(tree.root, 'Return items')?.props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('PosReturn', { saleId: 'sale_1' });
    act(() => row(tree.root, 'Exchange items')?.props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('PosExchange', { saleId: 'sale_1' });
  });
});

describe('printing and sharing', () => {
  it('Print receipt: fetches the JSON receipt and prints the 80mm HTML', async () => {
    const print = jest.fn().mockResolvedValue('job');
    __setPrintModuleForTests({ print });
    const { tree } = setup();
    await act(async () => {
      await row(tree.root, 'Print receipt')?.props.onPress();
    });
    expect(mockGetReceipt).toHaveBeenCalledWith('sale_1');
    const { html, jobName } = print.mock.calls[0][0];
    expect(jobName).toBe('Receipt INV-1');
    expect(html).toContain('Kaush Fashions');
    expect(html).toContain('UPI (UTR9)');
    expect(html).toContain('size: 80mm auto');
    expect(html).not.toContain('VOIDED');
  });

  it('a voided sale prints stamped VOIDED', async () => {
    const print = jest.fn().mockResolvedValue('job');
    __setPrintModuleForTests({ print });
    mockSale = baseSale({ status: 'voided' });
    const { tree } = setup();
    await act(async () => {
      await row(tree.root, 'Print receipt')?.props.onPress();
    });
    expect(print.mock.calls[0][0].html).toContain('*** VOIDED ***');
  });

  it('without the native print module: a toast, and no network call', async () => {
    __setPrintModuleForTests(null);
    const { tree } = setup();
    await act(async () => {
      await row(tree.root, 'Print receipt')?.props.onPress();
    });
    expect(mockToast.show).toHaveBeenCalledWith(PRINT_UNAVAILABLE_MESSAGE, 'info');
    expect(mockGetReceipt).not.toHaveBeenCalled();
    await act(async () => {
      await row(tree.root, 'Print invoice')?.props.onPress();
    });
    expect(mockToast.show).toHaveBeenLastCalledWith(PRINT_UNAVAILABLE_MESSAGE, 'info');
    expect(mockGetInvoice).not.toHaveBeenCalled();
  });

  it('Print invoice: downloads the PDF then prints that file', async () => {
    const print = jest.fn().mockResolvedValue('job');
    __setPrintModuleForTests({ print });
    const { tree } = setup();
    await act(async () => {
      await row(tree.root, 'Print invoice')?.props.onPress();
    });
    expect(mockDownload).toHaveBeenCalledWith('https://cdn.example/INV-1.pdf', 'INV-1.pdf');
    expect(print).toHaveBeenCalledWith({ filePath: '/cache/INV-1.pdf', jobName: 'Invoice INV-1' });
  });

  it('Print invoice / Share PDF: "not ready yet" while the server is still rendering the PDF', async () => {
    const print = jest.fn();
    __setPrintModuleForTests({ print });
    mockGetInvoice.mockResolvedValue({ id: 'inv_1', number: 'INV-1', pdfUrl: null });
    const { tree } = setup();
    await act(async () => {
      await row(tree.root, 'Print invoice')?.props.onPress();
    });
    expect(mockToast.show).toHaveBeenCalledWith(expect.stringMatching(/isn’t ready yet/), 'info');
    expect(print).not.toHaveBeenCalled();
    await act(async () => {
      await row(tree.root, 'Share PDF')?.props.onPress();
    });
    expect(mockSaveOpen).not.toHaveBeenCalled();
  });

  it('Share PDF downloads and opens the invoice', async () => {
    const { tree } = setup();
    await act(async () => {
      await row(tree.root, 'Share PDF')?.props.onPress();
    });
    expect(mockSaveOpen).toHaveBeenCalledWith('https://cdn.example/INV-1.pdf', 'INV-1.pdf');
  });

  it('a sale with no invoice (a plain return) has no invoice print / PDF actions', () => {
    mockSale = baseSale({ invoice: null, originalSaleId: 'sale_orig', items: [] });
    const l = labels(setup().tree.root);
    expect(l).not.toContain('Print invoice');
    expect(l).not.toContain('Share PDF');
    expect(l).toContain('Print receipt');
  });

  it('a failed receipt fetch is a toast', async () => {
    __setPrintModuleForTests({ print: jest.fn() });
    mockGetReceipt.mockRejectedValue({ message: 'Sale not found' });
    const { tree } = setup();
    await act(async () => {
      await row(tree.root, 'Print receipt')?.props.onPress();
    });
    expect(mockToast.show).toHaveBeenCalledWith('Sale not found', 'error');
  });
});

describe('what the detail shows', () => {
  const texts = (root: ReactTestInstance) =>
    [...find(root, 'AppText'), ...find(root, 'DetailRow')].map((n) =>
      [n.props.label, n.props.hint, n.props.value, ...React.Children.toArray(n.props.children)].filter(Boolean).join(' '),
    );

  it('shows the payment reference', () => {
    const { tree } = setup();
    const pay = find(tree.root, 'DetailRow').find((r) => r.props.label === 'UPI');
    expect(pay?.props.hint).toBe('Ref UTR9');
  });

  it('IGST replaces CGST + SGST on an inter-state sale', () => {
    mockSale = baseSale({ cgstPaise: 0, sgstPaise: 0, igstPaise: 53_57, customerGstinSnap: '27AAAAA0000A1Z5' });
    const t = texts(setup().tree.root);
    expect(t.some((x) => x.startsWith('IGST'))).toBe(true);
    expect(t.some((x) => x.startsWith('CGST'))).toBe(false);
  });

  it('a return document lists what was returned, named from the original sale', () => {
    mockSale = baseSale({
      originalSaleId: 'sale_orig',
      items: [],
      invoice: null,
      payablePaise: -500_00,
      returnLines: [{ id: 'rl1', originalSaleItemId: 'psi_old', qty: 1, refundPaise: 500_00, restock: false }],
    });
    mockOriginal = baseSale({ id: 'sale_orig', items: [item('psi_old', 'Old Kurta')] });
    const t = texts(setup().tree.root);
    expect(t).toContain('Items returned');
    expect(t.some((x) => x.includes('Old Kurta'))).toBe(true);
    expect(t.some((x) => x.includes('not restocked'))).toBe(true);
  });
});
