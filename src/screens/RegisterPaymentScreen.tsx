import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  Banner,
  Chip,
  Divider,
  Field,
  Icon,
  KeyboardStickyView,
  Panel,
  PressableScale,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SegmentedControl,
  useToast,
} from '../components';
import type { SegmentOption } from '../components';
import { ScreenProps } from '../navigation/types';
import { useBillQuote, useCreateSale } from '../api/posHooks';
import { errorCode, errorMessage } from '../api/request';
import {
  billDiscountPaise,
  billLines,
  customerInput,
  quoteRequest,
  refreshCartStock,
  useRegister,
} from '../store/register';
import { PosTender, PosTenderMethod, TENDER_LABEL, TENDER_REFERENCE_MAX } from '../types/pos';
import { formatPaise, paiseToRupeeInput, parseRupeesToPaise } from '../utils/money';
import { plural } from '../utils/format';
import { Haptics } from '../utils/haptics';
import { colors, radii, spacing } from '../theme/theme';

const METHODS: SegmentOption<PosTenderMethod>[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
];

const TENDER_ICON: Record<PosTenderMethod, string> = {
  cash: 'cash-outline',
  card: 'card-outline',
  upi: 'qr-code-outline',
};

/** The exact amount, then the next round notes a customer is likely to hand over. */
function cashSuggestions(remaining: number): number[] {
  const rupees = Math.ceil(remaining / 100);
  const notes = new Set<number>();
  for (const note of [100, 500, 1000, 2000]) {
    const v = Math.ceil(rupees / note) * note * 100;
    if (v > remaining) notes.add(v);
  }
  return [remaining, ...[...notes].sort((a, b) => a - b).slice(0, 3)];
}

/**
 * Take payment for the bill on the register: cash (with change), card, UPI or
 * any split of them. Completing records the sale and opens its receipt.
 */
