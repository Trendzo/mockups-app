import { Linking, PermissionsAndroid, Platform } from 'react-native';
import { Camera } from 'react-native-vision-camera';

export type PermissionOutcome = 'granted' | 'denied' | 'blocked';

/** Camera permission for the vision-camera preview (§5.2). */
export async function ensureCameraPermission(): Promise<PermissionOutcome> {
  // getCameraPermissionStatus is synchronous in vision-camera v4.
  const status = Camera.getCameraPermissionStatus();
  if (status === 'granted') return 'granted';

  // Do NOT gate the request on 'not-determined'. On Android vision-camera maps a
  // never-asked permission to 'denied' (shouldShowRationale is false until the
  // first denial), so gating on 'not-determined' meant we never prompted on the
  // very first tap and sent the user straight to Settings. Instead always call
  // request(): the OS shows the system dialog when it still can (first ask, or a
  // soft Android re-ask) and returns immediately without a dialog when it can't
  // (iOS after deny, Android "don't ask again"). Requesting is idempotent.
  const requested = await Camera.requestCameraPermission();
  if (requested === 'granted') return 'granted';

  // Re-read: if the OS would still prompt next time (Android soft-deny surfaces
  // as 'not-determined' once rationale is true) report 'denied' so we retry the
  // prompt later; otherwise it's truly blocked → the "Open Settings" path.
  return Camera.getCameraPermissionStatus() === 'not-determined' ? 'denied' : 'blocked';
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
