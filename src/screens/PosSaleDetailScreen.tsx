import React, { useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Share, StyleSheet, View } from 'react-native';
import {
  AppText,
  Banner,
  BottomSheet,
  DetailRow,
  Divider,
  Field,
  KeyboardStickyView,
  ListRow,
  Panel,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SheetSurface,
  StatusChip,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { getSaleInvoice, getSaleReceipt } from '../api/pos';
import { usePosSale, useVoidSale } from '../api/posHooks';
import { openHostedPdf } from '../api/invoices';
import { errorMessage } from '../api/request';
import { PosSaleDetail, PosSalePayment, TENDER_LABEL, posSaleBadge } from '../types/pos';
import { formatPaise } from '../utils/money';
import { formatDateTime } from '../utils/format';
import { usePermissions } from '../utils/usePermission';
import { canReturnAgainst } from '../utils/posExchange';
import { adaptReceipt, buildReceiptHtml } from '../utils/receiptHtml';
import {
  PRINT_UNAVAILABLE_MESSAGE,
  isPrintAvailable,
  printFailureMessage,
  printHtml,
  printPdfFile,
} from '../utils/printing';
import { downloadPdfToCache, pdfFileName, savePdfAndOpen } from '../utils/posPdf';
import { colors, radii, spacing } from '../theme/theme';

type Busy = null | 'receipt' | 'print-invoice' | 'share-pdf' | 'invoice';

/** "− ₹40" for negatives, "+ ₹0.40" / "− ₹0.40" when `sign` is forced (round-off). */
function signedPaise(p: number, sign = false): string {
  if (p < 0) return `− ${formatPaise(-p)}`;
  return sign ? `+ ${formatPaise(p)}` : formatPaise(p);
}

const tenderName = (p: PosSalePayment) => TENDER_LABEL[p.method] ?? p.method;
const returnedCredit = (s: PosSaleDetail) =>
  (s.returnLines ?? []).reduce((sum, l) => sum + (l.refundPaise || 0), 0);
/** Last 10 digits of the customer's number, or null when there isn't a usable one. */
const customerMobile = (s: PosSaleDetail) => {
  const d = (s.customerPhoneSnap ?? '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? d : null;
};

/** Plain-text receipt — what the thermal printer at the web counter prints. */
function receiptText(s: PosSaleDetail): string {
  const rule = '--------------------------------';
  const out: string[] = [];
  if (s.status === 'voided') out.push('*** VOIDED ***');
  out.push(s.storeLegalNameSnap);
  if (s.storeAddressSnap) out.push(s.storeAddressSnap);
  if (s.storeGstinSnap) out.push(`GSTIN: ${s.storeGstinSnap}`);
  out.push(rule);
  out.push(`Invoice: ${s.invoice?.invoiceNumber ?? '—'}`);
  out.push(`Date: ${formatDateTime(s.completedAt)}`);
  const who = [s.customerNameSnap, s.customerPhoneSnap].filter(Boolean).join(' · ');
  out.push(`Customer: ${who || 'Walk-in'}`);
  if (s.customerGstinSnap) out.push(`Customer GSTIN: ${s.customerGstinSnap}`);
  out.push(rule);
  for (const it of s.items) {
    const name = it.attributesLabelSnap ? `${it.listingNameSnap} / ${it.attributesLabelSnap}` : it.listingNameSnap;
    out.push(`${name} × ${it.qty}  ${formatPaise(it.netLinePaise)}`);
  }
  out.push(rule);
  if (s.billDiscountPaise > 0) out.push(`Bill discount  − ${formatPaise(s.billDiscountPaise)}`);
  out.push(`Taxable  ${formatPaise(s.taxableValuePaise)}`);
  if (s.igstPaise) {
    out.push(`IGST  ${formatPaise(s.igstPaise)}`);
  } else {
    out.push(`CGST  ${formatPaise(s.cgstPaise)}`);
    out.push(`SGST  ${formatPaise(s.sgstPaise)}`);
  }
  if (s.roundOffPaise) out.push(`Round off  ${signedPaise(s.roundOffPaise, true)}`);
  const returned = returnedCredit(s);
  if (returned > 0) out.push(`Returned credit  − ${formatPaise(returned)}`);
  out.push(`TOTAL  ${signedPaise(s.payablePaise)}`);
  out.push(rule);
  for (const p of s.payments) {
    const ref = p.reference ? ` (${p.reference})` : '';
    out.push(`${p.direction === 'refund' ? 'REFUND ' : ''}${tenderName(p).toUpperCase()}${ref} ${formatPaise(p.amountPaise)}`);
  }
  if (s.changePaise > 0) out.push(`Change ${formatPaise(s.changePaise)}`);
  out.push('', 'Thank you! Visit again.');
  return out.join('\n');
}

/**
 * A counter sale's receipt: reshare it (text / WhatsApp), open the GST tax
 * invoice PDF, or void it. Opened straight after "Complete sale" with
 * `justCompleted`, where the payment screen has been replaced — so going
 * back lands on the register, ready for the next bill.
 */
export function PosSaleDetailScreen({ navigation, route }: ScreenProps<'PosSaleDetail'>) {
  const { id, justCompleted, changePaise } = route.params;
  const toast = useToast();
  const { can } = usePermissions();
  const saleQ = usePosSale(id);
  const voidQ = useVoidSale();
  const [voidOpen, setVoidOpen] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const sale = saleQ.data;
  // A return / exchange document lists the lines it handed back by id only — the sale they came from
  // supplies the names (and the receipt rebuilds its item lines from them).
  const originalQ = usePosSale(sale?.originalSaleId ?? undefined);
  const original = originalQ.data ?? null;
  const invoiceNo = sale?.invoice?.invoiceNumber ?? null;

  const newBill = () => navigation.popTo('Register');

  const header = justCompleted ? (
    <ScreenHeader overline="Billing counter" title={invoiceNo ?? 'Receipt'} />
  ) : (
    <ScreenHeader overline="Counter sale" title={invoiceNo ?? 'Sale'} onBack={() => navigation.goBack()} />
  );

  const footer = justCompleted ? (
    <KeyboardStickyView style={styles.footer} minBottom={spacing.sm}>
      <PrimaryButton label="New bill" tone="accent" onPress={newBill} />
    </KeyboardStickyView>
  ) : null;

  const changeDue = changePaise ?? sale?.changePaise ?? 0;
  const doneBanner = justCompleted ? (
    <Banner
      tone="success"
      title="Sale completed"
      message={changeDue > 0 ? `Give change ${formatPaise(changeDue)}` : undefined}
    />
  ) : null;

  if (!sale) {
    return (
      <Screen edges={justCompleted ? ['top'] : ['top', 'bottom']}>
        <View style={styles.content}>
          {header}
          {doneBanner}
          {saleQ.isError ? (
            <Banner
              tone="danger"
              title="Couldn't load this sale"
              message={errorMessage(saleQ.error)}
              actionLabel="Retry"
              onAction={() => saleQ.refetch()}
            />
          ) : (
            <ActivityIndicator color={colors.ink} style={styles.loader} />
          )}
        </View>
        <View style={styles.flex} />
        {footer}
      </Screen>
    );
  }

  const badge = posSaleBadge({ status: sale.status, isReturn: !!sale.originalSaleId });
  const mobile = customerMobile(sale);
  const canRefund = can('pos.refund');
  const canVoid = sale.status === 'completed' && !sale.originalSaleId && canRefund;
  // Return / exchange is offered on a completed sale that isn't itself a return or exchange.
  const canReturn = canRefund && canReturnAgainst(sale);
  const returned = returnedCredit(sale);
  const hasInvoice = !!sale.invoice;
  const returnedLines = (sale.returnLines ?? []).map((rl) => ({
    rl,
    item: original?.items.find((i) => i.id === rl.originalSaleItemId) ?? null,
  }));

  const share = async () => {
    try {
      await Share.share({ message: receiptText(sale), title: invoiceNo ? `Receipt ${invoiceNo}` : 'Receipt' });
    } catch (e) {
      toast.show(errorMessage(e, "Couldn't share the receipt"), 'error');
    }
  };

  const sendWhatsApp = async () => {
    if (!mobile) return;
    const text = encodeURIComponent(receiptText(sale));
    try {
      await Linking.openURL(`whatsapp://send?phone=91${mobile}&text=${text}`);
    } catch {
      // WhatsApp isn't installed — wa.me opens it in the browser instead.
      Linking.openURL(`https://wa.me/91${mobile}?text=${text}`).catch(() =>
        toast.show("Couldn't open WhatsApp", 'error'),
      );
    }
  };

  const openInvoice = async () => {
    setBusy('invoice');
    try {
      const inv = await getSaleInvoice(id);
      if (inv?.pdfUrl) await openHostedPdf(inv.pdfUrl);
      else toast.show('PDF not ready yet — try again in a moment.', 'info');
    } catch (e) {
      toast.show(errorMessage(e, "Couldn't open the invoice"), 'error');
    } finally {
      setBusy(null);
    }
  };

  /** The invoice PDF's link, or a toast explaining why there isn't one yet. */
  const invoicePdfUrl = async (): Promise<string | null> => {
    const inv = await getSaleInvoice(id);
    if (inv?.pdfUrl) return inv.pdfUrl;
    toast.show('The invoice PDF isn’t ready yet — try again in a moment.', 'info');
    return null;
  };

  /** Narrow 80mm-style receipt through the system print dialog (any Wi-Fi / Bluetooth / USB printer). */
  const printReceipt = async () => {
    if (!isPrintAvailable()) {
      toast.show(PRINT_UNAVAILABLE_MESSAGE, 'info');
      return;
    }
    setBusy('receipt');
    try {
      const receipt = await getSaleReceipt(id);
      const html = buildReceiptHtml(adaptReceipt(receipt, sale, original), {
        voided: sale.status === 'voided',
      });
      await printHtml(html, invoiceNo ? `Receipt ${invoiceNo}` : 'Receipt');
    } catch (e) {
      toast.show(printFailureMessage(e, "Couldn't print the receipt"), 'error');
    } finally {
      setBusy(null);
    }
  };

  /** The GST invoice as an A4 PDF through the system print dialog. */
  const printInvoice = async () => {
    if (!isPrintAvailable()) {
      toast.show(PRINT_UNAVAILABLE_MESSAGE, 'info');
      return;
    }
    setBusy('print-invoice');
    try {
      const url = await invoicePdfUrl();
      if (!url) return;
      const path = await downloadPdfToCache(url, pdfFileName(invoiceNo));
      await printPdfFile(path, invoiceNo ? `Invoice ${invoiceNo}` : 'Invoice');
    } catch (e) {
      toast.show(printFailureMessage(e, "Couldn't print the invoice"), 'error');
    } finally {
      setBusy(null);
    }
  };

  /** Download the invoice PDF and open it so it can be sent on (viewer / share sheet). */
  const sharePdf = async () => {
    setBusy('share-pdf');
    try {
      const url = await invoicePdfUrl();
      if (url) await savePdfAndOpen(url, pdfFileName(invoiceNo));
    } catch (e) {
      toast.show(errorMessage(e, "Couldn't share the invoice"), 'error');
    } finally {
      setBusy(null);
    }
  };

  const spinner = <ActivityIndicator color={colors.ink} />;

  const submitVoid = (reason: string) =>
    voidQ.mutate(
      { id, reason },
      {
        onSuccess: () => {
          setVoidOpen(false);
          toast.show('Sale voided — stock restored', 'success');
        },
        onError: (e) => toast.show(errorMessage(e, "Couldn't void the sale"), 'error'),
      },
    );

  return (
    // With the "New bill" footer, the footer owns the bottom inset.
    <Screen edges={justCompleted ? ['top'] : ['top', 'bottom']}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {header}
        {doneBanner}

        {/* Receipt */}
        <Panel>
          <View style={styles.storeBlock}>
            <AppText variant="cardTitle" color={colors.ink}>
              {sale.storeLegalNameSnap}
            </AppText>
            {sale.storeAddressSnap ? (
              <AppText variant="meta" color={colors.meta}>
                {sale.storeAddressSnap}
              </AppText>
            ) : null}
            {sale.storeGstinSnap ? (
              <AppText variant="meta" color={colors.meta}>
                GSTIN {sale.storeGstinSnap}
              </AppText>
            ) : null}
          </View>
          <Divider />
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <AppText variant="bodyMedium" color={colors.ink}>
                {invoiceNo ?? 'Draft'}
              </AppText>
              <AppText variant="meta" color={colors.meta}>
                {formatDateTime(sale.completedAt)}
              </AppText>
            </View>
            <StatusChip label={badge.label} tone={badge.tone} style={styles.chipCenter} />
          </View>
          <View style={styles.billTo}>
            <AppText variant="sectionLabel" color={colors.meta}>
              Bill to
            </AppText>
            {sale.customerNameSnap || sale.customerPhoneSnap || sale.customerGstinSnap ? (
              <>
                {sale.customerNameSnap ? (
                  <AppText variant="body" color={colors.ink}>
                    {sale.customerNameSnap}
                  </AppText>
                ) : null}
                {sale.customerPhoneSnap ? (
                  <AppText variant="meta" color={colors.meta}>
                    {sale.customerPhoneSnap}
                  </AppText>
                ) : null}
                {sale.customerGstinSnap ? (
                  <AppText variant="meta" color={colors.meta}>
                    GSTIN {sale.customerGstinSnap}
                  </AppText>
                ) : null}
              </>
            ) : (
              <AppText variant="body" color={colors.ink}>
                Walk-in customer
              </AppText>
            )}
          </View>
          <Divider />

          {sale.items.map((it) => (
            <View key={it.id} style={styles.item}>
              <View style={styles.flex}>
                <AppText variant="bodyMedium" color={colors.ink} numberOfLines={2}>
                  {it.listingNameSnap}
                </AppText>
                <AppText variant="meta" color={colors.meta}>
                  {[it.attributesLabelSnap, `× ${it.qty}`].filter(Boolean).join(' ')}
                </AppText>
                <AppText variant="meta" color={colors.meta}>
                  {[it.hsnSnap ? `HSN ${it.hsnSnap}` : null, `GST ${it.gstRateBp / 100}%`]
                    .filter(Boolean)
                    .join(' · ')}
                </AppText>
                {it.lineDiscountPaise > 0 ? (
                  <AppText variant="meta" color={colors.success}>
                    − {formatPaise(it.lineDiscountPaise)} off
                  </AppText>
                ) : null}
              </View>
              <AppText variant="bodyMedium" color={colors.ink}>
                {formatPaise(it.netLinePaise)}
              </AppText>
            </View>
          ))}

          {/* A return / exchange lists what was handed back (names come from the original sale). */}
          {returnedLines.length > 0 ? (
            <>
              <AppText variant="sectionLabel" color={colors.meta}>
                {sale.items.length > 0 ? 'Handed back' : 'Items returned'}
              </AppText>
              {returnedLines.map(({ rl, item }, i) => (
                <View key={rl.id ?? `${rl.originalSaleItemId}-${i}`} style={styles.item}>
                  <View style={styles.flex}>
                    <AppText variant="bodyMedium" color={colors.ink} numberOfLines={2}>
                      {item?.listingNameSnap ?? 'Returned item'}
                    </AppText>
                    <AppText variant="meta" color={colors.meta}>
                      {[item?.attributesLabelSnap, `× ${rl.qty}`, rl.restock === false ? 'not restocked' : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </AppText>
                  </View>
                  <AppText variant="bodyMedium" color={colors.ink}>
                    {formatPaise(rl.refundPaise)}
                  </AppText>
                </View>
              ))}
            </>
          ) : null}

          <Divider />
          {sale.billDiscountPaise > 0 ? (
            <DetailRow label="Bill discount" value={`− ${formatPaise(sale.billDiscountPaise)}`} tone="negative" />
          ) : null}
          <DetailRow label="Taxable value" value={formatPaise(sale.taxableValuePaise)} />
          {sale.igstPaise ? (
            <DetailRow label="IGST" value={formatPaise(sale.igstPaise)} />
          ) : (
            <>
              <DetailRow label="CGST" value={formatPaise(sale.cgstPaise)} />
              <DetailRow label="SGST" value={formatPaise(sale.sgstPaise)} />
            </>
          )}
          {sale.roundOffPaise ? (
            <DetailRow label="Round off" value={signedPaise(sale.roundOffPaise, true)} />
          ) : null}
          {returned > 0 ? (
            <DetailRow label="Returned credit" value={`− ${formatPaise(returned)}`} tone="negative" />
          ) : null}
          <DetailRow label="Total" value={signedPaise(sale.payablePaise)} strong />

          {sale.payments.length ? (
            <>
              <Divider />
              {sale.payments.map((p) => (
                <DetailRow
                  key={p.id}
                  label={p.direction === 'refund' ? `Refund · ${tenderName(p)}` : tenderName(p)}
                  hint={p.reference ? `Ref ${p.reference}` : undefined}
                  value={p.direction === 'refund' ? `− ${formatPaise(p.amountPaise)}` : formatPaise(p.amountPaise)}
                  tone={p.direction === 'refund' ? 'negative' : 'default'}
                />
              ))}
            </>
          ) : null}
          {sale.changePaise > 0 ? (
            <DetailRow label="Change given" value={formatPaise(sale.changePaise)} tone="muted" />
          ) : null}
        </Panel>

        {/* Actions */}
        {canReturn ? (
          <>
            <ListRow
              icon="return-down-back-outline"
              label="Return items"
              hint="Take items back and refund them"
              onPress={() => navigation.navigate('PosReturn', { saleId: id })}
            />
            <ListRow
              icon="swap-horizontal-outline"
              label="Exchange items"
              hint="Swap for other items, settle only the difference"
              onPress={() => navigation.navigate('PosExchange', { saleId: id })}
            />
          </>
        ) : null}
        <ListRow
          icon="print-outline"
          label="Print receipt"
          hint={busy === 'receipt' ? 'Preparing…' : 'Narrow receipt for any printer'}
          onPress={busy ? undefined : printReceipt}
          right={busy === 'receipt' ? spinner : undefined}
        />
        {hasInvoice ? (
          <ListRow
            icon="document-outline"
            label="Print invoice"
            hint={busy === 'print-invoice' ? 'Preparing…' : 'GST invoice on A4'}
            onPress={busy ? undefined : printInvoice}
            right={busy === 'print-invoice' ? spinner : undefined}
          />
        ) : null}
        {hasInvoice ? (
          <ListRow
            icon="download-outline"
            label="Share PDF"
            hint={busy === 'share-pdf' ? 'Downloading…' : 'Save the invoice and send it on'}
            onPress={busy ? undefined : sharePdf}
            right={busy === 'share-pdf' ? spinner : undefined}
          />
        ) : null}
        <ListRow
          icon="share-outline"
          label="Share receipt"
          hint="Send it as a text message"
          onPress={share}
        />
        {mobile ? (
          <ListRow
            icon="logo-whatsapp"
            label="Send on WhatsApp"
            hint={`To +91 ${mobile}`}
            onPress={sendWhatsApp}
          />
        ) : null}
        <ListRow
          icon="document-text-outline"
          label="Tax invoice (PDF)"
          hint={busy === 'invoice' ? 'Opening…' : 'The GST invoice for this sale'}
          onPress={busy ? undefined : openInvoice}
          right={busy === 'invoice' ? spinner : undefined}
        />
        {canVoid ? (
          <ListRow
            icon="close-circle-outline"
            label="Void sale"
            hint="Restores stock and issues a credit note"
            tone="danger"
            onPress={() => setVoidOpen(true)}
          />
        ) : null}
      </ScrollView>

      {footer}

      <BottomSheet
        visible={voidOpen}
        onClose={() => !voidQ.isPending && setVoidOpen(false)}
        avoidKeyboard
        dismissable={!voidQ.isPending}
      >
        <VoidSheet busy={voidQ.isPending} onSubmit={submitVoid} onClose={() => setVoidOpen(false)} />
      </BottomSheet>
    </Screen>
  );
}

/** Reason + confirm. Mounted fresh each time the sheet opens. */
function VoidSheet({
  busy,
  onSubmit,
  onClose,
}: {
  busy: boolean;
  onSubmit: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const r = reason.trim();
    if (r.length < 3) {
      setError('Add a short reason (at least 3 characters)');
      return;
    }
    onSubmit(r);
  };

  return (
    <SheetSurface style={styles.sheet}>
      <View style={styles.sheetHead}>
        <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
          Void this sale?
        </AppText>
        <AppText variant="meta" color={colors.meta}>
          Restores stock and issues a credit note. This can't be undone.
        </AppText>
      </View>
      <Field
        label="Reason"
        value={reason}
        onChangeText={(t) => {
          setReason(t);
          setError(null);
        }}
        placeholder="e.g. Billed by mistake"
        error={error}
        multiline
        maxLength={300}
        boxed
      />
      <PrimaryButton label="Void sale" tone="danger" loading={busy} onPress={submit} />
      <PrimaryButton label="Cancel" tone="surface" disabled={busy} onPress={onClose} />
    </SheetSurface>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: spacing.xl, gap: spacing.md },
  loader: { marginTop: spacing.xl },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  chipCenter: { alignSelf: 'center' },
  storeBlock: { gap: 2 },
  billTo: { gap: 2 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.xs },
  footer: { paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.hairline },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetHead: { gap: spacing.xs },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
});
