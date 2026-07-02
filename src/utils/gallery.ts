import { Platform, Share } from 'react-native';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import ReactNativeBlobUtil from 'react-native-blob-util';

/**
 * Download a remote image to a temp file, save it to the camera roll, then
 * clean up. CameraRoll on Android only accepts local URIs, so we always fetch
 * to disk first (§5.6 "Save to Gallery").
 */
export async function saveRemoteImage(url: string): Promise<void> {
  const ext = (url.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
  const safeExt = ['png', 'jpg', 'jpeg', 'webp'].includes(ext) ? ext : 'jpg';
  const dir = ReactNativeBlobUtil.fs.dirs.CacheDir;
  const path = `${dir}/trenzo_${Date.now()}.${safeExt}`;

  const res = await ReactNativeBlobUtil.config({ path, fileCache: true }).fetch(
    'GET',
    url,
  );
  const localPath = res.path();
  const fileUri = Platform.OS === 'android' ? `file://${localPath}` : localPath;

  try {
    await CameraRoll.save(fileUri, { type: 'photo', album: 'Trenzo' });
  } finally {
    ReactNativeBlobUtil.fs.unlink(localPath).catch(() => {});
  }
}

/** Share a remote image via the OS share sheet. */
export async function shareRemoteImage(url: string): Promise<void> {
  await Share.share({
    url, // iOS uses url; Android falls back to message
    message: Platform.OS === 'android' ? url : undefined,
  });
}
