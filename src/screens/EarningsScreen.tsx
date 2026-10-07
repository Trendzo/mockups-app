import React, { useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  Banner,
  BottomSheet,
  DetailRow,
  Divider,
  Field,
  Icon,
  ListRow,
  Panel,
  PressableScale,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SectionHeader,
  SheetSurface,
  StatusChip,
  useToast,
} from '../components';
import type { StatusTone } from '../components';
import { ScreenProps } from '../navigation/types';
import {
  useCreateEarlyDisbursement,
  useEarlyDisbursements,
  useFees,
  usePayouts,
  useUpcomingPayout,
} from '../api/earningsHooks';
import { errorMessage } from '../api/request';
import { EarlyDisbursementStatus, StoreFees, UpcomingPayout } from '../types/earnings';
import { formatPaise, parseRupeesToPaise } from '../utils/money';
import { formatDayDate, plural, shortRef } from '../utils/format';
import { WEB_PORTAL_PAYOUTS_URL } from '../config/legal';
import { colors, radii, spacing } from '../theme/theme';

const EARLY_STATUS: Record<EarlyDisbursementStatus, { label: string; tone: StatusTone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

/** Orders listed before the "Show all" toggle. */
const ORDERS_PREVIEW = 10;

type OrderLine = UpcomingPayout['orderBreakdown'][number];

const minus = (paise: number) => `− ${formatPaise(Math.abs(paise))}`;
const signed = (paise: number) => `${paise > 0 ? '+' : '−'} ${formatPaise(Math.abs(paise))}`;
/** Payout cadence after "every": "day" / "7 days". */
const cadence = (n: number) => (n === 1 ? 'day' : `${n} days`);

/** Basis points → "12.5%" (100 bp = 1%, at most 2 decimals). */
function formatBp(bp: number): string {
  if (!Number.isFinite(bp)) return '—';
  return `${Number((bp / 100).toFixed(2))}%`;
}

/**
 * Earnings & payouts: what the store is owed right now and when it lands, how
 * sales became that amount (overall and per order), early payout requests, the
 * store's fee rates, and links to payout history and the web-portal statement.
 */
export function EarningsScreen({ navigation }: ScreenProps<'Earnings'>) {
  const toast = useToast();
  const upcomingQ = useUpcomingPayout();
  const earlyQ = useEarlyDisbursements();
  const payoutsQ = usePayouts();
  const feesQ = useFees();
  const createEarly = useCreateEarlyDisbursement();
  const up = upcomingQ.data;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [amountErr, setAmountErr] = useState<string | undefined>();
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const owed = up?.outstandingPayable ?? 0;
  const pendingEarly = (earlyQ.data ?? []).find((r) => r.status === 'pending');
  const orders = up?.orderBreakdown ?? [];
  const visibleOrders = showAllOrders ? orders : orders.slice(0, ORDERS_PREVIEW);
  const failedPayouts = (payoutsQ.data ?? []).filter((p) => p.status === 'failed').length;

  // Local flag so the spinner shows only for a pull, not the background poll.
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        upcomingQ.refetch(),
        earlyQ.refetch(),
        payoutsQ.refetch(),
        feesQ.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const openStatement = () => {
    Linking.openURL(WEB_PORTAL_PAYOUTS_URL).catch(() =>
      toast.show("Couldn't open the web portal", 'error'),
    );
  };

  const submitEarly = () => {
    setAmountErr(undefined);
    const paise = parseRupeesToPaise(amount);
    if (paise == null || paise <= 0) {
      setAmountErr('Enter a valid amount');
      return;
    }
    if (paise > owed) {
      setAmountErr(`Can't exceed the ${formatPaise(owed)} owed to you`);
      return;
    }
    if (reason.trim().length < 5) {
      toast.show('Add a short reason (min 5 characters)', 'error');
      return;
    }
    createEarly.mutate(
      { amountPaise: paise, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.show('Early payout requested — awaiting admin approval', 'success');
          setSheetOpen(false);
          setAmount('');
          setReason('');
        },
        onError: (e) => toast.show(errorMessage(e, 'Could not request'), 'error'),
      },
    );
  };

  return (
    <Screen edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />
        }
      >
        <ScreenHeader
          overline="Payments"
          title="Earnings & payouts"
          onBack={() => navigation.goBack()}
        />

        {/* A failed background poll keeps the last good numbers on screen. */}
        {upcomingQ.isError && !up ? (
          <Banner
            tone="danger"
            title="Couldn't load earnings"
            message={errorMessage(upcomingQ.error)}
            actionLabel="Retry"
            onAction={() => upcomingQ.refetch()}
          />
        ) : null}

        {/* Owed hero */}
        <View style={styles.hero}>
          <AppText variant="meta" color={colors.accentSub}>
            Unsettled — owed to you
          </AppText>
          <AppText variant="cardTitle" color={colors.accentInk} style={styles.heroAmt}>
            {up ? formatPaise(owed) : upcomingQ.isLoading ? '…' : '—'}
          </AppText>
          {/* Always rendered (blank until loaded) so the page doesn't jump. */}
          <AppText variant="meta" color={colors.accentSub}>
            {up ? `From ${plural(up.orderCount, 'order')} since the last payout` : ' '}
          </AppText>
        </View>

        {/* Next payout */}
        <Panel>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <AppText variant="sectionLabel" color={colors.meta}>
                Next payout
              </AppText>
              <AppText variant="bodyMedium" color={colors.ink}>
                {up ? formatDayDate(up.nextCycleDate) : '—'}
              </AppText>
            </View>
            <View style={styles.alignEnd}>
              <AppText variant="sectionLabel" color={colors.meta}>
                Expected
              </AppText>
              <AppText variant="bodyMedium" color={colors.ink}>
                {up ? formatPaise(owed) : '—'}
              </AppText>
            </View>
          </View>
          <AppText variant="meta" color={colors.meta} style={styles.cadence}>
            {up ? `Paid every ${cadence(up.payoutCadenceDays)}` : ' '}
          </AppText>
        </Panel>

        <ListRow
          icon="time-outline"
          label="Payout history"
          hint={
            failedPayouts > 0
              ? `${plural(failedPayouts, 'payout')} failed — tap to check`
              : 'Every settlement to your bank'
          }
          tone={failedPayouts > 0 ? 'warning' : undefined}
          // pop: return to an open history screen instead of stacking another.
          onPress={() => navigation.navigate('Payouts', undefined, { pop: true })}
        />

        {/* Breakdown: sales vs fees/adjustments */}
        <Panel title="Breakdown">
          <DetailRow label="Sales" value={up ? formatPaise(up.grossPaise) : '—'} />
          <DetailRow
            label="Platform fee"
            value={up ? minus(up.commissionPaise) : '—'}
            tone="negative"
          />
          <DetailRow label="TCS" value={up ? minus(up.tcsPaise) : '—'} tone="negative" />
          {up && up.heldPaise > 0 ? (
            <DetailRow label="Held back (disputes)" value={minus(up.heldPaise)} tone="negative" />
          ) : null}
          {up && up.pendingAdjustmentsPaise !== 0 ? (
            <DetailRow
              label="Adjustments"
              value={signed(up.pendingAdjustmentsPaise)}
              tone={up.pendingAdjustmentsPaise > 0 ? 'positive' : 'negative'}
            />
          ) : null}
          <Divider />
          <DetailRow label="Net payable" value={up ? formatPaise(owed) : '—'} strong />
        </Panel>

        {/* Per-order contribution to the next payout */}
        {up ? (
          <View style={styles.section}>
            <SectionHeader label="Orders in this payout" />
            {orders.length === 0 ? (
              <Panel>
                <AppText variant="meta" color={colors.meta}>
                  No orders in the next payout yet. Delivered orders show up here.
                </AppText>
              </Panel>
            ) : (
              <>
                {visibleOrders.map((line) => (
                  <OrderLineRow
                    key={line.orderId}
                    line={line}
                    onPress={() => navigation.navigate('OrderDetail', { id: line.orderId })}
                  />
                ))}
                {orders.length > ORDERS_PREVIEW ? (
                  <PressableScale
                    onPress={() => setShowAllOrders((v) => !v)}
                    haptic={false}
                    style={styles.toggle}
                  >
                    <AppText variant="meta" color={colors.ink}>
                      {showAllOrders ? 'Show less' : `Show all ${orders.length}`}
                    </AppText>
                    <Icon
                      name={showAllOrders ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={colors.ink}
                    />
                  </PressableScale>
                ) : null}
              </>
            )}
          </View>
        ) : null}

        {/* Early disbursement */}
        <Panel title="Early payout">
          {pendingEarly ? (
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <AppText variant="bodyMedium" color={colors.ink}>
                  {formatPaise(pendingEarly.amountPaise)} requested
                </AppText>
                <AppText variant="meta" color={colors.meta} numberOfLines={1}>
                  {pendingEarly.reason}
                </AppText>
              </View>
              <StatusChip
                label={EARLY_STATUS[pendingEarly.status].label}
                tone={EARLY_STATUS[pendingEarly.status].tone}
                style={styles.chipCenter}
              />
            </View>
          ) : (
            <>
              <AppText variant="meta" color={colors.meta} style={styles.earlyHint}>
                Get part of what you're owed before the next cycle. Needs admin
                approval and a small fee.
              </AppText>
              <PrimaryButton
                label="Request early payout"
                tone="ghost"
                disabled={owed <= 0}
                onPress={() => setSheetOpen(true)}
              />
            </>
          )}
        </Panel>

        {/* Permission-gated: simply absent when the rates can't be read. */}
        {feesQ.data ? <FeesPanel fees={feesQ.data} /> : null}

        <ListRow
          icon="document-text-outline"
          label="Full statement"
          hint="Payouts & invoices on the web portal"
          right={<Icon name="open-outline" size={18} color={colors.meta} />}
          onPress={openStatement}
        />
      </ScrollView>

      {/* Early-payout request sheet */}
      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} avoidKeyboard>
        <SheetSurface style={styles.sheet}>
          <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
            Request early payout
          </AppText>
          <AppText variant="meta" color={colors.meta}>
            Up to {formatPaise(owed)} available. Admin reviews every request.
          </AppText>
          <Field
            label="Amount"
            prefix="₹"
            value={amount}
            onChangeText={(t) => {
              setAmount(t);
              if (amountErr) setAmountErr(undefined);
            }}
            placeholder="0"
            keyboardType="numeric"
            error={amountErr}
            boxed
          />
          <Field
            label="Reason"
            value={reason}
            onChangeText={setReason}
            placeholder="Why do you need it early?"
            boxed
          />
          <PrimaryButton
            label="Submit request"
            tone="accent"
            loading={createEarly.isPending}
            onPress={submitEarly}
          />
          <PrimaryButton label="Cancel" tone="surface" onPress={() => setSheetOpen(false)} />
        </SheetSurface>
      </BottomSheet>
    </Screen>
  );
}

