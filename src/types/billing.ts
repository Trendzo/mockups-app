// In-app billing (point-of-sale). Money is integer paise everywhere, matching
// the catalog. A bill is assembled client-side from inventory rows and finalized
// into an Invoice; there is no server billing endpoint in the MVP.

export type PaymentMethod = 'cash' | 'upi' | 'card';

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
};

/** One line in the bill. Keyed by variantId in the cart. */
export interface CartItem {
  variantId: string;
  listingId: string;
  name: string; // listing name
  attributesLabel: string; // e.g. "Red / M"
  sku?: string | null;
  pricePaise: number; // unit price
  imageUrl?: string | null;
  stock: number; // available units, caps the quantity
  qty: number;
}

/** A finalized bill, generated at checkout and shown on the invoice screen. */
export interface Invoice {
  number: string; // e.g. "INV-20260710-4821"
  createdAt: number; // epoch ms
  storeName?: string;
  items: CartItem[];
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  payment: PaymentMethod;
}
