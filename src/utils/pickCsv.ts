import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import {
  errorCodes,
  isErrorWithCode,
  keepLocalCopy,
  pick,
  types,
} from '@react-native-documents/picker';

/** A CSV with 5,000 rows is well under 2 MB; anything this big is not one. */
const MAX_BYTES = 8 * 1024 * 1024;

export interface PickedCsv {
  name: string;
  text: string;
}

/** "file:///data/user/0/x/My%20file.csv" -> "/data/user/0/x/My file.csv" */
export function localPathFromUri(uri: string): string {
  const noScheme = uri.replace(/^file:\/\//, '');
  try {
    return decodeURIComponent(noScheme);
  } catch {
    return noScheme;
  }
}

/**
 * Open the system file picker for a CSV and return its text, or null when the user
 * backs out. Android pickers label CSVs inconsistently (text/csv, ms-excel,
 * octet-stream...), so the filter is generous and the content is validated by the
 * parser instead.
 */
export async function pickCsvText(): Promise<PickedCsv | null> {
  const csvTypes =
    Platform.OS === 'android'
      ? [types.csv, types.plainText, 'application/csv', 'application/vnd.ms-excel', 'application/octet-stream']
      : [types.csv, types.plainText];

  let picked;
  try {
    [picked] = await pick({ type: csvTypes, mode: 'import', allowMultiSelection: false });
  } catch (e) {
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return null;
    throw e;
  }
  if (!picked) return null;

  const name = picked.name || 'inventory.csv';
  if (picked.error) throw new Error("Couldn't open that file.");
  if (picked.size != null && picked.size > MAX_BYTES) {
    throw new Error('That file is too large to be an inventory CSV.');
  }

  // A content:// uri (Android) is not a path: make a real file in the cache first.
  let readFrom = picked.uri;
  let copied: string | null = null;
  try {
    const [copy] = await keepLocalCopy({
      files: [{ uri: picked.uri, fileName: name }],
      destination: 'cachesDirectory',
    });
    if (copy.status === 'success') {
      readFrom = copy.localUri;
      copied = copy.localUri;
    }
  } catch {
    // Fall through to reading the picked uri directly.
  }

  try {
    const path = localPathFromUri(readFrom);
    const text = readFrom.startsWith('content://')
      ? await (await fetch(readFrom)).text()
      : await ReactNativeBlobUtil.fs.readFile(path, 'utf8');
    return { name, text };
  } catch {
    throw new Error("Couldn't read that file. Try saving it as a .csv and picking it again.");
  } finally {
    if (copied) ReactNativeBlobUtil.fs.unlink(localPathFromUri(copied)).catch(() => {});
  }
}
