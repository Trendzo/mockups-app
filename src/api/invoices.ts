import ReactNativeBlobUtil from 'react-native-blob-util';
import { Linking, Platform } from 'react-native';
import { useSettings } from '../store/settings';
import { useAuth } from '../store/auth';
import { listOrderInvoices } from './orders';

/**
 * Download an authenticated PDF and open it in the system viewer. The invoice
 * PDF endpoint streams raw bytes (no JSON envelope), so it goes through
 * blob-util like the CSV exports, not axios.
 *  - Android: saved to Downloads (with the system notification), then opened.
 *  - iOS: saved to the app's Documents (Files › Trendzo), then previewed.
 */
async function downloadAndOpenPdf(path: string, filename: string): Promise<void> {
  const base = useSettings.getState().baseUrl.replace(/\/+$/, '');
  const token = useAuth.getState().token;
  if (!token) throw new Error('Please sign in again.');
  const url = `${base}${path}`;
  const headers = { Authorization: `Bearer ${token}` };
  const safe = filename.replace(/[^A-Za-z0-9._-]+/g, '-');
  const { fs } = ReactNativeBlobUtil;

  if (Platform.OS === 'android') {
    const dest = `${fs.dirs.DownloadDir}/${safe}`;
    const res = await ReactNativeBlobUtil.config({
      addAndroidDownloads: {
        useDownloadManager: true,
        notification: true,
        title: safe,
        description: 'Trendzo tax invoice',
        mime: 'application/pdf',
        mediaScannable: true,
        path: dest,
      },
    }).fetch('GET', url, headers);
    if (!(await fs.exists(res.path()))) throw new Error('Download failed.');
    await ReactNativeBlobUtil.android.actionViewIntent(res.path(), 'application/pdf').catch(() => {});
    return;
  }

  const dest = `${fs.dirs.DocumentDir}/${safe}`;
  if (await fs.exists(dest)) await fs.unlink(dest);
  const res = await ReactNativeBlobUtil.config({ path: dest }).fetch('GET', url, headers);
  const status = res.info().status ?? 0;
  if (status >= 400) {
    let message = `Invoice download failed (${status}).`;
    try {
      const parsed = JSON.parse(await res.text());
      message = parsed?.error?.message ?? message;
    } catch {
      // non-JSON body — keep the generic message
    }
    await fs.unlink(dest).catch(() => {});
    throw new Error(message);
  }
  ReactNativeBlobUtil.ios.previewDocument(dest);
}

/** Open the GST tax invoice for an online order (errors if none is issued yet). */
export async function openOrderInvoice(orderId: string): Promise<void> {
  const invoices = await listOrderInvoices(orderId);
  const inv = invoices[0];
  if (!inv) throw new Error('No tax invoice has been issued for this order yet.');
  await downloadAndOpenPdf(
    `/retailer/invoices/${encodeURIComponent(inv.id)}/pdf`,
    `${inv.number || inv.id}.pdf`,
  );
}

/** Counter-sale invoices come back as a hosted PDF link — just open it. */
export async function openHostedPdf(pdfUrl: string): Promise<void> {
  await Linking.openURL(pdfUrl);
}
