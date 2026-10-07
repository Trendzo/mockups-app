import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import {
  AppText,
  Banner,
  DetailRow,
  Divider,
  Field,
  KeyboardStickyView,
  Panel,
  PrimaryButton,
  Screen,
  ScreenHeader,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { usePosSale, useReturnSale } from '../api/posHooks';
import { errorMessage, idempotencyKey } from '../api/request';
import { usePosReturns } from '../store/posReturns';
import { usePermissions } from '../utils/usePermission';
import {
  ReturnSelection,
  TenderDraft,
  buildReturnRequest,
  canReturnAgainst,
  collapseSplit,
  mergeReturned,
  newTenderDraft,
  originalTenderMethod,
  returnProblem,
  returnValuePaise,
  returnedQtyByItem,
  selectedLines,
} from '../utils/posExchange';
import { formatPaise } from '../utils/money';
import { formatDateTime } from '../utils/format';
import { ReturnLinesPicker } from './pos/ReturnLinesPicker';
import { TenderSplitEditor } from './pos/TenderSplitEditor';
import { colors, spacing } from '../theme/theme';

const REASON_MAX = 240;

/**
 * Take items back from a completed counter sale and refund them: pick the lines and quantities (capped
 * at what hasn't already been returned), say whether they go back on the shelf, give a reason, and
 * split the refund across cash / card / UPI so it adds up to the refund due exactly.
 */
export function PosReturnScreen({ navigation, route }: ScreenProps<'PosReturn'>) {
  const { saleId } = route.params;
  const toast = useToast();
  const { can } = usePermissions();
  const saleQ = usePosSale(saleId);
  const sale = saleQ.data;
  const returnMut = useReturnSale(saleId);
  const ledger = usePosReturns((s) => s.returned);
  const recordReturned = usePosReturns((s) => s.record);

  const [selection, setSelection] = useState<ReturnSelection>({});
  const [reason, setReason] = useState('');
  const [rows, setRows] = useState<TenderDraft[]>(() => [newTenderDraft('cash')]);
  const [submitting, setSubmitting] = useState(false);
  const busyRef = useRef(false);
  // ONE key for this screen's lifetime: a retry after a dropped reply must hit the same return, never
  // create a second refund.
  const keyRef = useRef<string | null>(null);
  if (!keyRef.current) keyRef.current = idempotencyKey(`posret-${saleId}`);

  // The refund goes back the way the customer paid, by default.
  const defaulted = useRef(false);
  useEffect(() => {
    if (!sale || defaulted.current) return;
    defaulted.current = true;
    setRows([newTenderDraft(originalTenderMethod(sale))]);
  }, [sale]);

  // Don't let the screen close while the refund is being recorded — it may already exist.
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
  const due = returnValuePaise(items, selection);
  const problem = returnProblem({ items, selection, returned, reason, rows });
  const eligible = !!sale && canReturnAgainst(sale);
  const picked = selectedLines(items, selection);
  // Typed split amounts stop meaning anything once the refund due changes — start the split over.
  useEffect(() => {
    setRows((r) => collapseSplit(r));
  }, [due]);
  const unitCount = picked.reduce((s, l) => s + l.qty, 0);

  const submit = async () => {
    if (!sale || problem || busyRef.current || !keyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    const body = buildReturnRequest({
      idempotencyKey: keyRef.current,
      reason,
      items,
      selection,
      rows,
    });
    try {
      const res = await returnMut.mutateAsync(body);
      recordReturned(body.lines);
      busyRef.current = false;
      // `refundPaise` comes back negative on an idempotent replay — read it as an amount.
      toast.show(`Return recorded · ${formatPaise(Math.abs(res.refundPaise))} refunded`, 'success');
      navigation.replace('PosSaleDetail', { id: res.returnSaleId });
    } catch (e) {
      busyRef.current = false;
      setSubmitting(false);
      toast.show(errorMessage(e, "Couldn't process the return"), 'error');
    }
  };

  const header = (
    <ScreenHeader overline="Counter sale" title="Return items" onBack={() => navigation.goBack()} />
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
          title="Returns need approval"
          message="Your role can't process returns. Ask the owner or a manager."
          style={styles.gapTop}
        />
      </Screen>
    );
  }

  if (!eligible) {
    return (
      <Screen edges={['top', 'bottom']}>
        {header}
        <Banner
          tone="warning"
          title="Can't return against this sale"
          message={
            sale.originalSaleId
              ? 'This is already a return or exchange. Return against the original sale instead.'
              : `Only completed sales can be returned (this one is ${sale.status}).`
          }
          style={styles.gapTop}
        />
      </Screen>
    );
  }

  const invoiceNo = sale.invoice?.invoiceNumber ?? null;
  const who = [sale.customerNameSnap, sale.customerPhoneSnap].filter(Boolean).join(' · ') || 'Walk-in customer';

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
          title="What's coming back"
          items={items}
          returned={returned}
          selection={selection}
          onChange={setSelection}
          disabled={submitting}
        />

        <Field
          label="Reason"
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Wrong size, defective"
          multiline
          maxLength={REASON_MAX}
          editable={!submitting}
          boxed
        />

        {due > 0 ? (
          <TenderSplitEditor
            heading="Refund to"
            rows={rows}
            duePaise={due}
            onChange={setRows}
            disabled={submitting}
          />
        ) : picked.length > 0 ? (
          <Banner tone="neutral" title="Nothing to refund" message="These items were fully discounted." />
        ) : null}

        {picked.length > 0 ? (
          <Panel title="Summary">
            <DetailRow label={`Items returned (${unitCount})`} value={formatPaise(due)} />
            <Divider />
            <DetailRow label="Refund due" value={formatPaise(due)} strong />
            <AppText variant="meta" color={colors.meta}>
              A credit note is issued against {invoiceNo ?? 'the invoice'}.
            </AppText>
          </Panel>
        ) : null}
      </ScrollView>

      <KeyboardStickyView style={styles.footer} minBottom={spacing.sm}>
        <PrimaryButton
          label={due > 0 ? `Refund ${formatPaise(due)}` : 'Record return'}
          tone="accent"
          loading={submitting}
          disabled={!!problem}
          onPress={submit}
        />
        {problem && picked.length > 0 ? (
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
  footer: { paddingTop: spacing.md, gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.hairline },
  hint: { textAlign: 'center' },
});
