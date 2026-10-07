/**
 * Lazy facades over the two native push libraries. This is the ONLY file that requires
 * `@react-native-firebase/*` and `@notifee/react-native`, and it does so inside functions with a
 * try/catch, so a build without them (or without google-services.json / GoogleService-Info.plist)
 * still starts, logs one reason, and simply has no phone push. Same defensive pattern the driver
 * app uses in fcm.ts.
 */
import { ANDROID_ACCENT, ANDROID_SMALL_ICON, CHANNELS } from './channels';
import { navDataFrom } from './payload';
import type { LocalNotification, PermissionState, PushNavData, RemoteMessageLike } from './types';

export const FIREBASE_NOT_CONFIGURED =
  'Firebase is not configured in this build (android/app/google-services.json or ios GoogleService-Info.plist is missing)';

export interface MessagingClient {
  getToken(): Promise<string | null>;
  deleteToken(): Promise<void>;
  onTokenRefresh(cb: (token: string) => void): () => void;
  onMessage(cb: (message: RemoteMessageLike) => unknown): () => void;
  onNotificationOpenedApp(cb: (message: RemoteMessageLike) => unknown): () => void;
  getInitialNotification(): Promise<RemoteMessageLike | null>;
  setBackgroundMessageHandler(cb: (message: RemoteMessageLike) => Promise<unknown>): void;
  /** Host app version (versionName / CFBundleShortVersionString) when the native side exposes it. */
  appVersion(): string | undefined;
}

export interface NotifeeClient {
  ensureChannels(): Promise<void>;
  display(n: LocalNotification): Promise<void>;
  getPermission(): Promise<PermissionState>;
  requestPermission(): Promise<PermissionState>;
  openSettings(): Promise<void>;
  /** A notification was tapped while the app is open. */
  onForegroundPress(cb: (nav: PushNavData) => void): () => void;
  /** A notification was tapped while the app was in the background / headless. Must be registered at startup. */
  onBackgroundPress(cb: (nav: PushNavData) => void): void;
  /** The notification whose tap cold-started the app, if any. */
  getInitialPress(): Promise<PushNavData | null>;
}

export interface MessagingLoad {
  client: MessagingClient | null;
  reason: string | null;
}

let messagingLoad: MessagingLoad | undefined;
let notifeeLoad: { client: NotifeeClient | null } | undefined;

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */

export function loadMessaging(): MessagingLoad {
  if (messagingLoad) return messagingLoad;
  try {
    const appMod: any = require('@react-native-firebase/app');
    const apps = typeof appMod.getApps === 'function' ? appMod.getApps() : [];
    if (!apps || apps.length === 0) {
      messagingLoad = { client: null, reason: FIREBASE_NOT_CONFIGURED };
      return messagingLoad;
    }
    const m: any = require('@react-native-firebase/messaging');
    const inst = m.getMessaging();
    const client: MessagingClient = {
      getToken: async () => (await m.getToken(inst)) || null,
      deleteToken: () => m.deleteToken(inst),
      onTokenRefresh: (cb) => m.onTokenRefresh(inst, cb),
      onMessage: (cb) => m.onMessage(inst, cb),
      onNotificationOpenedApp: (cb) => m.onNotificationOpenedApp(inst, cb),
      getInitialNotification: () => m.getInitialNotification(inst),
      setBackgroundMessageHandler: (cb) => m.setBackgroundMessageHandler(inst, cb),
      appVersion: () => {
        try {
          return appMod.getUtils?.().appVersion || undefined;
        } catch {
          return undefined;
        }
      },
    };
    messagingLoad = { client, reason: null };
  } catch (e) {
    messagingLoad = {
      client: null,
      reason: `Firebase messaging is unavailable in this build (${(e as Error)?.message ?? 'native module missing'})`,
    };
  }
  return messagingLoad;
}

const toState = (status: number | undefined): PermissionState => {
  // Notifee AuthorizationStatus: NOT_DETERMINED -1, DENIED 0, AUTHORIZED 1, PROVISIONAL 2.
  if (status === 1 || status === 2) return 'granted';
  if (status === -1) return 'not_determined';
  return 'denied';
};

export function loadNotifee(): NotifeeClient | null {
  if (notifeeLoad) return notifeeLoad.client;
  try {
    const mod: any = require('@notifee/react-native');
    const notifee = mod.default;
    const EventType = mod.EventType;
    if (!notifee || typeof notifee.displayNotification !== 'function') throw new Error('notifee not linked');

    const client: NotifeeClient = {
      async ensureChannels() {
        for (const c of CHANNELS) {
          await notifee.createChannel({
            id: c.id,
            name: c.name,
            description: c.description,
            importance: c.importance,
            sound: c.sound,
            vibration: c.vibration,
            ...(c.vibrationPattern ? { vibrationPattern: c.vibrationPattern } : {}),
          });
        }
      },
      async display(n) {
        await notifee.displayNotification({
          id: n.id,
          title: n.title,
          body: n.body,
          data: n.data,
          android: {
            channelId: n.channelId,
            smallIcon: ANDROID_SMALL_ICON,
            color: ANDROID_ACCENT,
            // Tapping launches (or foregrounds) the app; the tap is routed from the data bag.
            pressAction: { id: 'default', launchActivity: 'default' },
            // Re-showing the same id (push + poll for one order) must not ring twice.
            onlyAlertOnce: true,
            autoCancel: true,
          },
          ios: {
            sound: 'default',
            foregroundPresentationOptions: { banner: true, list: true, sound: true, badge: false },
          },
        });
      },
      async getPermission() {
        return toState((await notifee.getNotificationSettings())?.authorizationStatus);
      },
      async requestPermission() {
        return toState((await notifee.requestPermission())?.authorizationStatus);
      },
      openSettings: () => notifee.openNotificationSettings(),
      onForegroundPress(cb) {
        return notifee.onForegroundEvent(({ type, detail }: any) => {
          if (type === EventType.PRESS) cb(navDataFrom(detail?.notification?.data));
        });
      },
      onBackgroundPress(cb) {
        notifee.onBackgroundEvent(async ({ type, detail }: any) => {
          if (type === EventType.PRESS) cb(navDataFrom(detail?.notification?.data));
        });
      },
      async getInitialPress() {
        const initial = await notifee.getInitialNotification();
        return initial?.notification ? navDataFrom(initial.notification.data) : null;
      },
    };
    notifeeLoad = { client };
  } catch {
    notifeeLoad = { client: null };
  }
  return notifeeLoad.client;
}

/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */

/** Test hook: forget the cached native handles. */
export function resetPushClientsForTests(): void {
  messagingLoad = undefined;
  notifeeLoad = undefined;
}
