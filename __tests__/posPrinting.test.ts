/**
 * Printing is guarded: with the native module missing, every entry point fails with a friendly error
 * instead of crashing; with it present, the right payload reaches it. Also: GSTIN validation, the
 * invoice PDF helpers, and the persisted stores (label settings, returned-quantity ledger).
 */
jest.mock('react-native-blob-util', () => ({ __esModule: true, default: {} }));
jest.mock('../src/store/auth', () => ({ useAuth: { getState: () => ({ token: 'tkn' }) } }));
jest.mock('../src/store/settings', () => ({ useSettings: { getState: () => ({ baseUrl: 'https://api.example.com/api/v1' }) } }));

import {
  PRINT_UNAVAILABLE_MESSAGE,
  PrintUnavailableError,
  __setPrintModuleForTests,
  getPrintModule,
  isPrintAvailable,
  printFailureMessage,
  printHtml,
  printPdfFile,
} from '../src/utils/printing';
import { isOwnApiUrl, pdfFileName } from '../src/utils/posPdf';
import { gstinError, isValidGstin, normalizeGstin } from '../src/utils/gstin';
import { useLabelSettings } from '../src/store/labelSettings';
import { usePosReturns } from '../src/store/posReturns';
import { DEFAULT_LABEL_CONFIG } from '../src/utils/labelHtml';

afterEach(() => __setPrintModuleForTests(undefined));

describe('printing without the native module', () => {
  it('reports unavailable instead of crashing', async () => {
    __setPrintModuleForTests(null);
    expect(isPrintAvailable()).toBe(false);
    expect(getPrintModule()).toBeNull();
    await expect(printHtml('<p>x</p>')).rejects.toBeInstanceOf(PrintUnavailableError);
    await expect(printPdfFile('/tmp/a.pdf')).rejects.toBeInstanceOf(PrintUnavailableError);
  });

  it('the toast text for the missing module is the update-the-app message', async () => {
    __setPrintModuleForTests(null);
    const err = await printHtml('<p>x</p>').catch((e) => e);
    expect(printFailureMessage(err)).toBe(PRINT_UNAVAILABLE_MESSAGE);
    expect(printFailureMessage(new Error('Printer offline'))).toBe('Printer offline');
    expect(printFailureMessage({}, 'Couldn’t print')).toBe('Couldn’t print');
  });

  it('is simply unavailable under jest (module not linked), without throwing on lookup', () => {
    expect(() => isPrintAvailable()).not.toThrow();
    expect(isPrintAvailable()).toBe(false);
  });
});

describe('printing with the native module', () => {
  it('hands HTML to the print dialog with a job name', async () => {
    const print = jest.fn().mockResolvedValue('job');
    __setPrintModuleForTests({ print });
    expect(isPrintAvailable()).toBe(true);
    await printHtml('<p>receipt</p>', 'Receipt INV-1');
    expect(print).toHaveBeenCalledWith({ html: '<p>receipt</p>', jobName: 'Receipt INV-1' });
  });

  it('prints a PDF from a plain path — a file:// URI is stripped (it would hang the Android job)', async () => {
    const print = jest.fn().mockResolvedValue('job');
    __setPrintModuleForTests({ print });
    await printPdfFile('file:///data/user/0/app/cache/INV-1.pdf', 'Invoice');
    expect(print).toHaveBeenCalledWith({ filePath: '/data/user/0/app/cache/INV-1.pdf', jobName: 'Invoice' });
    await printPdfFile('/data/user/0/app/cache/INV-2.pdf');
    expect(print.mock.calls[1][0].filePath).toBe('/data/user/0/app/cache/INV-2.pdf');
  });

  it('passes a native failure through', async () => {
    __setPrintModuleForTests({ print: jest.fn().mockRejectedValue(new Error('print_error')) });
    await expect(printHtml('<p/>')).rejects.toThrow('print_error');
  });
});

describe('invoice PDF helpers', () => {
  it('makes a safe file name from the invoice number', () => {
    expect(pdfFileName('INV/2026-27/0012')).toBe('INV-2026-27-0012.pdf');
    expect(pdfFileName('  A B  ')).toBe('A-B.pdf');
    expect(pdfFileName(null)).toBe('invoice.pdf');
    expect(pdfFileName('///')).toBe('invoice.pdf');
  });

  it('only our own API host may receive the login token — never third-party storage', () => {
    const base = 'https://api.example.com/api/v1';
    expect(isOwnApiUrl('https://api.example.com/files/x.pdf', base)).toBe(true);
    expect(isOwnApiUrl('HTTPS://API.EXAMPLE.COM/x.pdf', base)).toBe(true);
    expect(isOwnApiUrl('https://media.example.net/pos-invoices/x.pdf', base)).toBe(false);
    expect(isOwnApiUrl('https://api.example.com.evil.io/x.pdf', base)).toBe(false);
    expect(isOwnApiUrl('not a url', base)).toBe(false);
  });
});

describe('GSTIN', () => {
  it('accepts a well-formed GSTIN, any case, stray spaces', () => {
    expect(isValidGstin('27AAAAA0000A1Z5')).toBe(true);
    expect(isValidGstin(' 27aaaaa0000a1z5 ')).toBe(true);
    expect(normalizeGstin(' 27aaaaa 0000a1z5 ')).toBe('27AAAAA0000A1Z5');
    expect(gstinError('27AAAAA0000A1Z5')).toBeNull();
  });

  it('rejects anything that would send the wrong tax split (bad state prefix, wrong shape)', () => {
    expect(isValidGstin('AB1234567890123')).toBe(false); // must start with the 2-digit state code
    expect(isValidGstin('27AAAAA0000A1Y5')).toBe(false); // 14th char is always Z
    expect(isValidGstin('27AAAAA0000A1Z')).toBe(false); // too short
    expect(isValidGstin('27AAAAA0000A1Z55')).toBe(false); // too long
    expect(isValidGstin('')).toBe(false);
    expect(isValidGstin(null)).toBe(false);
  });

  it('says what is wrong', () => {
    expect(gstinError('')).toMatch(/enter/i);
    expect(gstinError('27AAAA')).toMatch(/15 characters/);
    expect(gstinError('AB1234567890123')).toMatch(/state code/i);
    expect(gstinError('27AAAAA0000A1Y5')).toMatch(/doesn.t look right/i);
  });
});

describe('persisted counter settings', () => {
  it('label settings change and reset', () => {
    const s = () => useLabelSettings.getState();
    s().reset();
    expect(s().size).toBe('md');
    s().setSize('lg');
    s().setConfig({ codeType: 'barcode', showSku: true });
    expect(s().size).toBe('lg');
    expect(s().config).toEqual({ ...DEFAULT_LABEL_CONFIG, codeType: 'barcode', showSku: true });
    // a partial patch keeps the rest
    s().setConfig({ showName: false });
    expect(s().config.showSku).toBe(true);
    expect(s().config.showName).toBe(false);
    s().reset();
    expect(s().config).toEqual(DEFAULT_LABEL_CONFIG);
  });

  it('the returned-quantity ledger accumulates per original item', () => {
    const l = () => usePosReturns.getState();
    l().record([{ originalSaleItemId: 'psi_1', qty: 1 }]);
    l().record([{ originalSaleItemId: 'psi_1', qty: 2 }, { originalSaleItemId: 'psi_2', qty: 1 }]);
    expect(l().returned.psi_1).toBe(3);
    expect(l().returned.psi_2).toBe(1);
  });
});