export function RegisterPaymentScreen({ navigation }: ScreenProps<'RegisterPayment'>) {
  const toast = useToast();
  const lines = useRegister((s) => s.lines);
  const customer = useRegister((s) => s.customer);
  const billMode = useRegister((s) => s.billDiscountMode);
  const billValue = useRegister((s) => s.billDiscountValue);

  // Same body as the register screen, so this reads the quote it already has.
  const quoteBody = useMemo(() => quoteRequest(lines, billMode, billValue), [lines, billMode, billValue]);
  const quoteQ = useBillQuote(quoteBody, true);
  const quote = lines.length ? quoteQ.data : undefined;
  const quoteCurrent = !!quote && !quoteQ.isPlaceholderData;
  const payable = quote?.payablePaise ?? 0;
  const createSale = useCreateSale();

  const [tenders, setTenders] = useState<PosTender[]>([]);
  const [method, setMethod] = useState<PosTenderMethod>('cash');
  const [cashText, setCashText] = useState('');
  /** Card/UPI amount; null = the full remaining amount. */
  const [amountText, setAmountText] = useState<string | null>(null);
  /** Card slip / UPI transaction id for the leg being added (optional). */
  const [referenceText, setReferenceText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const busyRef = useRef(false);
  const doneRef = useRef(false);
  const leftRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  // The amount field and its Add button sit at the end of the page, right where
  // the keyboard lands — bring them back into view once it's up.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () =>
      scrollRef.current?.scrollToEnd({ animated: true }),
    );
    return () => sub.remove();
  }, []);

  const paid = tenders.reduce((s, t) => s + t.amountPaise, 0);
  const remaining = payable - paid;
  const change = tenders.reduce((s, t) => s + Math.max(0, t.tenderedPaise - t.amountPaise), 0);
  const units = lines.reduce((s, l) => s + l.qty, 0);
  const who = customer.name.trim() || (customer.phone ? `+91 ${customer.phone}` : 'Walk-in');
  const canComplete = quoteCurrent && payable > 0 && tenders.length > 0 && remaining === 0;

  // Nothing to charge (the bill was cleared) → back to the register.
  useEffect(() => {
    if (lines.length || doneRef.current || leftRef.current) return;
    leftRef.current = true;
    navigation.goBack();
  }, [lines.length, navigation]);

  // Stay on this screen while the sale is being recorded — it may already
  // exist on the server, and the reply decides where we go next.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !completing });
  }, [completing, navigation]);
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (busyRef.current) e.preventDefault();
      }),
    [navigation],
  );

  const addTender = (t: PosTender) => {
    setTenders((list) => [...list, t]);
    setError(null);
    Haptics.select();
  };

  // Only cash can be over-tendered: what's kept is capped at the amount due.
  const addCash = () => {
    const given = parseRupeesToPaise(cashText);
    if (given == null || given <= 0) {
      setError('Enter the cash received');
      return;
    }
    addTender({ method: 'cash', amountPaise: Math.min(remaining, given), tenderedPaise: given });
    setCashText('');
  };

  const digitalAmount = amountText == null ? remaining : parseRupeesToPaise(amountText);
  const addDigital = () => {
    if (digitalAmount == null || digitalAmount <= 0) {
      setError('Enter an amount');
      return;
    }
    if (digitalAmount > remaining) {
      setError(`Can't be more than the ${formatPaise(remaining)} due`);
      return;
    }
    const reference = referenceText.trim();
    if (reference.length > TENDER_REFERENCE_MAX) {
      setError(`Reference can be at most ${TENDER_REFERENCE_MAX} characters`);
      return;
    }
    addTender({
      method,
      amountPaise: digitalAmount,
      tenderedPaise: digitalAmount,
      ...(reference ? { reference } : {}),
    });
    setAmountText(null);
    setReferenceText('');
  };

  const removeTender = (index: number) => {
    setTenders((list) => list.filter((_, i) => i !== index));
    setError(null);
  };

  const pickMethod = (m: PosTenderMethod) => {
    setMethod(m);
    setAmountText(null);
    setReferenceText('');
    setError(null);
  };

  const complete = async () => {
    if (!canComplete || busyRef.current) return;
    const s = useRegister.getState();
    busyRef.current = true;
    setCompleting(true);
    try {
      const res = await createSale.mutateAsync({
        idempotencyKey: s.billKey,
        ...(s.holdSaleId ? { holdSaleId: s.holdSaleId } : {}),
        customer: customerInput(s.customer),
        pricingMode: 'tax_inclusive',
        billDiscountPaise: billDiscountPaise(s.lines, s.billDiscountMode, s.billDiscountValue),
        lines: billLines(s.lines),
        tenders,
      });
      doneRef.current = true;
      busyRef.current = false;
      s.reset();
      // The success toast carries the success haptic.
      toast.show(`Sale completed · ${res.invoiceNumber}`, 'success');
      navigation.replace('PosSaleDetail', {
        id: res.saleId,
        justCompleted: true,
        changePaise: res.changePaise,
      });
    } catch (e) {
      busyRef.current = false;
      setCompleting(false);
      if (errorCode(e) === 'order_stock_unavailable') {
        toast.show('Stock changed — re-check item availability.', 'error');
        refreshCartStock();
        navigation.goBack();
      } else {
        toast.show(errorMessage(e, "Couldn't complete the sale"), 'error');
      }
    }
  };

  const amountLabel = digitalAmount != null && digitalAmount > 0 ? `${formatPaise(digitalAmount)} ` : '';

  return (
    <Screen edges={['top']}>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader overline="Billing counter" title="Take payment" onBack={() => navigation.goBack()} />

        <View style={styles.hero}>
          <AppText variant="meta" color={colors.accentSub}>
            Amount due
          </AppText>
          <AppText variant="cardTitle" color={colors.accentInk} style={styles.heroAmt}>
            {quote ? formatPaise(payable) : '…'}
          </AppText>
          <AppText variant="meta" color={colors.accentSub} numberOfLines={1}>
            {plural(units, 'item')} · {who}
          </AppText>
        </View>

        {!quote ? (
          quoteQ.isError ? (
            <Banner
              tone="danger"
              title="Couldn't price this bill"
              message={errorMessage(quoteQ.error)}
              actionLabel="Retry"
              onAction={() => quoteQ.refetch()}
            />
          ) : (
            <ActivityIndicator color={colors.ink} style={styles.loader} />
          )
        ) : (
          <>
            <Panel title="Payments">
              {tenders.length ? (
                tenders.map((t, i) => (
                  <TenderRow
                    key={`${t.method}-${i}`}
                    tender={t}
                    disabled={completing}
                    onRemove={() => removeTender(i)}
                  />
                ))
              ) : (
                <AppText variant="meta" color={colors.meta}>
                  No payment added yet.
                </AppText>
              )}
              <Divider />
              <RemainingRow remaining={remaining} />
            </Panel>

            {change > 0 ? (
              <View style={styles.changeCard}>
                <View style={styles.changeIcon}>
                  <Icon name="cash-outline" size={22} color={colors.accentInk} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="bodyMedium" color={colors.success}>
                    Give change
                  </AppText>
                  <AppText variant="cardTitle" color={colors.ink} style={styles.changeAmt}>
                    {formatPaise(change)}
                  </AppText>
                </View>
              </View>
            ) : null}

            {remaining > 0 ? (
              <View style={styles.form}>
                <SegmentedControl options={METHODS} value={method} onChange={pickMethod} />
                {method === 'cash' ? (
                  <>
                    <Field
                      label="Cash received"
                      prefix="₹"
                      value={cashText}
                      onChangeText={(t) => {
                        setCashText(t);
                        setError(null);
                      }}
                      placeholder={paiseToRupeeInput(remaining)}
                      keyboardType="numeric"
                      returnKeyType="done"
                      onSubmitEditing={addCash}
                      error={error}
                    />
                    <View style={styles.chips}>
                      {cashSuggestions(remaining).map((v) => (
                        <Chip
                          key={v}
                          label={formatPaise(v)}
                          selected={parseRupeesToPaise(cashText) === v}
                          onPress={() => {
                            setCashText(paiseToRupeeInput(v));
                            setError(null);
                          }}
                        />
                      ))}
                    </View>
                    <PrimaryButton
                      label="Add cash"
                      tone="surface"
                      disabled={!cashText.trim() || completing}
                      onPress={addCash}
                    />
                  </>
                ) : (
                  <>
                    <Field
                      label="Amount"
                      prefix="₹"
                      value={amountText ?? paiseToRupeeInput(remaining)}
                      onChangeText={(t) => {
                        setAmountText(t);
                        setError(null);
                      }}
                      keyboardType="numeric"
                      returnKeyType="done"
                      onSubmitEditing={addDigital}
                      error={error}
                    />
                    <Field
                      label="Reference (optional)"
                      value={referenceText}
                      onChangeText={(t) => {
                        setReferenceText(t);
                        setError(null);
                      }}
                      placeholder={method === 'upi' ? 'UPI transaction id' : 'Card slip / approval code'}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={TENDER_REFERENCE_MAX}
                      returnKeyType="done"
                      onSubmitEditing={addDigital}
                    />
                    <AppText variant="meta" color={colors.meta}>
                      Enter less to split the bill across payment methods.
                    </AppText>
                    <PrimaryButton
                      label={`Add ${amountLabel}by ${TENDER_LABEL[method]}`}
                      tone="surface"
                      disabled={completing}
                      onPress={addDigital}
                    />
                  </>
                )}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <KeyboardStickyView style={styles.footer} minBottom={spacing.sm}>
        <PrimaryButton
          label="Complete sale"
          tone="accent"
          loading={completing}
          disabled={!canComplete}
          onPress={complete}
        />
      </KeyboardStickyView>
    </Screen>
  );
}

function TenderRow({
  tender,
  disabled,
  onRemove,
}: {
  tender: PosTender;
  disabled: boolean;
  onRemove: () => void;
}) {
  const given = tender.tenderedPaise > tender.amountPaise ? ` (given ${formatPaise(tender.tenderedPaise)})` : '';
  return (
    <View style={styles.tenderRow}>
      <Icon name={TENDER_ICON[tender.method]} size={18} color={colors.ink} />
      <View style={styles.flex}>
        <AppText variant="body" color={colors.ink}>
          {TENDER_LABEL[tender.method]} {formatPaise(tender.amountPaise)}
          {given}
        </AppText>
        {tender.reference ? (
          <AppText variant="meta" color={colors.meta} numberOfLines={1}>
            Ref {tender.reference}
          </AppText>
        ) : null}
      </View>
      <PressableScale onPress={onRemove} disabled={disabled} hitSlop={10} toScale={0.9} style={styles.removeBtn}>
        <Icon name="close" size={16} color={colors.meta} />
      </PressableScale>
    </View>
  );
}

function RemainingRow({ remaining }: { remaining: number }) {
  if (remaining > 0) {
    return (
      <View style={styles.rowBetween}>
        <AppText variant="bodyMedium" color={colors.ink}>
          Remaining
        </AppText>
        <AppText variant="bodyMedium" color={colors.danger}>
          {formatPaise(remaining)}
        </AppText>
      </View>
    );
  }
  if (remaining < 0) {
    return (
      <AppText variant="bodyMedium" color={colors.danger}>
        {formatPaise(-remaining)} more than the bill — remove a payment.
      </AppText>
    );
  }
  return (
    <View style={styles.inline}>
      <Icon name="checkmark-circle" size={18} color={colors.success} />
      <AppText variant="bodyMedium" color={colors.success}>
        Fully paid
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: spacing.xl, gap: spacing.md },
  loader: { marginTop: spacing.lg },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  hero: {
    backgroundColor: colors.accent,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  heroAmt: { fontSize: 34, lineHeight: 40 },
  tenderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(48,163,108,0.12)',
    borderRadius: radii.card,
    padding: spacing.md,
  },
  changeIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeAmt: { fontSize: 28, lineHeight: 34 },
  form: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: { paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.hairline },
});
