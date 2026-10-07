import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  Banner,
  DetailRow,
  Divider,
  Field,
  Icon,
  KeyboardStickyView,
  Panel,
  PressableScale,
  PrimaryButton,
  QtyStepper,
  Screen,
  ScreenHeader,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useBillQuote, useExchangeSale, usePosSale } from '../api/posHooks';
import { errorCode, errorMessage, idempotencyKey } from '../api/request';
import { usePosReturns } from '../store/posReturns';
import { usePermissions } from '../utils/usePermission';
import { PosLookupRow, PosQuoteRequest } from '../types/pos';
import {
  ReturnSelection,
  Settlement,
  TenderDraft,
  buildExchangeRequest,
  canReturnAgainst,
  exchangeNet,
  exchangeProblem,
  mergeReturned,
  newTenderDraft,
  originalTenderMethod,
  returnValuePaise,
  returnedQtyByItem,
  selectedLines,
  settlementFor,
  settlementLabel,
} from '../utils/posExchange';
import { formatPaise } from '../utils/money';
import { formatDateTime } from '../utils/format';
import { ProductSearch } from './pos/ProductSearch';
import { ReturnLinesPicker } from './pos/ReturnLinesPicker';
import { TenderSplitEditor } from './pos/TenderSplitEditor';
import { colors, radii, spacing } from '../theme/theme';

const REASON_MAX = 240;

interface NewItem {
  row: PosLookupRow;
  qty: number;
}

/**
 * Exchange: the customer hands back some lines of a sale and takes other items, and only the
 * DIFFERENCE is settled — on one side. The new items are priced by the server's quote (exact GST), the
 * returned ones are pro-rated off the original lines; if the customer owes, collect it, if they're owed,
 * refund it, and an even swap takes no money at all. Same maths as the web portal's exchange dialog.
 */
