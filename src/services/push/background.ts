/**
 * Background / quit-state push handling. `registerPushBackgroundHandlers()` is called at the top
 * level of index.js (before AppRegistry.registerComponent) because both libraries need their
 * handlers registered while the JS bundle loads, not after a component mounts.
 *
 *  - FCM background handler: a data-only push (no `notification` block) is turned into a Notifee
 *    notification so it still rings. Pushes WITH a notification block are drawn by the OS tray itself
 *    (on the channel the backend names), so they are left alone to avoid a double notification.
 *  - Notifee background press: a tap on a notification this app displayed itself routes through the
 *    same navigation router as every other tap (parked until the navigator exists).
 *
 * Everything is wrapped: a missing Firebase config or native module must never break app start.
 */
import { loadMessaging, loadNotifee } from './clients';
import { openFromPush } from './navigation';
import { navDataOf, parsePush } from './payload';
import type { RemoteMessageLike } from './types';

export async function handleBackgroundMessage(message: RemoteMessageLike): Promise<void> {
  const push = parsePush(message);
  if (push.hasNotificationBlock) return; // the OS already shows it
  if (!push.title && !push.body) return; // silent data push (nothing to show)
  const notifee = loadNotifee();
  if (!notifee) return;
  await notifee.ensureChannels();
  await notifee.display({
    id: push.isNewOrder && push.orderId ? `order-new-${push.orderId}` : `push-${push.messageId ?? Date.now()}`,
    title: push.title || 'Trendzo Retailer',
    body: push.body,
    channelId: push.channelId,
    data: navDataOf(push),
  });
}

export function registerPushBackgroundHandlers(): void {
  try {
    loadMessaging().client?.setBackgroundMessageHandler(async (message) => {
      try {
        await handleBackgroundMessage(message);
      } catch {
        // never reject into the headless task runner
      }
    });
  } catch {
    // Firebase not available in this build
  }
  try {
    loadNotifee()?.onBackgroundPress((nav) => openFromPush(nav));
  } catch {
    // Notifee not available in this build
  }
}
