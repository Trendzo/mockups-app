import ReactNativeBlobUtil from 'react-native-blob-util';
import { Platform } from 'react-native';
import { useSettings } from '../store/settings';
import { useAuth } from '../store/auth';

export type CatalogExportKind = 'products' | 'inventory';

/** Optional filters passed through so the file matches the on-screen view. */
export interface CatalogExportFilters {
  status?: string; // draft | active | retired | taken_down
  categoryId?: string;
  q?: string; // inventory search
  flag?: string; // inventory: low | out | oversold | in_stock | all
}

interface DownloadOptions {
  filters?: CatalogExportFilters;
  /** 0..1 while downloading (iOS reports real progress; Android is indeterminate). */
  onProgress?: (fraction: number) => void;
}

// Real, deployed closetx endpoints. Both stream a CSV file; on error the body is
// the usual JSON envelope { success, error }.
const PATHS: Record<CatalogExportKind, string> = {
  products: '/retailer/listings/export',
  inventory: '/retailer/inventory/export',
};

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Download a catalog CSV directly to the device — no share/preview popup.
 * - Android: saves to the public Downloads folder (system completion notification).
 * - iOS: saves into the app's Documents folder (browsable in Files › Trendzo).
 * Resolves once the file is written.
 */
export async function downloadCatalogCsv(
  kind: CatalogExportKind,
  { filters = {}, onProgress }: DownloadOptions = {},
): Promise<{ location: 'downloads' | 'files'; filename: string }> {
  const base = useSettings.getState().baseUrl.replace(/\/+$/, '');
  const token = useAuth.getState().token;
  if (!token) throw new Error('Please sign in again.');

  const params: string[] = [];
  for (const [k, v] of Object.entries(filters)) {
    if (v) params.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  const url = `${base}${PATHS[kind]}${params.length ? `?${params.join('&')}` : ''}`;
  const headers = { Authorization: `Bearer ${token}` };
  const filename = `${kind}-${stamp()}.csv`;
  const { fs } = ReactNativeBlobUtil;

  if (Platform.OS === 'android') {
    const res = await ReactNativeBlobUtil.config({
      addAndroidDownloads: {
        useDownloadManager: true,
        notification: true,
        title: filename,
        description: 'Trendzo catalog export',
        mime: 'text/csv',
        mediaScannable: true,
        path: `${fs.dirs.DownloadDir}/${filename}`,
      },
    }).fetch('GET', url, headers);
    if (!(await fs.exists(res.path()))) throw new Error('Download failed.');
    return { location: 'downloads', filename };
  }

  // iOS: download straight into Documents (no share sheet), reporting progress.
  const dest = `${fs.dirs.DocumentDir}/${filename}`;
  if (await fs.exists(dest)) await fs.unlink(dest);

  const task = ReactNativeBlobUtil.config({ path: dest }).fetch('GET', url, headers);
  task.progress((received, total) => {
    const t = Number(total);
    if (onProgress && t > 0) onProgress(Math.min(1, Number(received) / t));
  });

  const res = await task;
  const status = res.info().status ?? 0;
  if (status >= 400) {
    let message = `Export failed (${status}).`;
    try {
      const parsed = JSON.parse(await res.text());
      message = parsed?.error?.message ?? parsed?.error ?? message;
    } catch {
      // non-JSON body — keep the generic message
    }
    await fs.unlink(dest).catch(() => {});
    throw new Error(message);
  }
  onProgress?.(1);
  return { location: 'files', filename };
}
