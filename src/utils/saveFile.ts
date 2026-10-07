import { PermissionsAndroid, Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';

/** A filename that is safe on both file systems ("Dead stock 30d.csv" -> "Dead-stock-30d.csv"). */
export function safeFilename(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'file';
}

export interface SavedFile {
  filename: string;
  /** Where the user can find it. */
  location: 'downloads' | 'files';
}

/**
 * Write generated text (a CSV the app built, or one fetched as text) to a file the
 * user can reach, via react-native-blob-util.
 *  - Android: the public Downloads folder, through MediaStore (no permission on
 *    Android 10+; Android 8-9 asks for the legacy storage permission first).
 *  - iOS: the app's Documents folder (Files > Trendzo), previewed straight away so
 *    the system share sheet is one tap away.
 */
export async function saveTextFile(
  filename: string,
  content: string,
  mime = 'text/csv',
): Promise<SavedFile> {
  const name = safeFilename(filename);
  const { fs } = ReactNativeBlobUtil;

  if (Platform.OS === 'android') {
    if (Number(Platform.Version) < 29) {
      const res = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      );
      if (res !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new Error('Allow storage access to save the file, or try again.');
      }
    }
    const tmp = `${fs.dirs.CacheDir}/${name}`;
    if (await fs.exists(tmp)) await fs.unlink(tmp);
    await fs.writeFile(tmp, content, 'utf8');
    try {
      await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
        { name, parentFolder: '', mimeType: mime },
        'Download',
        tmp,
      );
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
    return { filename: name, location: 'downloads' };
  }

  const dest = `${fs.dirs.DocumentDir}/${name}`;
  if (await fs.exists(dest)) await fs.unlink(dest);
  await fs.writeFile(dest, content, 'utf8');
  ReactNativeBlobUtil.ios.previewDocument(dest);
  return { filename: name, location: 'files' };
}

/** "Saved to Downloads" / "Saved to Files > Trendzo" for a toast. */
export function savedMessage(saved: SavedFile): string {
  return saved.location === 'downloads'
    ? `Saved ${saved.filename} to Downloads`
    : `Saved ${saved.filename} to Files > Trendzo`;
}
