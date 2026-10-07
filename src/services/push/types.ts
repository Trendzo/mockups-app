/**
 * Shared shapes for the phone-push stack (FCM + Notifee). Kept free of any native import so
 * the pure logic (payload parsing, de-dup, registration ledger) loads under plain node.
 */

export type PushPlatform = 'ios' | 'android';

/**
 * OS notification permission as the app sees it.
 *  - granted        notifications may be shown
 *  - denied         the user (or the OS) turned them off
 *  - not_determined iOS before the first prompt
 *  - unavailable    the push native modules are not part of this build
 */
export type PermissionState = 'granted' | 'denied' | 'not_determined' | 'unavailable';

/** Android channel ids (created at startup; the backend names them in `android.notification.channelId`). */
export type ChannelId = 'orders' | 'general';

/** The slice of an FCM RemoteMessage the app reads (all `data` values are strings on the wire). */
export interface RemoteMessageLike {
  messageId?: string;
  data?: Record<string, unknown> | null;
  notification?: {
    title?: string;
    body?: string;
    android?: { channelId?: string } | null;
  } | null;
}

/** What a tap on a notification carries (FCM data keys, plus the title/body for the inbox fallback). */
export interface PushNavData {
  kind?: string;
  deepLink?: string | null;
  orderId?: string | null;
}

/** A message normalised to the app's push convention (`kind`, `deepLink`, `orderId?`). */
export interface ParsedPush {
  kind: string;
  deepLink: string | null;
  orderId: string | null;
  title: string;
  body: string;
  channelId: ChannelId;
  messageId: string | null;
  /** True when the message is a "new order needs accepting" alert. */
  isNewOrder: boolean;
  /** True when the message carries a `notification` block (the OS tray shows it on its own while backgrounded). */
  hasNotificationBlock: boolean;
}

/** A notification the app shows itself through Notifee. */
export interface LocalNotification {
  /** Stable id: re-showing the same id updates in place instead of stacking. */
  id: string;
  title: string;
  body: string;
  channelId: ChannelId;
  data: Record<string, string>;
}
