import { Platform, Share } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { useAuth } from '../store/auth';
import { useSettings } from '../store/settings';

/**
 * Counter-sale invoice PDFs. The server stores the GST invoice as a hosted PDF and hands back its link
 * (`pdfUrl`, e.g. on the media store) — these helpers download it so it can be printed ("Print
 * invoice") or opened / shared ("Share PDF"). Native-backed (react-native-blob-util), so not covered by
 * unit tests; exercised on a device.
 */

/** "INV/2026-27/0012" → "INV-2026-27-0012.pdf" (safe for any file system). */
export function pdfFileName(invoiceNumber: string | null | undefined): string {
  const base = (invoiceNumber ?? '').trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base || 'invoice'}.pdf`;
}

/** Is `url` served by our own API (so it may carry the login token)? Third-party storage never gets it. */
export function isOwnApiUrl(url: string, base: string): boolean {
  // Not `new URL().origin`: React Native's URL polyfill throws "not implemented" for it.
  const origin = (u: string) => /^(https?:\/\/[^/?#]+)/i.exec(u.trim())?.[1]?.toLowerCase();
  const o = origin(url);
  return !!o && o === origin(base);
}

function authHeadersFor(pdfUrl: string): Record<string, string> {
  const base = useSettings.getState().baseUrl;
  const token = useAuth.getState().token;
  return token && isOwnApiUrl(pdfUrl, base) ? { Authorization: `Bearer ${token}` } : {};
}

async function assertOk(res: { info(): { status?: number }; path(): string }, dest: string): Promise<void> {
  const status = res.info().status ?? 0;
  if (status >= 400 || status === 0) {
    await ReactNativeBlobUtil.fs.unlink(dest).catch(() => {});
    throw new Error(`Couldn’t download the invoice (${status || 'no response'}).`);
  }
}

/**
 * Download the PDF into the app's private cache and return its plain absolute path (what
 * `printPdfFile` needs — no `file://`).
 */
export async function downloadPdfToCache(pdfUrl: string, filename: string): Promise<string> {
  const { fs } = ReactNativeBlobUtil;
  const dest = `${fs.dirs.CacheDir}/${filename}`;
  if (await fs.exists(dest)) await fs.unlink(dest);
  const res = await ReactNativeBlobUtil.config({ path: dest }).fetch('GET', pdfUrl, authHeadersFor(pdfUrl));
  await assertOk(res, dest);
  return res.path();
}

/**
 * Save the PDF where the user can find it and open it so it can be sent on.
 *  - Android: into Downloads (with the system notification), then the PDF viewer opens — it has its own
 *    Share action. Same mechanism as the order-invoice download.
 *  - iOS: into the app's Documents, then the system share sheet.
 */
export async function savePdfAndOpen(pdfUrl: string, filename: string): Promise<void> {
  const { fs } = ReactNativeBlobUtil;
  const headers = authHeadersFor(pdfUrl);

  if (Platform.OS === 'android') {
    const dest = `${fs.dirs.DownloadDir}/${filename}`;
    const res = await ReactNativeBlobUtil.config({
      addAndroidDownloads: {
        useDownloadManager: true,
        notification: true,
        title: filename,
        description: 'Trendzo tax invoice',
        mime: 'application/pdf',
        mediaScannable: true,
        path: dest,
      },
    }).fetch('GET', pdfUrl, headers);
    if (!(await fs.exists(res.path()))) throw new Error('Download failed.');
    await ReactNativeBlobUtil.android.actionViewIntent(res.path(), 'application/pdf').catch(() => {});
    return;
  }

  const dest = `${fs.dirs.DocumentDir}/${filename}`;
  if (await fs.exists(dest)) await fs.unlink(dest);
  const res = await ReactNativeBlobUtil.config({ path: dest }).fetch('GET', pdfUrl, headers);
  await assertOk(res, dest);
  await Share.share({ url: `file://${res.path()}` });
}
