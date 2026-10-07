import { useEffect, useRef } from 'react';
import { useToast } from '../components/Toast';
import { useNotificationPrefs } from '../api/notifications';
import { alertNewOrders } from '../services/push';
import { OrderRow } from '../types/orders';
import { formatPaise } from './money';
import { plural } from './format';
import { Haptics } from './haptics';

/**
 * Buzz + toast + a local notification (sound, on the loud `orders` channel) when a new order
 * (status `routing`) appears between polls of the live board. The first load only seeds what's
 * already there, so opening the app doesn't alert for orders the retailer has seen.
 *
 * This is also the fallback for phone push: with no Firebase / no device token the app still
 * alerts while it is open. An FCM push that already rang for the same order is de-duplicated by
 * the shared alert registry, so the order is announced once. The local notification honours the
 * "Push notifications" switch in Alert settings (haptic + toast always fire).
 */
export function useNewOrderAlerts(orders?: OrderRow[]) {
  const toast = useToast();
  const seen = useRef<Set<string> | null>(null);
  // Defaults to on until the prefs load; the server default is on as well.
  const pushOn = useNotificationPrefs().data?.pushEnabled !== false;
  const pushOnRef = useRef(pushOn);
  pushOnRef.current = pushOn;

  useEffect(() => {
    if (!orders) return;
    const waiting = orders.filter((o) => o.status === 'routing');
    if (!seen.current) {
      seen.current = new Set(waiting.map((o) => o.id));
      return;
    }
    const fresh = waiting.filter((o) => !seen.current!.has(o.id));
    for (const o of waiting) seen.current.add(o.id);
    if (!fresh.length) return;
    Haptics.warn();
    const first = fresh[0];
    toast.show(
      fresh.length === 1
        ? `New order · ${plural(first.itemCount, 'item')} · ${formatPaise(first.grandTotalPaise)}`
        : `${fresh.length} new orders — accept them now`,
      'info',
    );
    if (pushOnRef.current) void alertNewOrders(fresh);
  }, [orders, toast]);
}
