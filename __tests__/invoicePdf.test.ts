// PDF delivery: the invoice / statement endpoints answer with JSON { pdfUrl } (or, for
// statements, may answer with the file itself); JSON must never be saved as a PDF.
import { Platform } from 'react-native';

const mockFetch = jest.fn();
const mockConfig = jest.fn((_cfg?: unknown) => ({ fetch: mockFetch }));
const mockFs = {
  dirs: { CacheDir: '/cache', DocumentDir: '/docs', DownloadDir: '/dl' },
  exists: jest.fn(async (_p: string) => true),
  readFile: jest.fn(async (_p: string, _enc: string) => ''),
  unlink: jest.fn(async (_p: string) => undefined),
  mv: jest.fn(async (_a: string, _b: string) => undefined),
  writeFile: jest.fn(async () => 0),
};
const mockPreview = jest.fn();
const mockActionView = jest.fn(async (_p: string, _m: string) => true);
const mockCopyToMedia = jest.fn(async (..._a: unknown[]) => 'content://media/1');

jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    config: (cfg: unknown) => mockConfig(cfg),
    // A getter: imports run before the const above is initialised.
    get fs() {
      return mockFs;
    },
    ios: { previewDocument: (p: string) => mockPreview(p) },
    android: { actionViewIntent: (p: string, m: string) => mockActionView(p, m) },
    MediaCollection: { copyToMediaStore: (...a: unknown[]) => mockCopyToMedia(...a) },
  },
}));
jest.mock('../src/store/settings', () => ({
  useSettings: { getState: () => ({ baseUrl: 'https://api.test/api/v1/' }) },
}));
let mockToken: string | null = 'tok_123';
jest.mock('../src/store/auth', () => ({
  useAuth: { getState: () => ({ token: mockToken }) },
}));
jest.mock('../src/api/request', () => ({ http: {}, req: jest.fn() }));
const mockListOrderInvoices = jest.fn();
jest.mock('../src/api/orders', () => ({
  listOrderInvoices: (id: string) => mockListOrderInvoices(id),
}));

import {
  errorMessageFromBody,
  isApiUrl,
  openBillingStatementPdf,
  openInvoicePdf,
  openOrderInvoice,
  openPdfUrl,
  pdfFilename,
  pdfUrlFromBody,
} from '../src/api/invoices';
import { safeFilename, saveTextFile, savedMessage } from '../src/utils/saveFile';

const API = 'https://api.test/api/v1';

/** What blob-util hands back for a path-config fetch. */
function response(status: number, contentType: string) {
  return {
    info: () => ({ status, headers: { 'Content-Type': contentType } }),
    path: () => '/dl/x.pdf',
  };
}

function setPlatform(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockToken = 'tok_123';
  mockFs.exists.mockImplementation(async () => true);
  mockFs.readFile.mockImplementation(async () => '');
  setPlatform('ios');
});

describe('pure helpers', () => {
  it('makes safe pdf filenames', () => {
    expect(pdfFilename('INV/25-26/0001')).toBe('INV-25-26-0001.pdf');
    expect(pdfFilename('report.PDF')).toBe('report.pdf');
    expect(pdfFilename('  ///  ')).toBe('document.pdf');
    expect(safeFilename('Dead stock 30d.csv')).toBe('Dead-stock-30d.csv');
    expect(safeFilename('')).toBe('file');
  });

  it('reads the pdf link out of the envelope, or a bare body, and nothing else', () => {
    expect(pdfUrlFromBody('{"success":true,"data":{"invoiceId":"i","pdfUrl":"https://cdn/x.pdf"}}')).toBe(
      'https://cdn/x.pdf',
    );
    expect(pdfUrlFromBody('{"pdfUrl":"http://cdn/x.pdf"}')).toBe('http://cdn/x.pdf');
    expect(pdfUrlFromBody('{"data":{"pdfUrl":"javascript:alert(1)"}}')).toBeNull();
    expect(pdfUrlFromBody('{"data":{}}')).toBeNull();
    expect(pdfUrlFromBody('%PDF-1.4 binary')).toBeNull();
  });

  it('reads the error message out of an error envelope', () => {
    expect(errorMessageFromBody('{"success":false,"error":{"code":"invalid_state","message":"PDF not yet generated"}}')).toBe(
      'PDF not yet generated',
    );
    expect(errorMessageFromBody('{"error":"plain"}')).toBe('plain');
    expect(errorMessageFromBody('<html>')).toBeNull();
  });

  it('only treats URLs under the API base as the API', () => {
    expect(isApiUrl(`${API}/retailer/invoices/1/pdf`, API)).toBe(true);
    expect(isApiUrl('https://api.test/api/v1evil/x', API)).toBe(false);
    expect(isApiUrl('https://bucket.s3.amazonaws.com/x.pdf', API)).toBe(false);
    expect(isApiUrl('https://x', '')).toBe(false);
  });
});

