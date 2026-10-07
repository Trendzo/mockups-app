/**
 * The real wiring of the push manager: native clients, the HTTP calls, the auth store, AsyncStorage,
 * AppState and the navigation router. Importing this file has no side effects beyond building the
 * (inert) manager; `initPush()` starts it.
 */
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNotificationPrefs } from '../../api/notifications';
import { registerPushToken, revokePushToken } from '../../api/push';
import { queryClient } from '../../api/queryClient';
import { useAuth } from '../../store/auth';
import { formatPaise } from '../../utils/money';
import { orderAlerts } from './alertRegistry';
import { loadMessaging, loadNotifee } from './clients';
import { createOrderAlerter, FreshOrder } from './localAlerts';
import { openFromPush } from './navigation';
import { createPushManager, PushManager } from './pushManager';
import type { PushPlatform } from './types';

const platform: PushPlatform | null =
  Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : null;

export const pushManager: PushManager = createPushManager({
  platform,
  getMessaging: loadMessaging,
  getNotifee: loadNotifee,
  api: { register: registerPushToken, revoke: revokePushToken },
  auth: {
    getToken: () => useAuth.getState().token,
    subscribe: (listener) => useAuth.subscribe((state, prev) => listener(state.token, prev.token)),
  },
  storage: {
    get: (k) => AsyncStorage.getItem(k),
    set: (k, v) => AsyncStorage.setItem(k, v),
  },
  openLink: openFromPush,
  onForeground: (cb) => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') cb();
    });
    return () => sub.remove();
  },
  onForegroundPush: () => {
    // A push means something changed server-side: refresh the bell badge and the order board now.
    void queryClient.invalidateQueries({ queryKey: ['inbox'] });
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
  },
  alerts: orderAlerts,
  // Shares the ['notification-prefs'] cache with the Settings screen and the alert hook, so launch costs
  // at most one GET. Fails open (the manager treats a throw as "on").
  isPushEnabled: async () => {
    const prefs = await queryClient.fetchQuery({
      queryKey: ['notification-prefs'],
      queryFn: getNotificationPrefs,
      staleTime: 5 * 60_000,
      retry: false,
    });
    return prefs.pushEnabled !== false;
  },
});

/** Call once from the app root. Safe to call repeatedly; never throws. */
export const initPush = (): void => pushManager.init();

const announce = createOrderAlerter({
  alerts: orderAlerts,
  show: (n) => pushManager.showLocal(n),
  formatTotal: formatPaise,
  isPushActive: () => pushManager.isRegistered(),
});

/** Ring (Notifee, orders channel) for freshly routed orders seen by the poll. Never throws. */
export async function alertNewOrders(fresh: FreshOrder[]): Promise<boolean> {
  try {
    return await announce(fresh);
  } catch {
    return false;
  }
}
