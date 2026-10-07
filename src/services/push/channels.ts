/**
 * Android notification channels and the small-icon resources. Plain data (no Notifee import) so it
 * is trivially testable; `importance` uses Notifee's AndroidImportance numeric values (DEFAULT 3, HIGH 4).
 *
 * The channel ids are part of the backend contract: new-order pushes must name `orders`
 * (android.notification.channelId) so they ring on the loud channel while the app is closed.
 * AndroidManifest's default channel (com.google.firebase.messaging.default_notification_channel_id)
 * is `general`, used when a push names none.
 */
import { ChannelId } from './types';

export interface ChannelSpec {
  id: ChannelId;
  name: string;
  description: string;
  importance: 3 | 4;
  sound: 'default';
  vibration: boolean;
  vibrationPattern?: number[];
}

export const CHANNELS: readonly ChannelSpec[] = [
  {
    id: 'orders',
    name: 'New orders',
    description: 'Rings when a customer places an order and when an order needs your attention.',
    importance: 4,
    sound: 'default',
    vibration: true,
    vibrationPattern: [300, 500, 300, 500],
  },
  {
    id: 'general',
    name: 'Updates',
    description: 'Payouts, store verification, returns and messages from Trendzo.',
    importance: 3,
    sound: 'default',
    vibration: true,
  },
];

/** res/drawable/ic_stat_notification.xml: monochrome status-bar glyph (the launcher icon would render as a white square). */
export const ANDROID_SMALL_ICON = 'ic_stat_notification';
/** Matches colors.accent in the theme and res/values/colors.xml notification_accent. */
export const ANDROID_ACCENT = '#0A0A0A';