describe('openInvoicePdf (JSON { pdfUrl } contract)', () => {
  it('asks the API with the token, then downloads the hosted pdfUrl WITHOUT the token (iOS)', async () => {
    mockFetch
      .mockResolvedValueOnce(response(200, 'application/json; charset=utf-8'))
      .mockResolvedValueOnce(response(200, 'application/pdf'));
    mockFs.readFile.mockResolvedValueOnce(
      JSON.stringify({
        success: true,
        data: { invoiceId: 'inv_1', invoiceNumber: 'INV/1', pdfUrl: 'https://bucket.s3.amazonaws.com/inv.pdf' },
      }),
    );

    await openInvoicePdf('inv_1', 'INV/1');

    // 1) the endpoint, authenticated, to a cache file.
    expect(mockFetch.mock.calls[0]).toEqual([
      'GET',
      `${API}/retailer/invoices/inv_1/pdf`,
      { Authorization: 'Bearer tok_123' },
    ]);
    expect(mockConfig.mock.calls[0][0]).toMatchObject({ path: expect.stringContaining('/cache/') });
    // The JSON stand-in file is removed, never previewed as a PDF.
    expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('/cache/'));
    // 2) the hosted file, with no Authorization header (a presigned URL would reject it).
    expect(mockFetch.mock.calls[1]).toEqual(['GET', 'https://bucket.s3.amazonaws.com/inv.pdf', {}]);
    expect(mockConfig.mock.calls[1][0]).toEqual({ path: '/docs/INV-1.pdf' });
    expect(mockPreview).toHaveBeenCalledTimes(1);
    expect(mockPreview).toHaveBeenCalledWith('/docs/INV-1.pdf');
  });

  it('uses the Android download manager for the hosted file and opens it', async () => {
    setPlatform('android');
    mockFetch
      .mockResolvedValueOnce(response(200, 'application/json'))
      .mockResolvedValueOnce(response(200, 'application/pdf'));
    mockFs.readFile.mockResolvedValueOnce('{"data":{"pdfUrl":"https://cdn.example/inv.pdf"}}');

    await openInvoicePdf('inv_1', 'INV-1');

    const cfg = mockConfig.mock.calls[1][0] as { addAndroidDownloads: Record<string, unknown> };
    expect(cfg.addAndroidDownloads).toMatchObject({
      useDownloadManager: true,
      mime: 'application/pdf',
      path: '/dl/INV-1.pdf',
    });
    expect(mockFetch.mock.calls[1]).toEqual(['GET', 'https://cdn.example/inv.pdf', {}]);
    expect(mockActionView).toHaveBeenCalledWith('/dl/x.pdf', 'application/pdf');
  });

  it('shows the server message for a 409 (PDF not generated yet) and never previews anything', async () => {
    mockFetch.mockResolvedValueOnce(response(409, 'application/json'));
    mockFs.readFile.mockResolvedValueOnce(
      '{"success":false,"error":{"code":"invalid_state","message":"PDF not yet generated for this invoice — try again shortly"}}',
    );
    await expect(openInvoicePdf('inv_1', 'INV-1')).rejects.toThrow(/not yet generated/);
    expect(mockPreview).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('refuses JSON that carries no usable link', async () => {
    mockFetch.mockResolvedValueOnce(response(200, 'application/json'));
    mockFs.readFile.mockResolvedValueOnce('{"success":true,"data":{"pdfUrl":null}}');
    await expect(openInvoicePdf('inv_1')).rejects.toThrow(/not ready/i);
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('needs a signed-in user', async () => {
    mockToken = null;
    await expect(openInvoicePdf('inv_1')).rejects.toThrow(/sign in/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('opens an order\'s invoice through the same path, and explains when there is none', async () => {
    mockListOrderInvoices.mockResolvedValueOnce([{ id: 'inv_9', kind: 'invoice', number: 'INV/9' }]);
    mockFetch
      .mockResolvedValueOnce(response(200, 'application/json'))
      .mockResolvedValueOnce(response(200, 'application/pdf'));
    mockFs.readFile.mockResolvedValueOnce('{"data":{"pdfUrl":"https://cdn.example/9.pdf"}}');
    await openOrderInvoice('ord_1');
    expect(mockFetch.mock.calls[0][1]).toBe(`${API}/retailer/invoices/inv_9/pdf`);

    mockListOrderInvoices.mockResolvedValueOnce([]);
    await expect(openOrderInvoice('ord_2')).rejects.toThrow(/No tax invoice/);
  });
});

describe('openBillingStatementPdf (file OR url)', () => {
  it('follows a JSON { pdfUrl } answer', async () => {
    mockFetch
      .mockResolvedValueOnce(response(200, 'application/json'))
      .mockResolvedValueOnce(response(200, 'application/pdf'));
    mockFs.readFile.mockResolvedValueOnce('{"data":{"statementId":"pay_1","pdfUrl":"https://cdn.example/s.pdf"}}');
    await openBillingStatementPdf('pay_1', 'Aug 1–15');
    expect(mockFetch.mock.calls[0][1]).toBe(`${API}/retailer/billing-statements/pay_1/pdf`);
    expect(mockFetch.mock.calls[1][1]).toBe('https://cdn.example/s.pdf');
    expect(mockPreview).toHaveBeenCalledTimes(1);
  });

  it('opens the file itself when the API streams a PDF (iOS: moved to Documents, then previewed)', async () => {
    mockFetch.mockResolvedValueOnce(response(200, 'application/pdf'));
    await openBillingStatementPdf('pay_1', 'Aug');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFs.readFile).not.toHaveBeenCalled();
    expect(mockFs.mv).toHaveBeenCalledWith(expect.stringContaining('/cache/'), '/docs/statement-Aug.pdf');
    expect(mockPreview).toHaveBeenCalledWith('/docs/statement-Aug.pdf');
  });

  it('keeps a copy in Downloads and opens a streamed PDF on Android', async () => {
    setPlatform('android');
    mockFetch.mockResolvedValueOnce(response(200, 'application/pdf'));
    await openBillingStatementPdf('pay_1', 'Aug');
    expect(mockCopyToMedia).toHaveBeenCalledWith(
      { name: 'statement-Aug.pdf', parentFolder: '', mimeType: 'application/pdf' },
      'Download',
      expect.stringContaining('/cache/'),
    );
    expect(mockActionView).toHaveBeenCalledWith(expect.stringContaining('/cache/'), 'application/pdf');
  });

  it('reports the server error for a failed lookup (e.g. 404)', async () => {
    mockFetch.mockResolvedValueOnce(response(404, 'application/json'));
    mockFs.readFile.mockResolvedValueOnce('{"success":false,"error":{"message":"Statement not found"}}');
    await expect(openBillingStatementPdf('nope')).rejects.toThrow('Statement not found');
  });
});

describe('openPdfUrl', () => {
  it('downloads a hosted link directly (no endpoint hop)', async () => {
    mockFetch.mockResolvedValueOnce(response(200, 'application/pdf'));
    await openPdfUrl('https://cdn.example/cn.pdf', 'CN/1');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]).toEqual(['GET', 'https://cdn.example/cn.pdf', {}]);
    expect(mockPreview).toHaveBeenCalledWith('/docs/CN-1.pdf');
  });

  it('sends the token only when the link is on the API itself', async () => {
    mockFetch.mockResolvedValueOnce(response(200, 'application/pdf'));
    await openPdfUrl(`${API}/files/x.pdf`, 'x');
    expect(mockFetch.mock.calls[0][2]).toEqual({ Authorization: 'Bearer tok_123' });
  });

  it('throws on an HTTP error instead of previewing the error body', async () => {
    mockFetch.mockResolvedValueOnce(response(403, 'application/xml'));
    await expect(openPdfUrl('https://cdn.example/x.pdf', 'x')).rejects.toThrow(/403/);
    expect(mockPreview).not.toHaveBeenCalled();
    expect(mockFs.unlink).toHaveBeenCalled();
  });
});

describe('saveTextFile', () => {
  it('Android 10+: writes a cache file, copies it to Downloads via MediaStore, removes the temp', async () => {
    setPlatform('android');
    Object.defineProperty(Platform, 'Version', { configurable: true, get: () => 34 });
    const saved = await saveTextFile('Dead stock 30d.csv', 'a,b\n1,2');
    expect(mockFs.writeFile).toHaveBeenCalledWith('/cache/Dead-stock-30d.csv', 'a,b\n1,2', 'utf8');
    expect(mockCopyToMedia).toHaveBeenCalledWith(
      { name: 'Dead-stock-30d.csv', parentFolder: '', mimeType: 'text/csv' },
      'Download',
      '/cache/Dead-stock-30d.csv',
    );
    expect(mockFs.unlink).toHaveBeenCalledWith('/cache/Dead-stock-30d.csv');
    expect(saved).toEqual({ filename: 'Dead-stock-30d.csv', location: 'downloads' });
    expect(savedMessage(saved)).toBe('Saved Dead-stock-30d.csv to Downloads');
  });

  it('iOS: writes into Documents and previews it', async () => {
    const saved = await saveTextFile('inventory-template.csv', 'x');
    expect(mockFs.writeFile).toHaveBeenCalledWith('/docs/inventory-template.csv', 'x', 'utf8');
    expect(mockPreview).toHaveBeenCalledWith('/docs/inventory-template.csv');
    expect(saved.location).toBe('files');
  });
});
