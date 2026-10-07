import ReactNativeBlobUtil from 'react-native-blob-util';
import { Linking, Platform } from 'react-native';
import { useSettings } from '../store/settings';
import { useAuth } from '../store/auth';
import { http, req } from './request';
import { listOrderInvoices } from './orders';
import {
  InvoiceDetail,
  InvoiceKindQuery,
  TaxInvoice,
  toInvoiceDetail,
  toTaxInvoice,
} from '../types/earnings';

// ---- Invoice data (GET /retailer/invoices, `invoicing.view`) ----------------------

/** Server cap on `limit`. */
export const INVOICES_MAX_LIMIT = 200;

/**
 * List invoices, newest first. `kind`: invoice (tax invoices + bills of supply),
 * supplementary, commission (issued to the store by Trendzo) or all. No paging on
 * the server: raise `limit` (max 200) instead.
 */
export async function listInvoices(opts: {
  kind?: InvoiceKindQuery;
  orderId?: string;
  limit?: number;
} = {}): Promise<TaxInvoice[]> {
  const data = await req<unknown>(() =>
    http.get('/retailer/invoices', {
      params: {
        kind: opts.kind ?? 'all',
        ...(opts.orderId ? { orderId: opts.orderId } : {}),
        limit: Math.min(INVOICES_MAX_LIMIT, opts.limit ?? 100),
      },
    }),
  );
  return (Array.isArray(data) ? data : []).map(toTaxInvoice);
}

/** One invoice plus its credit notes. */
export async function getInvoice(id: string): Promise<InvoiceDetail> {
  const data = await req<unknown>(() => http.get(`/retailer/invoices/${encodeURIComponent(id)}`));
  return toInvoiceDetail(data);
}

// ---- PDF delivery -------------------------------------------------------------

/** "INV/24-25/001" -> "INV-24-25-001.pdf" */
export function pdfFilename(name: string): string {
  const base = name.replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base || 'document'}.pdf`;
}

/** Message out of a `{ success: false, error: { message } }` body, if it is one. */
export function errorMessageFromBody(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } | string; message?: unknown };
    const e = parsed?.error;
    if (typeof e === 'string') return e;
    if (e && typeof e.message === 'string') return e.message;
    return typeof parsed?.message === 'string' ? parsed.message : null;
  } catch {
    return null;
  }
}

/** The hosted `pdfUrl` out of `{ success, data: { pdfUrl } }` or a bare `{ pdfUrl }`. */
export function pdfUrlFromBody(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as { data?: { pdfUrl?: unknown }; pdfUrl?: unknown };
    const url = parsed?.data?.pdfUrl ?? parsed?.pdfUrl;
    return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}

/** The API token must only ever go to the API itself (a pre-signed S3 URL rejects it anyway). */
export function isApiUrl(url: string, base: string): boolean {
  const b = base.replace(/\/+$/, '');
  return !!b && (url === b || url.startsWith(`${b}/`));
}

/** A response header, whatever case the platform reports it in. */
function headerOf(headers: unknown, name: string): string {
  const h = (headers ?? {}) as Record<string, unknown>;
  const key = Object.keys(h).find((k) => k.toLowerCase() === name);
  const v = key ? h[key] : '';
  return typeof v === 'string' ? v : '';
}

type PdfSource = { kind: 'url'; url: string } | { kind: 'file'; path: string };

function apiContext(): { base: string; headers: Record<string, string> } {
  const base = useSettings.getState().baseUrl.replace(/\/+$/, '');
  const token = useAuth.getState().token;
  if (!token) throw new Error('Please sign in again.');
  return { base, headers: { Authorization: `Bearer ${token}` } };
}

/**
 * Ask an API endpoint for a PDF. It answers either with the file itself or with
 * JSON `{ pdfUrl }` (the invoice and statement routes); JSON is never treated as a
 * PDF, an error body becomes the thrown message.
 */
async function resolvePdfEndpoint(path: string, filename: string): Promise<PdfSource> {
  const { base, headers } = apiContext();
  const { fs } = ReactNativeBlobUtil;
  const tmp = `${fs.dirs.CacheDir}/${Date.now().toString(36)}-${filename}`;

  const res = await ReactNativeBlobUtil.config({ path: tmp }).fetch('GET', `${base}${path}`, headers);
  const info = res.info();
  const status = info.status ?? 0;
  const contentType = headerOf(info.headers, 'content-type');

  if (status >= 400 || /json/i.test(contentType)) {
    let text = '';
    try {
      text = await fs.readFile(tmp, 'utf8');
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
    if (status >= 400) {
      throw new Error(errorMessageFromBody(text) ?? `Couldn't get the PDF (${status}).`);
    }
    const url = pdfUrlFromBody(text);
    if (!url) throw new Error('The PDF is not ready yet. Try again shortly.');
    return { kind: 'url', url };
  }
  return { kind: 'file', path: tmp };
}

