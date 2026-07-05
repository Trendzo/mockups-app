import { Linking, PermissionsAndroid, Platform } from 'react-native';
import { Camera } from 'react-native-vision-camera';

export type PermissionOutcome = 'granted' | 'denied' | 'blocked';

/** Camera permission for the vision-camera preview (§5.2). */
export async function ensureCameraPermission(): Promise<PermissionOutcome> {
  // getCameraPermissionStatus is synchronous in vision-camera v4.
  let status = Camera.getCameraPermissionStatus();
  if (status === 'granted') return 'granted';

  // Only 'not-determined' can still show the system prompt; a prior denial won't.
  if (status === 'not-determined') {
    const requested = await Camera.requestCameraPermission();
    if (requested === 'granted') return 'granted';
    status = Camera.getCameraPermissionStatus(); // re-read the real status after the prompt
  }

  // 'denied' / 'restricted' → the OS won't prompt again; the user must enable it
  // in Settings. Report 'blocked' so the screen shows the "Open Settings" path
  // instead of getting stuck on "Requesting camera…".
  return status === 'not-determined' ? 'denied' : 'blocked';
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
