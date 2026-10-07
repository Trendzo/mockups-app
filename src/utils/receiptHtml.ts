/**
 * Counter receipt as printable HTML (narrow 80mm-style roll layout) — handed to the system print
 * dialog through react-native-print. Pure: no React, no native modules, so it's unit-testable.
 *
 * Built from the server's JSON receipt (`GET /pos/sales/:id/receipt`), which is assembled from the
 * sale's frozen snapshots, so a reprint matches the original. Exchange and return documents need two
 * fix-ups the server's receipt doesn't make — see `adaptReceipt`.
 */
import { PosReceipt, PosReceiptLine, PosSaleDetail, PosTenderMethod, TENDER_LABEL } from '../types/pos';

export function escapeHtml(s: string | number | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

/** 123456 → "1,234.56" (Indian grouping, always two decimals). */
export function rupeesText(paise: number): string {
  const neg = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const whole = Math.floor(abs / 100).toString();
  const frac = (abs % 100).toString().padStart(2, '0');
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `${neg ? '-' : ''}${grouped}.${frac}`;
}

/** "₹1,234.56" / "−₹40.00". */
export const rupeeAmount = (paise: number): string =>
  `${paise < 0 ? '−' : ''}₹${rupeesText(Math.abs(paise))}`;

/** GST rate in basis points → "5%", "12%", "2.5%". */
export const gstRateText = (bp: number): string => `${Number((bp / 100).toFixed(2))}%`;

const TENDER_NAME = (m: PosTenderMethod): string => (TENDER_LABEL[m] ?? String(m)).toUpperCase();

/** True for an exchange document (new items sold + old items handed back, one net row). */
export const isExchangeDoc = (sale: Pick<PosSaleDetail, 'originalSaleId' | 'items' | 'returnLines'>): boolean =>
  !!sale.originalSaleId && sale.items.length > 0 && (sale.returnLines?.length ?? 0) > 0;

/**
 * Make the server receipt right for return / exchange documents.
 *  - EXCHANGE: the server treats any document with an `originalSaleId` as a credit note (title
 *    "CREDIT NOTE", only refund tenders, ledger-net subtotal). The customer is actually handed a bill
 *    for the NEW items less the credit for what they gave back, so: show the new items, the credit,
 *    the net, and the real payments (collected or refunded).
 *  - RETURN: the document carries no item lines of its own, so when the original sale is available
 *    the returned lines are rebuilt from it (name, qty, refund).
 * Anything else comes back untouched.
 */
export function adaptReceipt(
  receipt: PosReceipt,
  sale: PosSaleDetail,
  original?: PosSaleDetail | null,
): PosReceipt {
  if (isExchangeDoc(sale)) {
    const credit = (sale.returnLines ?? []).reduce((s, l) => s + (l.refundPaise || 0), 0);
    return {
      ...receipt,
      isReturn: false,
      title: receipt.title === 'CREDIT NOTE' ? 'TAX INVOICE' : receipt.title,
      // The server's gross/discount/GST are net of the returned items; the printed lines aren't.
      itemsGrossPaise: receipt.lines.reduce((s, l) => s + l.lineTotalPaise, 0),
      discountPaise: 0,
      showGstBreakup: false,
      returnedCreditPaise: credit,
      tenders: sale.payments.map((p) => ({
        method: p.method,
        amountPaise: p.amountPaise,
        changePaise: p.changePaise ?? 0,
        reference: p.reference ?? null,
        direction: p.direction,
      })),
      changePaise: sale.changePaise,
    };
  }
  if (sale.originalSaleId && sale.items.length === 0 && receipt.lines.length === 0 && original) {
    const byId = new Map(original.items.map((i) => [i.id, i]));
    const lines: PosReceiptLine[] = [];
    for (const rl of sale.returnLines ?? []) {
      const it = rl.originalSaleItemId ? byId.get(rl.originalSaleItemId) : undefined;
      if (!it) continue;
      lines.push({
        name: it.attributesLabelSnap ? `${it.listingNameSnap} (${it.attributesLabelSnap})` : it.listingNameSnap,
        qty: rl.qty,
        unitPaise: rl.qty > 0 ? Math.round(rl.refundPaise / rl.qty) : rl.refundPaise,
        gstRateBp: it.gstRateBp,
        lineTotalPaise: rl.refundPaise,
      });
    }
    return { ...receipt, lines };
  }
  return receipt;
}

export interface ReceiptHtmlOptions {
  /** Stamp the receipt VOIDED. */
  voided?: boolean;
  /** Printable column width in mm (default 72 — an 80mm roll less margins). */
  widthMm?: number;
}

const CSS = (widthMm: number) => `
  @page { size: 80mm auto; margin: 3mm; }
  * { box-sizing: border-box; font-family: 'Courier New', Courier, monospace; color: #000; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { width: ${widthMm}mm; font-size: 11px; line-height: 1.35; }
  .c { text-align: center; }
  .b { font-weight: 700; }
  .s { font-size: 9px; }
  .store { font-size: 14px; font-weight: 700; }
  .title { font-size: 12px; font-weight: 700; letter-spacing: .06em; margin-top: 2px; }
  .void { border: 2px solid #000; text-align: center; font-weight: 700; font-size: 14px; padding: 2px; margin: 4px 0; }
  hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  td.r { text-align: right; white-space: nowrap; padding-left: 6px; }
  .item td.nm { padding-top: 3px; word-break: break-word; }
  .grand td { font-size: 14px; font-weight: 700; padding-top: 3px; }
`;

type Row = readonly [label: string, value: string, cls?: string];

const rows = (list: Row[]): string =>
  list.length
    ? `<table>${list
        .map(([l, v, cls]) => `<tr${cls ? ` class="${cls}"` : ''}><td>${l}</td><td class="r">${v}</td></tr>`)
        .join('')}</table>`
    : '';

const metaLines = (r: PosReceipt): string => {
  const meta: Row[] = [];
  if (r.invoiceNumber) meta.push(['Bill', escapeHtml(r.invoiceNumber)]);
  meta.push(['Date', escapeHtml(r.dateTime)]);
  if (r.cashier) meta.push(['Cashier', escapeHtml(r.cashier)]);
  if (r.customerName) meta.push(['Customer', escapeHtml(r.customerName)]);
  if (r.customerPhone) meta.push(['Phone', escapeHtml(r.customerPhone)]);
  if (r.customerGstin) meta.push(['Cust GSTIN', escapeHtml(r.customerGstin)]);
  return rows(meta);
};

/** The receipt as a complete HTML document. */
export function buildReceiptHtml(r: PosReceipt, opts: ReceiptHtmlOptions = {}): string {
  const credit = r.returnedCreditPaise ?? 0;
  const exchange = credit > 0;
  // A pure return is printed as positive credit amounts (the ledger stores them negative).
  const creditNote = r.isReturn && !exchange;
  const amt = (p: number) => rupeeAmount(creditNote ? Math.abs(p) : p);

  const head: string[] = [];
  if (opts.voided) head.push('<div class="void">*** VOIDED ***</div>');
  if (r.headerText) {
    for (const l of r.headerText.split('\n')) head.push(`<div class="c s">${escapeHtml(l)}</div>`);
  }
  head.push(`<div class="c store">${escapeHtml(r.storeName)}</div>`);
  if (r.storeAddress) head.push(`<div class="c s">${escapeHtml(r.storeAddress)}</div>`);
  if (r.storeGstin) head.push(`<div class="c s">GSTIN: ${escapeHtml(r.storeGstin)}</div>`);
  head.push(`<div class="c title">${escapeHtml(r.title)}</div>`);

  const items = r.lines
    .map(
      (l) =>
        `<table class="item"><tr><td class="nm" colspan="2">${escapeHtml(l.name)}</td></tr>` +
        `<tr><td class="s">${l.qty} × ${rupeesText(l.unitPaise)}${l.gstRateBp ? ` · GST ${gstRateText(l.gstRateBp)}` : ''}</td>` +
        `<td class="r">${rupeesText(creditNote ? Math.abs(l.lineTotalPaise) : l.lineTotalPaise)}</td></tr></table>`,
    )
    .join('');

  const totals: Row[] = [];
  totals.push(['Subtotal', amt(r.itemsGrossPaise)]);
  if (r.discountPaise > 0) totals.push(['Discount', `− ${rupeeAmount(r.discountPaise)}`]);
  if (r.showGstBreakup) {
    totals.push(['Taxable', amt(r.taxableValuePaise)]);
    if (r.igstPaise !== 0) totals.push(['IGST', amt(r.igstPaise)]);
    else {
      totals.push(['CGST', amt(r.cgstPaise)]);
      totals.push(['SGST', amt(r.sgstPaise)]);
    }
  }
  if (r.roundOffPaise !== 0) {
    totals.push(['Round off', `${r.roundOffPaise < 0 ? '−' : '+'} ${rupeeAmount(Math.abs(r.roundOffPaise))}`]);
  }
  if (exchange) totals.push(['Returned credit', `− ${rupeeAmount(credit)}`]);

  const total = exchange
    ? r.payablePaise < 0
      ? (['NET REFUND', rupeeAmount(-r.payablePaise), 'grand'] as const)
      : (['NET PAYABLE', rupeeAmount(r.payablePaise), 'grand'] as const)
    : creditNote
      ? (['REFUND', rupeeAmount(Math.abs(r.payablePaise)), 'grand'] as const)
      : (['TOTAL', rupeeAmount(r.payablePaise), 'grand'] as const);

  const tenders: Row[] = r.tenders.map((t) => {
    const refunded = t.direction === 'refund' || creditNote;
    const ref = t.reference ? ` (${escapeHtml(t.reference)})` : '';
    return [`${refunded ? 'REFUND ' : ''}${TENDER_NAME(t.method)}${ref}`, rupeeAmount(t.amountPaise)] as const;
  });
  if (r.changePaise > 0) tenders.push(['Change', rupeeAmount(r.changePaise)]);

  const footer = r.footerText ?? 'Thank you! Please visit again.';
  const body = [
    ...head,
    '<hr>',
    metaLines(r),
    '<hr>',
    items || '',
    items ? '<hr>' : '',
    rows(totals),
    '<hr>',
    rows([total]),
    '<hr>',
    rows(tenders),
    tenders.length ? '<hr>' : '',
    ...footer.split('\n').map((l) => `<div class="c s">${escapeHtml(l)}</div>`),
  ]
    .filter(Boolean)
    .join('\n');

  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${escapeHtml(r.invoiceNumber ?? r.title)}</title><style>${CSS(opts.widthMm ?? 72)}</style></head>` +
    `<body>${body}</body></html>`
  );
}
