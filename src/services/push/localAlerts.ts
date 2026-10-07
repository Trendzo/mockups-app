/**
 * In-app new-order alert: while the app is open the 15 s poll notices a freshly routed order and
 * (besides haptic + toast) rings it through Notifee, so a retailer who has the app open but is not
 * looking at the screen still hears it. De-duplicated against the FCM foreground handler through the
 * shared alert registry, so one order never rings twice.
 */
import type { AlertRegistry } from './alertRegistry';
import { newOrderNotification, newOrdersSummaryNotification } from './payload';
import type { LocalNotification } from './types';

export interface FreshOrder {
  id: string;
  itemCount: number;
  grandTotalPaise: number;
  /** ISO time the order was placed (used to tell "just arrived" from "arrived while the app was closed"). */
  placedAt?: string | null;
}

/**
 * An order older than this when the poll first sees it arrived while the app was backgrounded or
 * suspended (the 15 s poll sees live orders within seconds). With phone push registered, the OS
 * already alerted for it, so ringing again on return would be a second alert for the same order.
 */
export const ALREADY_PUSHED_AFTER_MS = 60_000;

export function createOrderAlerter(deps: {
  alerts: AlertRegistry;
  show: (n: LocalNotification) => Promise<boolean>;
  formatTotal: (paise: number) => string;
  /** Phone push is registered for this session. Defaults to false (always ring). */
  isPushActive?: () => boolean;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  const alreadyPushed = (o: FreshOrder): boolean => {
    if (!deps.isPushActive?.() || !o.placedAt) return false;
    const placed = Date.parse(o.placedAt);
    return Number.isFinite(placed) && now() - placed > ALREADY_PUSHED_AFTER_MS;
  };
  /** Ring for orders nobody has announced yet. Resolves true when a notification was shown. */
  return async function alertNewOrders(fresh: FreshOrder[]): Promise<boolean> {
    // Orders the OS tray already announced (push active, order older than a poll) are claimed so nothing
    // else rings for them, but they do not ring again.
    const unannounced = fresh.filter((o) => {
      if (alreadyPushed(o)) {
        deps.alerts.claim(o.id);
        return false;
      }
      return deps.alerts.claim(o.id);
    });
    if (!unannounced.length) return false;
    const first = unannounced[0];
    const n =
      unannounced.length === 1 && first
        ? newOrderNotification({
            id: first.id,
            itemCount: first.itemCount,
            grandTotalLabel: deps.formatTotal(first.grandTotalPaise),
          })
        : newOrdersSummaryNotification(unannounced.length);
    return deps.show({ ...n, channelId: 'orders' });
  };
}
