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
}

export function createOrderAlerter(deps: {
  alerts: AlertRegistry;
  show: (n: LocalNotification) => Promise<boolean>;
  formatTotal: (paise: number) => string;
}) {
  /** Ring for orders nobody has announced yet. Resolves true when a notification was shown. */
  return async function alertNewOrders(fresh: FreshOrder[]): Promise<boolean> {
    const unannounced = fresh.filter((o) => deps.alerts.claim(o.id));
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
