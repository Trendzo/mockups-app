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

/** One priced line of a quote (the server's GST maths, per variant). */
export interface PosQuoteLine {
  variantId: string;
  qty: number;
  lineGrossPaise: number;
  lineDiscountPaise: number;
  /** This line's share of the bill-level discount. */
  billDiscountAllocPaise: number;
  /** GST rate in basis points (1200 = 12%). */
  gstRateBp: number;
  taxableValuePaise: number;
  gstPaise: number;
  netLinePaise: number;
  availableQty: number;
}

/**
 * POST /retailer/pos/quote — the bill totals. The quote takes no customer, so it always prices
 * intra-state (CGST + SGST); a customer GSTIN from another state turns that into IGST on the final
 * sale (same total tax, different split).
 */
export interface PosQuote {
  lines: PosQuoteLine[];
  taxSplitKind?: 'intra_state' | 'inter_state';
  itemsGrossPaise: number;
  lineDiscountPaise: number;
  billDiscountPaise?: number;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise?: number;
  /** Total GST (cgst + sgst + igst). */
  taxPaise: number;
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
  /** Card slip / UPI transaction id (optional, ≤ 120 chars). */
  reference?: string;
}

/** Longest `reference` the server accepts on a tender. */
export const TENDER_REFERENCE_MAX = 120;

/** A tender where the amount applied is all there is (settlement legs of a return / exchange). */
export interface PosSettleTender {
  method: PosTenderMethod;
  amountPaise: number;
  tenderedPaise?: number;
  reference?: string;
}

export interface PosCreateSaleRequest {
  idempotencyKey: string;
  /** Set when the cart was resumed from a held bill. */
  holdSaleId?: string;
  customer: PosCustomerInput;
  pricingMode: 'tax_inclusive';
  billDiscountPaise: number;
  note?: string;
  lines: PosBillLine[];
  tenders: PosTender[];
}

export interface PosSaleCreated {
  saleId: string;
  invoiceId?: string;
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
  heldAt?: string | null;
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
  taxPaise?: number;
  /** Hosted GST invoice PDF; null while it's still being generated (and for returns). */
  pdfUrl?: string | null;
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
  lineGrossPaise?: number;
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
  /** Card slip / UPI transaction id the cashier noted. */
  reference?: string | null;
  tenderedPaise?: number | null;
  changePaise?: number | null;
}

/** One line handed back on a return / exchange document. */
export interface PosReturnLineRow {
  id?: string;
  originalSaleItemId?: string;
  variantId?: string;
  qty: number;
  refundPaise: number;
  restock?: boolean;
}

/** GET /retailer/pos/sales/:id — also how a held bill is loaded back. */
export interface PosSaleDetail {
  id: string;
  status: 'completed' | 'voided' | 'held' | string;
  /** Set on return/exchange documents. */
  originalSaleId?: string | null;
  completedAt: string | null;
  createdAt?: string;
  invoice: { id?: string; invoiceNumber: string; pdfUrl?: string | null } | null;
  storeLegalNameSnap: string;
  storeAddressSnap: string;
  storeGstinSnap: string;
  customerNameSnap: string | null;
  customerPhoneSnap: string | null;
  customerGstinSnap: string | null;
  itemsGrossPaise?: number;
  lineDiscountPaise?: number;
  billDiscountPaise: number;
  taxableValuePaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  /** Non-zero on an inter-state (customer GSTIN from another state) sale. */
  igstPaise?: number;
  roundOffPaise: number;
  payablePaise: number;
  /** Cash handed over across the tenders (≥ payable when change was given). */
  tenderedPaise?: number;
  changePaise: number;
  items: PosSaleItem[];
  payments: PosSalePayment[];
  /**
   * The lines handed back — only present on the return / exchange document itself (not on the
   * sale they were returned against).
   */
  returnLines?: PosReturnLineRow[];
}

/** GET /retailer/pos/sales/:id/invoice */
export interface PosSaleInvoice {
  id: string;
  number: string;
  /** Absent/null while the PDF is still being generated. */
  pdfUrl?: string | null;
}

/** One tender line on the JSON receipt. */
export interface PosReceiptTender {
  method: PosTenderMethod;
  amountPaise: number;
  changePaise: number;
  reference?: string | null;
  /** Set by the app on exchange documents that refund the difference. */
  direction?: 'collect' | 'refund';
}

export interface PosReceiptLine {
  name: string;
  qty: number;
  unitPaise: number;
  gstRateBp: number;
  lineTotalPaise: number;
}

/** GET /retailer/pos/sales/:id/receipt?format=json — built from the sale's frozen snapshots. */
export interface PosReceipt {
  /** 'TAX INVOICE' | 'BILL OF SUPPLY' | 'CREDIT NOTE' */
  title: string;
  storeName: string;
  storeAddress: string;
  storeGstin: string;
  invoiceNumber: string | null;
  saleId: string;
  isReturn: boolean;
  /** Already formatted by the server (IST, en-IN). */
  dateTime: string;
  cashier?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerGstin?: string | null;
  lines: PosReceiptLine[];
  itemsGrossPaise: number;
  discountPaise: number;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  payablePaise: number;
  tenders: PosReceiptTender[];
  changePaise: number;
  headerText?: string | null;
  footerText?: string | null;
  showGstBreakup: boolean;
  charsPerLine: number;
  /** Set by the app on exchange documents: value of the lines handed back. */
  returnedCreditPaise?: number;
}

// ---- Returns / exchanges ----

/** A line of the original sale being handed back. */
export interface PosReturnLineInput {
  originalSaleItemId: string;
  qty: number;
  /** Put the item back in stock (default true). */
  restock?: boolean;
}

/** POST /retailer/pos/sales/:id/returns — refund tenders must equal the refund due exactly. */
export interface PosReturnRequest {
  idempotencyKey: string;
  reason: string;
  lines: PosReturnLineInput[];
  refundTenders: PosSettleTender[];
}

export interface PosReturnResult {
  returnSaleId: string;
  /**
   * Refund due. NOTE: on an idempotent replay the server echoes the stored (negative) ledger
   * value, so read it as an absolute amount.
   */
  refundPaise: number;
  creditNoteId: string | null;
}

/** A replacement item being sold in an exchange. */
export interface PosExchangeNewLine {
  variantId: string;
  qty: number;
  lineDiscountPaise?: number;
}

/**
 * POST /retailer/pos/sales/:id/exchange. Exactly one settlement side: `collectTenders` when the
 * new items cost more, `refundTenders` when the returned ones are worth more, neither when even.
 */
export interface PosExchangeRequest {
  idempotencyKey: string;
  reason: string;
  returnLines: PosReturnLineInput[];
  newLines: PosExchangeNewLine[];
  collectTenders?: PosSettleTender[];
  refundTenders?: PosSettleTender[];
  pricingMode?: 'tax_inclusive';
}

export interface PosExchangeResult {
  exchangeSaleId: string;
  newInvoiceId: string;
  newInvoiceNumber: string;
  returnRefundPaise: number;
  newPayablePaise: number;
  /** New items − returned items: > 0 the customer paid, < 0 the store refunded. */
  netPaise: number;
  creditNoteId: string | null;
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
