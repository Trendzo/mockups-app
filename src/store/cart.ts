import { create } from 'zustand';
import { CartItem } from '../types/billing';
import { gstRateForUnitPaise } from '../utils/money';

interface CartState {
  // Keyed by variantId so a scanned/tapped product updates its own line.
  items: Record<string, CartItem>;
  /** Add one unit of a product (or +1 if already in the bill), capped at stock. */
  add: (item: Omit<CartItem, 'qty'>) => void;
  /** Set an explicit quantity; 0 or less removes the line. Capped at stock. */
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
}

/** The in-progress bill. Session-only; cleared after checkout. */
export const useCart = create<CartState>((set) => ({
  items: {},
  add: (item) =>
    set((s) => {
      const existing = s.items[item.variantId];
      const cap = Math.max(1, item.stock || Infinity);
      const qty = Math.min((existing?.qty ?? 0) + 1, cap);
      return { items: { ...s.items, [item.variantId]: { ...item, qty } } };
    }),
  setQty: (variantId, qty) =>
    set((s) => {
      const existing = s.items[variantId];
      if (!existing) return s;
      const next = { ...s.items };
      const capped = Math.min(qty, Math.max(1, existing.stock || Infinity));
      if (capped <= 0) delete next[variantId];
      else next[variantId] = { ...existing, qty: capped };
      return { items: next };
    }),
  remove: (variantId) =>
    set((s) => {
      const next = { ...s.items };
      delete next[variantId];
      return { items: next };
    }),
  clear: () => set({ items: {} }),
}));

/** Bill totals derived from the cart items. Tax uses the per-item GST slab. */
export function billTotals(items: CartItem[]): {
  count: number;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
} {
  let count = 0;
  let subtotalPaise = 0;
  let taxPaise = 0;
  for (const it of items) {
    const line = it.pricePaise * it.qty;
    count += it.qty;
    subtotalPaise += line;
    taxPaise += Math.round(line * gstRateForUnitPaise(it.pricePaise));
  }
  return { count, subtotalPaise, taxPaise, totalPaise: subtotalPaise + taxPaise };
}