export function PosExchangeScreen({ navigation, route }: ScreenProps<'PosExchange'>) {
  const { saleId } = route.params;
  const toast = useToast();
  const { can } = usePermissions();
  const saleQ = usePosSale(saleId);
  const sale = saleQ.data;
  const exchangeMut = useExchangeSale(saleId);
  const ledger = usePosReturns((s) => s.returned);
  const recordReturned = usePosReturns((s) => s.record);

  const [selection, setSelection] = useState<ReturnSelection>({});
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const [reason, setReason] = useState('');
  const [rows, setRows] = useState<TenderDraft[]>(() => [newTenderDraft('cash')]);
  const [submitting, setSubmitting] = useState(false);
  const busyRef = useRef(false);
  const keyRef = useRef<string | null>(null);
  if (!keyRef.current) keyRef.current = idempotencyKey(`posexc-${saleId}`);

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !submitting });
  }, [submitting, navigation]);
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (busyRef.current) e.preventDefault();
      }),
    [navigation],
  );

  const items = useMemo(() => sale?.items ?? [], [sale]);
  const returned = useMemo(
    () => mergeReturned(returnedQtyByItem(sale?.returnLines), ledger),
    [sale?.returnLines, ledger],
  );
  const returnValue = returnValuePaise(items, selection);
  const picked = selectedLines(items, selection);

  // Price the new side with the same quote endpoint the register uses.
  const newLines = useMemo(() => newItems.map((n) => ({ variantId: n.row.variantId, qty: n.qty })), [newItems]);
  const quoteBody = useMemo<PosQuoteRequest>(
    () => ({
      lines: newLines.map((l) => ({ ...l, lineDiscountPaise: 0 })),
      pricingMode: 'tax_inclusive',
    }),
    [newLines],
  );
  const quoteQ = useBillQuote(quoteBody, true);
  const quote = newItems.length ? quoteQ.data : undefined;
  const quoteReady = !!quote && !quoteQ.isPlaceholderData;
  const newValue = quoteReady && quote ? quote.payablePaise : 0;

  const settlement: Settlement | null = quoteReady ? settlementFor(exchangeNet(newValue, returnValue)) : null;
  const settleKind = settlement?.kind ?? null;

  // When the money flips sides (customer pays ↔ store refunds), start the payment split afresh: a
  // refund goes back the way the customer paid, a collection defaults to cash.
  const lastKind = useRef<Settlement['kind'] | null>(null);
  useEffect(() => {
    if (!sale || !settleKind || lastKind.current === settleKind) return;
    lastKind.current = settleKind;
    setRows([newTenderDraft(settleKind === 'refund' ? originalTenderMethod(sale) : 'cash')]);
  }, [settleKind, sale]);

  const addNew = (row: PosLookupRow) =>
    setNewItems((prev) => {
      const hit = prev.find((n) => n.row.variantId === row.variantId);
      if (hit) return prev.map((n) => (n === hit ? { ...n, qty: n.qty + 1, row } : n));
      return [...prev, { row, qty: 1 }];
    });
  const setNewQty = (variantId: string, qty: number) =>
    setNewItems((prev) =>
      qty <= 0
        ? prev.filter((n) => n.row.variantId !== variantId)
        : prev.map((n) => (n.row.variantId === variantId ? { ...n, qty } : n)),
    );

  const problem = exchangeProblem({
    items,
    selection,
    returned,
    newLines,
    quoteReady,
    reason,
    settlement: settlement ?? { kind: 'even', amountPaise: 0 },
    rows,
  });

  const submit = async () => {
    if (!sale || problem || !settlement || busyRef.current || !keyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    const body = buildExchangeRequest({
      idempotencyKey: keyRef.current,
      reason,
      items,
      selection,
      newLines,
      newValuePaise: newValue,
      rows,
    });
    try {
      const res = await exchangeMut.mutateAsync(body);
      recordReturned(body.returnLines);
      busyRef.current = false;
      toast.show('Exchange recorded', 'success');
      navigation.replace('PosSaleDetail', { id: res.exchangeSaleId });
    } catch (e) {
      busyRef.current = false;
      setSubmitting(false);
      if (errorCode(e) === 'order_stock_unavailable') {
        toast.show('Stock changed — check the new items are still available.', 'error');
        quoteQ.refetch();
      } else {
        toast.show(errorMessage(e, "Couldn't process the exchange"), 'error');
        // A price changed between the quote and the sale → the amounts no longer match; re-price.
        quoteQ.refetch();
      }
    }
  };

  const header = (
    <ScreenHeader overline="Counter sale" title="Exchange items" onBack={() => navigation.goBack()} />
  );

  if (!sale) {
    return (
      <Screen edges={['top', 'bottom']}>
        {header}
        {saleQ.isError ? (
          <Banner
            tone="danger"
            title="Couldn't load this sale"
            message={errorMessage(saleQ.error)}
            actionLabel="Retry"
            onAction={() => saleQ.refetch()}
            style={styles.gapTop}
          />
        ) : (
          <ActivityIndicator color={colors.ink} style={styles.loader} />
        )}
      </Screen>
    );
  }

  if (!can('pos.refund')) {
    return (
      <Screen edges={['top', 'bottom']}>
        {header}
        <Banner
          tone="warning"
          title="Exchanges need approval"
          message="Your role can't process exchanges. Ask the owner or a manager."
          style={styles.gapTop}
        />
      </Screen>
    );
  }

  if (!canReturnAgainst(sale)) {
    return (
      <Screen edges={['top', 'bottom']}>
        {header}
        <Banner
          tone="warning"
          title="Can't exchange against this sale"
          message={
            sale.originalSaleId
              ? 'This is already a return or exchange. Exchange against the original sale instead.'
              : `Only completed sales can be exchanged (this one is ${sale.status}).`
          }
          style={styles.gapTop}
        />
      </Screen>
    );
  }

  const invoiceNo = sale.invoice?.invoiceNumber ?? null;
  const who = [sale.customerNameSnap, sale.customerPhoneSnap].filter(Boolean).join(' · ') || 'Walk-in customer';
  const footerLabel = !settlement
    ? 'Complete exchange'
    : settlement.kind === 'collect'
      ? `Collect ${formatPaise(settlement.amountPaise)}`
      : settlement.kind === 'refund'
        ? `Refund ${formatPaise(settlement.amountPaise)}`
        : 'Complete exchange';

  return (
    <Screen edges={['top']}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {header}

        <Panel>
          <AppText variant="bodyMedium" color={colors.ink}>
            {invoiceNo ?? 'Counter sale'}
          </AppText>
          <AppText variant="meta" color={colors.meta}>
            {who} · {formatDateTime(sale.completedAt)}
          </AppText>
        </Panel>

        <ReturnLinesPicker
          title="Coming back"
          items={items}
          returned={returned}
          selection={selection}
          onChange={setSelection}
          disabled={submitting}
        />

        <View style={styles.block}>
          <AppText variant="sectionLabel" color={colors.meta}>
            Customer takes
          </AppText>
          <ProductSearch onPick={addNew} placeholder="Scan / search to add…" />
          {newItems.map((n) => {
            const sub = [n.row.attributesLabel, n.row.sku].filter(Boolean).join(' · ');
            const low = n.row.availableQty <= 0 ? 'Out of stock' : n.qty > n.row.availableQty ? `Only ${n.row.availableQty} left` : null;
            return (
              <View key={n.row.variantId} style={styles.newLine}>
                <View style={styles.flex}>
                  <AppText variant="bodyMedium" color={colors.ink} numberOfLines={2}>
                    {n.row.name}
                  </AppText>
                  <AppText variant="meta" color={colors.meta} numberOfLines={1}>
                    {[sub, `${formatPaise(n.row.pricePaise)} each`].filter(Boolean).join(' · ')}
                  </AppText>
                  {low ? (
                    <AppText variant="meta" color={colors.danger}>
                      {low}
                    </AppText>
                  ) : null}
                </View>
                <QtyStepper compact value={n.qty} min={1} max={99} onChange={(q) => setNewQty(n.row.variantId, q)} />
                <PressableScale
                  onPress={() => setNewQty(n.row.variantId, 0)}
                  hitSlop={10}
                  toScale={0.9}
                  style={styles.removeBtn}
                >
                  <Icon name="close" size={16} color={colors.meta} />
                </PressableScale>
              </View>
            );
          })}
        </View>

        {newItems.length > 0 && quoteQ.isError && !quote ? (
          <Banner
            tone="danger"
            title="Couldn't price the new items"
            message={errorMessage(quoteQ.error)}
            actionLabel="Retry"
            onAction={() => quoteQ.refetch()}
          />
        ) : null}

        <Panel title="Difference">
          <DetailRow
            label="Returned credit"
            value={returnValue > 0 ? `− ${formatPaise(returnValue)}` : formatPaise(0)}
            tone={returnValue > 0 ? 'negative' : 'muted'}
          />
          <DetailRow
            label={quoteQ.isFetching && newItems.length > 0 ? 'New items …' : 'New items'}
            value={newItems.length === 0 ? formatPaise(0) : quoteReady ? formatPaise(newValue) : '…'}
          />
          <Divider />
          <DetailRow
            label={settlement ? settlementLabel(settlement) : 'Add items to see the difference'}
            value={settlement ? formatPaise(settlement.amountPaise) : '—'}
            strong
          />
          <AppText variant="meta" color={colors.meta}>
            Prices include GST. The returned items are credited at what was paid for them.
          </AppText>
        </Panel>

        {settlement && settlement.kind !== 'even' ? (
          <TenderSplitEditor
            heading={settlement.kind === 'collect' ? 'Collect the difference via' : 'Refund the difference to'}
            rows={rows}
            duePaise={settlement.amountPaise}
            onChange={setRows}
            disabled={submitting}
          />
        ) : null}

        <Field
          label="Reason"
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Size swap"
          multiline
          maxLength={REASON_MAX}
          editable={!submitting}
          boxed
        />
      </ScrollView>

      <KeyboardStickyView style={styles.footer} minBottom={spacing.sm}>
        <PrimaryButton
          label={footerLabel}
          tone="accent"
          loading={submitting}
          disabled={!!problem}
          onPress={submit}
        />
        {problem && (picked.length > 0 || newItems.length > 0) ? (
          <AppText variant="meta" color={colors.meta} style={styles.hint}>
            {problem}
          </AppText>
        ) : null}
      </KeyboardStickyView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: spacing.xl, gap: spacing.md },
  loader: { marginTop: spacing.xl },
  gapTop: { marginTop: spacing.md },
  block: { gap: spacing.sm },
  newLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { paddingTop: spacing.md, gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.hairline },
  hint: { textAlign: 'center' },
});