/** Download a PDF URL and open it: Android -> Downloads then the viewer, iOS -> Files then preview. */
async function downloadAndOpenUrl(url: string, filename: string): Promise<void> {
  const { base, headers } = apiContext();
  const sendAuth = isApiUrl(url, base) ? headers : {};
  const { fs } = ReactNativeBlobUtil;

  if (Platform.OS === 'android') {
    const dest = `${fs.dirs.DownloadDir}/${filename}`;
    const res = await ReactNativeBlobUtil.config({
      addAndroidDownloads: {
        useDownloadManager: true,
        notification: true,
        title: filename,
        description: 'Trendzo document',
        mime: 'application/pdf',
        mediaScannable: true,
        path: dest,
      },
    }).fetch('GET', url, sendAuth);
    if (!(await fs.exists(res.path()))) throw new Error('Download failed.');
    await ReactNativeBlobUtil.android.actionViewIntent(res.path(), 'application/pdf').catch(() => {});
    return;
  }

  const dest = `${fs.dirs.DocumentDir}/${filename}`;
  if (await fs.exists(dest)) await fs.unlink(dest);
  const res = await ReactNativeBlobUtil.config({ path: dest }).fetch('GET', url, sendAuth);
  const status = res.info().status ?? 0;
  if (status >= 400) {
    await fs.unlink(dest).catch(() => {});
    throw new Error(`The PDF download failed (${status}).`);
  }
  ReactNativeBlobUtil.ios.previewDocument(dest);
}

/** A PDF the API streamed straight to a cache file. */
async function openCachedPdf(path: string, filename: string): Promise<void> {
  const { fs } = ReactNativeBlobUtil;
  if (Platform.OS === 'android') {
    try {
      await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
        { name: filename, parentFolder: '', mimeType: 'application/pdf' },
        'Download',
        path,
      );
    } catch {
      // Saving a copy is a courtesy; viewing is the point.
    }
    await ReactNativeBlobUtil.android.actionViewIntent(path, 'application/pdf').catch(() => {});
    return;
  }
  const dest = `${fs.dirs.DocumentDir}/${filename}`;
  if (await fs.exists(dest)) await fs.unlink(dest);
  await fs.mv(path, dest);
  ReactNativeBlobUtil.ios.previewDocument(dest);
}

/** Fetch whatever `path` serves as a PDF (file or `{ pdfUrl }`) and open it. */
export async function openPdfEndpoint(path: string, name: string): Promise<void> {
  const filename = pdfFilename(name);
  const source = await resolvePdfEndpoint(path, filename);
  if (source.kind === 'url') await downloadAndOpenUrl(source.url, filename);
  else await openCachedPdf(source.path, filename);
}

/** Open an invoice's PDF (a 409 from the server reads "not yet generated"). */
export const openInvoicePdf = (invoiceId: string, number?: string) =>
  openPdfEndpoint(`/retailer/invoices/${encodeURIComponent(invoiceId)}/pdf`, number || invoiceId);

/** Open a billing statement's PDF. */
export const openBillingStatementPdf = (statementId: string, period?: string) =>
  openPdfEndpoint(
    `/retailer/billing-statements/${encodeURIComponent(statementId)}/pdf`,
    period ? `statement-${period}` : `statement-${statementId}`,
  );

/** Open a PDF that already has a hosted URL (credit notes, payout statements). */
export const openPdfUrl = (url: string, name: string) =>
  downloadAndOpenUrl(url, pdfFilename(name));

/** Open the GST tax invoice for an online order (errors if none is issued yet). */
export async function openOrderInvoice(orderId: string): Promise<void> {
  const invoices = await listOrderInvoices(orderId);
  const inv = invoices[0];
  if (!inv) throw new Error('No tax invoice has been issued for this order yet.');
  await openInvoicePdf(inv.id, inv.number);
}

/** Counter-sale invoices come back as a hosted PDF link: just open it. */
export async function openHostedPdf(pdfUrl: string): Promise<void> {
  await Linking.openURL(pdfUrl);
}
