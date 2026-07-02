import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

const options = { enableVibrateFallback: true, ignoreAndroidSystemSettings: false };

type Kind =
  | 'selection'
  | 'impactLight'
  | 'impactMedium'
  | 'impactHeavy'
  | 'notificationSuccess'
  | 'notificationWarning'
  | 'notificationError';

/** Thin, safe wrapper — never throws if the native module is unavailable. */
export function haptic(kind: Kind = 'impactLight'): void {
  try {
    ReactNativeHapticFeedback.trigger(kind, options);
  } catch {
    // no-op
  }
}

export const Haptics = {
  select: () => haptic('selection'),
  tap: () => haptic('impactLight'),
  press: () => haptic('impactMedium'),
  shutter: () => haptic('impactHeavy'),
  success: () => haptic('notificationSuccess'),
  warn: () => haptic('notificationWarning'),
  error: () => haptic('notificationError'),
};
