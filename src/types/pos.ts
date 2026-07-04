/** POS scan → register types (mirror of the backend pos shapes). */

/** A product row resolved from a scanned QR/code — enough to render the confirm card. */
export interface PosLookupRow {
  variantId: string;
  listingId: string;
  name: string;
  brand: string | null;
  attributesLabel: string;
  sku: string | null;
  barcode: string | null;
  hsn: string | null;
  pricePaise: number;
  compareAtPaise: number | null;
  availableQty: number;
  imageUrl: string | null;
}

/** A connected web-portal Register instance the scan can be sent to. */
export interface RegisterInfo {
  id: string;
  label: string;
  connectedAt: number;
}

/** Target value meaning "every open register for this store". */
export const TARGET_ALL = 'all';
