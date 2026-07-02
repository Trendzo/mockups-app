/**
 * Image upload helpers. Every image is compressed/resized client-side before
 * upload so it stays well under the backend's 15MB cap (§4.2). Uses
 * react-native-compressor (New-Arch compatible) with a graceful fallback to the
 * raw file if compression fails.
 */
import { Image as ImageCompressor } from 'react-native-compressor';

/** A file ready to append to FormData in React Native. */
export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}

const EXT_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
};

export function inferMimeType(uriOrName: string): string {
  const ext = uriOrName.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? 'application/octet-stream';
}

function fileNameFromUri(uri: string, fallbackExt = 'jpg'): string {
  const clean = uri.split('?')[0];
  const base = clean.split('/').pop();
  if (base && base.includes('.')) return base;
  return `upload_${Date.now()}.${fallbackExt}`;
}

/** Max upload size accepted by the backend (§4.2). */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/**
 * Compress + resize a local image and return an upload descriptor. Caps the
 * longest edge at 1600px and re-encodes as JPEG (~quality 0.7), which keeps
 * even 12MP phone captures comfortably under a megabyte. Falls back to the raw
 * file if the native compressor throws.
 */
export async function prepareUpload(uri: string): Promise<UploadFile> {
  try {
    const outUri = await ImageCompressor.compress(uri, {
      maxWidth: 1600,
      maxHeight: 1600,
      quality: 0.7,
      compressionMethod: 'manual',
      output: 'jpg',
    });
    return {
      uri: outUri,
      name: fileNameFromUri(outUri, 'jpg'),
      type: 'image/jpeg',
    };
  } catch {
    return { uri, name: fileNameFromUri(uri), type: inferMimeType(uri) };
  }
}

/** Build the RN FormData file descriptor from an UploadFile. */
export function toFormFile(file: UploadFile): UploadFile {
  return { uri: file.uri, name: file.name, type: file.type };
}