/** One order's share of the next payout; opens the order. */
function OrderLineRow({ line, onPress }: { line: OrderLine; onPress: () => void }) {
  return (
    <ListRow
      label={`Order ${shortRef(line.orderId)}`}
      hint={`Sale ${formatPaise(line.gross)} · Fee −${formatPaise(line.commission)} · TCS −${formatPaise(line.tcs)}`}
      right={
        <AppText variant="bodyMedium" color={colors.success}>
          {formatPaise(line.net)}
        </AppText>
      }
      onPress={onPress}
    />
  );
}

function FeesPanel({ fees }: { fees: StoreFees }) {
  return (
    <Panel title="Your fees">
      <DetailRow label="Platform fee" value={formatBp(fees.platformFeeBp)} />
      <DetailRow label="GST on fee" value={formatBp(fees.gstRateBp)} />
      <DetailRow label="TCS" value={formatBp(fees.tcsRateBp)} />
      <DetailRow label="Payouts" value={`Every ${cadence(fees.payoutCadenceDays)}`} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, gap: spacing.md },
  flex: { flex: 1 },
  alignEnd: { alignItems: 'flex-end' },
  hero: {
    backgroundColor: colors.accent,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  heroAmt: { fontSize: 34, lineHeight: 40 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  chipCenter: { alignSelf: 'center' },
  cadence: { marginTop: spacing.xs },
  section: { gap: spacing.sm },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  earlyHint: { marginBottom: spacing.xs },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
});
