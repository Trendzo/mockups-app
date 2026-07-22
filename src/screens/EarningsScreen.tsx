import React, { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  BackButton,
  Banner,
  BottomSheet,
  Field,
  Icon,
  PressableScale,
  PrimaryButton,
  Screen,
  SheetSurface,
  StatusChip,
  useToast,
} from '../components';
import type { StatusTone } from '../components';
import { ScreenProps } from '../navigation/types';
import {
  useCreateEarlyDisbursement,
  useEarlyDisbursements,
  useUpcomingPayout,
} from '../api/earningsHooks';
import { EarlyDisbursementRequest, EarlyDisbursementStatus } from '../types/earnings';
import { formatPaise, parseRupeesToPaise } from '../utils/money';
import { WEB_PORTAL_PAYOUTS_URL } from '../config/legal';
import { colors, radii, spacing } from '../theme/theme';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon, 12 Aug" from an ISO date, local time. Avoids Intl (unreliable on Hermes). */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const EARLY_STATUS: Record<EarlyDisbursementStatus, { label: string; tone: StatusTone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

/**
 * Earnings / Payouts (beta). Shows the retailer's unsettled amount owed, the
 * sales-vs-fees breakdown, the next expected payout, an early-disbursement entry
 * point, and a deep-link to the full statement in the web portal.
 */
export function EarningsScreen({ navigation }: ScreenProps<'Earnings'>) {
  const toast = useToast();
  const upcomingQ = useUpcomingPayout();
  const earlyQ = useEarlyDisbursements();
  const createEarly = useCreateEarlyDisbursement();
  const up = upcomingQ.data;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [amountErr, setAmountErr] = useState<string | undefined>();

  const owed = up?.outstandingPayable ?? 0;
  const pendingEarly = (earlyQ.data ?? []).find((r) => r.status === 'pending');

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
        onError: (e) => toast.show((e as { message?: string })?.message ?? 'Could not request', 'error'),
      },
    );
  };

  return (
    <Screen edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <BackButton onPress={() => navigation.goBack()} />
        </View>
        <AppText variant="sectionLabel" color={colors.meta}>
          Earnings · Beta
        </AppText>
        <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
          Payouts
        </AppText>

        {upcomingQ.isError ? (
          <Banner
            tone="danger"
            title="Couldn't load earnings"
            message={(upcomingQ.error as { message?: string })?.message}
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
            {upcomingQ.isLoading ? '…' : formatPaise(owed)}
          </AppText>
          {up ? (
            <AppText variant="meta" color={colors.accentSub}>
              From {up.orderCount} order{up.orderCount === 1 ? '' : 's'} since the last payout
            </AppText>
          ) : null}
        </View>

        {/* Next payout */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <AppText variant="sectionLabel" color={colors.meta}>
                Next payout
              </AppText>
              <AppText variant="bodyMedium" color={colors.ink}>
                {up ? formatDate(up.nextCycleDate) : '—'}
              </AppText>
            </View>
            <View style={styles.alignEnd}>
              <AppText variant="sectionLabel" color={colors.meta}>
                Expected
              </AppText>
              <AppText variant="bodyMedium" color={colors.ink}>
                {formatPaise(owed)}
              </AppText>
            </View>
          </View>
          {up ? (
            <AppText variant="meta" color={colors.meta} style={styles.cadence}>
              Paid every {up.payoutCadenceDays} days
            </AppText>
          ) : null}
        </View>

        {/* Breakdown: sales vs fees/adjustments */}
        <View style={styles.card}>
          <AppText variant="sectionLabel" color={colors.meta} style={styles.blockLabel}>
            Breakdown
          </AppText>
          <BreakRow label="Sales" value={up ? formatPaise(up.grossPaise) : '—'} />
          <BreakRow
            label="Platform fee"
            value={up ? `− ${formatPaise(up.commissionPaise)}` : '—'}
            negative
          />
          <BreakRow label="TCS" value={up ? `− ${formatPaise(up.tcsPaise)}` : '—'} negative />
          <BreakRow
            label="Held back (disputes)"
            value={up ? `− ${formatPaise(up.heldPaise)}` : '—'}
            negative
          />
          {up && up.pendingAdjustmentsPaise !== 0 ? (
            <BreakRow
              label="Adjustments"
              value={`${up.pendingAdjustmentsPaise > 0 ? '+ ' : '− '}${formatPaise(
                Math.abs(up.pendingAdjustmentsPaise),
              )}`}
              negative={up.pendingAdjustmentsPaise < 0}
            />
          ) : null}
          <View style={styles.divider} />
          <BreakRow label="Net payable" value={formatPaise(owed)} strong />
        </View>

        {/* Early disbursement */}
        <View style={styles.card}>
          <AppText variant="sectionLabel" color={colors.meta} style={styles.blockLabel}>
            Early payout
          </AppText>
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
              <StatusChip label={EARLY_STATUS[pendingEarly.status].label} tone={EARLY_STATUS[pendingEarly.status].tone} />
            </View>
          ) : (
            <>
              <AppText variant="meta" color={colors.meta} style={styles.earlyHint}>
                Get part of what you're owed before the next cycle. Needs admin
                approval and a small fee.
              </AppText>
              <PrimaryButton
                label="Request early payout"
                tone="surface"
                disabled={owed <= 0}
                onPress={() => setSheetOpen(true)}
              />
            </>
          )}
        </View>

        {/* Deep-link to full statement */}
        <PressableScale
          onPress={() => Linking.openURL(WEB_PORTAL_PAYOUTS_URL)}
          style={styles.linkRow}
          toScale={0.98}
        >
          <View style={styles.linkIcon}>
            <Icon name="document-text-outline" size={20} color={colors.accentInk} />
          </View>
          <View style={styles.flex}>
            <AppText variant="bodyMedium" color={colors.ink}>
              Full statement
            </AppText>
            <AppText variant="meta" color={colors.meta}>
              Open payout history & invoices in the web portal
            </AppText>
          </View>
          <Icon name="open-outline" size={18} color={colors.meta} />
        </PressableScale>
      </ScrollView>

      {/* Early-payout request sheet */}
      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
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
            onChangeText={setAmount}
            placeholder="0"
            keyboardType="numeric"
            error={amountErr}
          />
          <Field
            label="Reason"
            value={reason}
            onChangeText={setReason}
            placeholder="Why do you need it early?"
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

function BreakRow({
  label,
  value,
  negative,
  strong,
}: {
  label: string;
  value: string;
  negative?: boolean;
  strong?: boolean;
}) {
  return (
    <View style={styles.breakRow}>
      <AppText variant={strong ? 'bodyMedium' : 'body'} color={strong ? colors.ink : colors.meta}>
        {label}
      </AppText>
      <AppText
        variant={strong ? 'bodyMedium' : 'body'}
        color={strong ? colors.ink : negative ? colors.danger : colors.ink}
      >
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xs, paddingBottom: spacing.xxl, gap: spacing.md },
  headerRow: { marginBottom: spacing.xs },
  h1: { fontSize: 26, lineHeight: 30, marginBottom: spacing.sm },
  flex: { flex: 1 },
  alignEnd: { alignItems: 'flex-end' },
  hero: {
    backgroundColor: colors.accent,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  heroAmt: { fontSize: 34, lineHeight: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cadence: { marginTop: spacing.xs },
  blockLabel: {},
  breakRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  divider: { height: 1, backgroundColor: colors.hairline, marginVertical: spacing.xs },
  earlyHint: { marginBottom: spacing.xs },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  linkIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: { padding: spacing.lg, gap: spacing.md },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
});
