import { useEffect, useRef } from 'react';
import { useToast } from '../components/Toast';
import { OrderRow } from '../types/orders';
import { formatPaise } from './money';
import { plural } from './format';
import { Haptics } from './haptics';

/**
 * Buzz + toast when a new order (status `routing`) appears between polls of
 * the live board. The first load only seeds what's already there, so opening
 * the app doesn't alert for orders the retailer has seen.
 */
export function useNewOrderAlerts(orders?: OrderRow[]) {
  const toast = useToast();
  const seen = useRef<Set<string> | null>(null);

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
  }, [orders, toast]);
}
