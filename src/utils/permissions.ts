import { Linking, PermissionsAndroid, Platform } from 'react-native';
import { Camera } from 'react-native-vision-camera';

export type PermissionOutcome = 'granted' | 'denied' | 'blocked';

/** Camera permission for the vision-camera preview (§5.2). */
export async function ensureCameraPermission(): Promise<PermissionOutcome> {
  const status = await Camera.getCameraPermissionStatus();
  if (status === 'granted') return 'granted';
  const requested = await Camera.requestCameraPermission();
  if (requested === 'granted') return 'granted';
  // vision-camera returns 'denied' for both soft and hard denials on some OS
  return status === 'denied' ? 'blocked' : 'denied';
}

/**
 * Photo-library write permission (Android only; iOS add-to-library is handled
 * by CameraRoll at save time). Needed so "Save to Gallery" works on Android.
 */
export async function ensurePhotoAddPermission(): Promise<PermissionOutcome> {
  if (Platform.OS !== 'android') return 'granted';
  // API 33+ scoped media; older needs WRITE_EXTERNAL_STORAGE.
  const perm =
    Platform.Version >= 33
      ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
      : PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE;
  const result = await PermissionsAndroid.request(perm);
  if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
  return 'denied';
}

export function openAppSettings() {
  Linking.openSettings().catch(() => {});
}
