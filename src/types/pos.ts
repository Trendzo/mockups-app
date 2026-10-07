/** POS scan → register types (mirror of the backend pos shapes). */

/** A product row resolved from a scanned QR/code - enough to render the confirm card. */
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

// ---- Counter billing (in-app register). Money is integer paise. ----

export type PosTenderMethod = 'cash' | 'card' | 'upi';

export const TENDER_LABEL: Record<PosTenderMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
};

/** GET /retailer/pos/lookup?q= — `exact` is set for a barcode/SKU hit. */
export interface PosLookupResponse {
  exact: PosLookupRow | null;
  results: PosLookupRow[];
}

export interface PosBillLine {
  variantId: string;
  qty: number;
  lineDiscountPaise: number;
}

/** Prices are tax-inclusive (MRP); the server splits out GST. */
export interface PosQuoteRequest {
  lines: PosBillLine[];
  billDiscountPaise?: number;
  pricingMode: 'tax_inclusive';
}

/** POST /retailer/pos/quote — the bill totals (intra-state: CGST + SGST). */
export interface PosQuote {
  itemsGrossPaise: number;
  lineDiscountPaise: number;
  billDiscountPaise?: number;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise?: number;
  roundOffPaise: number;
  payablePaise: number;
}

/** Walk-in = `{}`. GSTIN (B2B invoice) is upper-cased. */
export interface PosCustomerInput {
  phone?: string;
  name?: string;
  gstin?: string;
}

/** One payment leg. Only cash may be over-tendered (change = tendered − amount). */
export interface PosTender {
  method: PosTenderMethod;
  amountPaise: number;
  tenderedPaise: number;
}

export interface PosCreateSaleRequest {
  idempotencyKey: string;
  /** Set when the cart was resumed from a held bill. */
  holdSaleId?: string;
  customer: PosCustomerInput;
  pricingMode: 'tax_inclusive';
  billDiscountPaise: number;
  lines: PosBillLine[];
  tenders: PosTender[];
}

export interface PosSaleCreated {
  saleId: string;
  invoiceNumber: string;
  payablePaise: number;
  changePaise: number;
  alreadyExisted: boolean;
}

export type PosHoldRequest = Omit<PosCreateSaleRequest, 'holdSaleId' | 'tenders'>;

/** GET /retailer/pos/held */
export interface PosHeldRow {
  id: string;
  customerName: string | null;
  itemCount: number;
  note?: string | null;
  payablePaise: number;
}

/** GET /retailer/pos/customers?phone= (last 10 digits). */
export interface PosCustomer {
  name?: string | null;
  phone?: string | null;
  gstin?: string | null;
}

/** Status pill for a counter sale (history rows and the receipt). */
export function posSaleBadge(sale: { status: string; isReturn?: boolean }): {
  label: string;
  tone: 'success' | 'danger' | 'warning' | 'pending';
} {
  if (sale.status === 'voided') return { label: 'Voided', tone: 'danger' };
  if (sale.isReturn) return { label: 'Return', tone: 'warning' };
  if (sale.status === 'completed') return { label: 'Paid', tone: 'success' };
  return { label: sale.status.replace(/_/g, ' '), tone: 'pending' };
}

/** GET /retailer/pos/sales row. */
export interface PosSaleRow {
  id: string;
  invoiceNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  completedAt: string | null;
  payablePaise: number;
  status: 'completed' | 'voided' | string;
  isReturn: boolean;
}

export interface PosSaleItem {
  id: string;
  variantId: string;
  listingId: string;
  listingNameSnap: string;
  brandSnap: string | null;
  attributesLabelSnap: string;
  skuSnap: string | null;
  hsnSnap: string | null;
  qty: number;
  unitMrpPaise: number;
  lineDiscountPaise: number;
  taxableValuePaise: number;
  /** GST rate in basis points (1200 = 12%). */
  gstRateBp: number;
  gstPaise: number;
  netLinePaise: number;
}

export interface PosSalePayment {
  id: string;
  method: PosTenderMethod;
  amountPaise: number;
  direction: 'collect' | 'refund';
}

/** GET /retailer/pos/sales/:id — also how a held bill is loaded back. */
export interface PosSaleDetail {
  id: string;
  status: 'completed' | 'voided' | 'held' | string;
  /** Set on return/exchange documents. */
  originalSaleId?: string | null;
  completedAt: string | null;
  invoice: { invoiceNumber: string } | null;
  storeLegalNameSnap: string;
  storeAddressSnap: string;
  storeGstinSnap: string;
  customerNameSnap: string | null;
  customerPhoneSnap: string | null;
  customerGstinSnap: string | null;
  billDiscountPaise: number;
  taxableValuePaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  roundOffPaise: number;
  payablePaise: number;
  changePaise: number;
  items: PosSaleItem[];
  payments: PosSalePayment[];
  returnLines?: { qty: number; refundPaise: number }[];
}

export interface PosDaySession {
  status: 'open' | 'closed';
  openingFloatPaise: number;
  expectedCashPaise?: number | null;
  countedCashPaise?: number | null;
  cashVariancePaise?: number | null;
  closedAt?: string | null;
}

/** GET /retailer/pos/summary?date=YYYY-MM-DD (IST day). */
export interface PosDaySummary {
  session: PosDaySession | null;
  expectedCashPaise: number;
  cashCollectedPaise: number;
  cashRefundedPaise: number;
  grossPayablePaise: number;
  netSalesPaise: number;
  refundsPaise: number;
  taxableValuePaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  saleCount: number;
  itemCount: number;
  avgSalePaise: number;
  avgBasketItems: number;
  discountsPaise: number;
  changeGivenPaise: number;
  roundOffPaise: number;
  returnCount: number;
  exchangeCount: number;
  voidCount: number;
  voidedPaise: number;
  hourly: { hour: number; revenuePaise: number }[];
  byTenderNet: Partial<Record<PosTenderMethod, { net: number }>>;
  topProducts: { name: string; qty: number; revenuePaise: number }[];
  byCashier: { name: string | null; revenuePaise: number; saleCount: number }[];
}
