import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  Banner,
  BottomSheet,
  DetailRow,
  Divider,
  EmptyState,
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
import { ScreenProps } from '../navigation/types';
import {
  useCreateEarlyDisbursement,
  useEarlyDisbursements,
  useFees,
  usePayouts,
  useUpcomingPayout,
} from '../api/earningsHooks';
import { errorMessage } from '../api/request';
import {
  EarlyDisbursementRequest,
  earlyStatusMeta,
  StoreFees,
  UpcomingPayout,
} from '../types/earnings';
import { usePermissions } from '../utils/usePermission';
import { formatPaise, parseRupeesToPaise } from '../utils/money';
import { formatDate, formatDayDate, plural, shortRef } from '../utils/format';
import { colors, radii, spacing } from '../theme/theme';

/** Orders listed before the "Show all" toggle. */
const ORDERS_PREVIEW = 10;
/** Decided early-payout requests listed before "Show all". */
const EARLY_PREVIEW = 3;

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
 * sales became that amount (overall and per order), early payout requests and
 * their history, the store's fee rates, and links to payout history, billing
 * statements and invoices.
 */
export function EarningsScreen({ navigation }: ScreenProps<'Earnings'>) {
  const toast = useToast();
  // Each query is gated like its endpoint: a login without the permission would only 403.
  const { can } = usePermissions();
  const canPayouts = can('payouts.view');
  const canInvoices = can('invoicing.view');
  const canEarly = can('early_disbursement.request');
  const canFees = can('store.view_profile');
  const upcomingQ = useUpcomingPayout(canPayouts);
  const earlyQ = useEarlyDisbursements(canEarly);
  const payoutsQ = usePayouts(canPayouts);
  const feesQ = useFees(canFees);
  const createEarly = useCreateEarlyDisbursement();
  const up = upcomingQ.data;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [amountErr, setAmountErr] = useState<string | undefined>();
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [showAllEarly, setShowAllEarly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const owed = up?.outstandingPayable ?? 0;
  const pendingEarly = (earlyQ.data ?? []).find((r) => r.status === 'pending');
  const decidedEarly = (earlyQ.data ?? []).filter((r) => r.status !== 'pending');
  const visibleEarly = showAllEarly ? decidedEarly : decidedEarly.slice(0, EARLY_PREVIEW);
  const orders = up?.orderBreakdown ?? [];
  const visibleOrders = showAllOrders ? orders : orders.slice(0, ORDERS_PREVIEW);
  const failedPayouts = (payoutsQ.data ?? []).filter((p) => p.status === 'failed').length;

  // Local flag so the spinner shows only for a pull, not the background poll.
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        upcomingQ.refetch(),
        canEarly ? earlyQ.refetch() : undefined,
        payoutsQ.refetch(),
        canFees ? feesQ.refetch() : undefined,
      ]);
    } finally {
      setRefreshing(false);
    }
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

  if (!canPayouts) {
    return (
      <Screen edges={['top']}>
        <ScreenHeader overline="Payments" title="Earnings & payouts" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="lock-closed-outline"
          title="Not available for your role"
          message="Ask the store owner or a manager about payments."
        />
      </Screen>
    );
  }

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

        {/* Early disbursement: needs early_disbursement.request, else absent. */}
        {canEarly ? (
          <Panel title="Early payout">
            {pendingEarly ? (
              <View style={styles.rowBetween}>
                <View style={styles.flex}>
                  <AppText variant="bodyMedium" color={colors.ink}>
                    {formatPaise(pendingEarly.amountPaise)} requested
                  </AppText>
                  <AppText variant="meta" color={colors.meta} numberOfLines={2}>
                    {pendingEarly.reason}
                  </AppText>
                  <AppText variant="meta" color={colors.meta}>
                    Requested {formatDate(pendingEarly.requestedAt)}. Waiting for admin review.
                  </AppText>
                </View>
                <StatusChip
                  label={earlyStatusMeta(pendingEarly.status).label}
                  tone={earlyStatusMeta(pendingEarly.status).tone}
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
            {earlyQ.isError && !earlyQ.data ? (
              <AppText variant="meta" color={colors.danger}>
                Couldn't load your early payout requests. {errorMessage(earlyQ.error)}
              </AppText>
            ) : null}
            {decidedEarly.length > 0 ? (
              <>
                <Divider />
                <AppText variant="sectionLabel" color={colors.meta}>
                  Past requests
                </AppText>
                {visibleEarly.map((r, i) => (
                  <React.Fragment key={r.id}>
                    {i > 0 ? <Divider /> : null}
                    <EarlyRequestRow request={r} />
                  </React.Fragment>
                ))}
                {decidedEarly.length > EARLY_PREVIEW ? (
                  <PressableScale
                    onPress={() => setShowAllEarly((v) => !v)}
                    haptic={false}
                    style={styles.toggle}
                  >
                    <AppText variant="meta" color={colors.ink}>
                      {showAllEarly ? 'Show less' : `Show all ${decidedEarly.length}`}
                    </AppText>
                    <Icon
                      name={showAllEarly ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={colors.ink}
                    />
                  </PressableScale>
                ) : null}
              </>
            ) : null}
          </Panel>
        ) : null}

        {/* Permission-gated: simply absent when the rates can't be read. */}
        {feesQ.data ? <FeesPanel fees={feesQ.data} /> : null}

        <ListRow
          icon="document-text-outline"
          label="Billing statements"
          hint="Gross to net for every settlement cycle"
          onPress={() => navigation.navigate('BillingStatements')}
        />
        {canInvoices ? (
          <ListRow
            icon="receipt-outline"
            label="Invoices"
            hint="Customer tax invoices and commission invoices"
            onPress={() => navigation.navigate('Invoices')}
          />
        ) : null}
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

/** A decided early-payout request: amount, outcome, reason, dates and the admin's note. */
function EarlyRequestRow({ request: r }: { request: EarlyDisbursementRequest }) {
  const status = earlyStatusMeta(r.status);
  return (
    <View style={styles.earlyRow}>
      <View style={styles.rowBetween}>
        <AppText variant="bodyMedium" color={colors.ink}>
          {formatPaise(r.amountPaise)}
        </AppText>
        <StatusChip label={status.label} tone={status.tone} />
      </View>
      <AppText variant="meta" color={colors.meta} numberOfLines={2}>
        {r.reason}
      </AppText>
      <AppText variant="meta" color={colors.meta}>
        Requested {formatDate(r.requestedAt)}
        {r.decidedAt ? ` · Decided ${formatDate(r.decidedAt)}` : ''}
      </AppText>
      {r.decisionNote ? (
        <AppText variant="meta" color={colors.ink}>
          “{r.decisionNote}”
        </AppText>
      ) : null}
    </View>
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
  earlyRow: { gap: 2 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
});
