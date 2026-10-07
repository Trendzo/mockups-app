import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  Banner,
  DetailRow,
  Divider,
  Icon,
  Panel,
  PressableScale,
  Screen,
  ScreenHeader,
  StatusChip,
} from '../components';
import type { StatusTone } from '../components';
import { ScreenProps } from '../navigation/types';
import { usePayout, usePayoutDeductions } from '../api/earningsHooks';
import { errorMessage } from '../api/request';
import { bankTail, PayoutDeductions, PayoutRow, payoutStatusMeta } from '../types/earnings';
import { formatPaise } from '../utils/money';
import {
  formatDateTime,
  formatDayDate,
  humanize,
  parseDate,
  shortRef,
  timeAgo,
} from '../utils/format';
import { colors, radii, spacing } from '../theme/theme';

type Chip = { label: string; tone: StatusTone };

const HOLD_STATUS: Record<string, Chip> = {
  active: { label: 'Held', tone: 'warning' },
  released: { label: 'Released', tone: 'success' },
};

const RECOVERY_STATUS: Record<string, Chip> = {
  planned: { label: 'Planned', tone: 'pending' },
  debited: { label: 'Deducted', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'danger' },
};

/** Status dot on the black hero, where the light StatusChip tints don't read. */
const HERO_DOT: Record<StatusTone, string> = {
  success: colors.success,
  danger: colors.danger,
  warning: '#B8860B',
  pending: colors.accentInk,
  neutral: colors.accentSub,
};

const chipFor = (map: Record<string, Chip>, status: string): Chip =>
  map[status] ?? { label: humanize(status), tone: 'neutral' };

// Deductions render as "− ₹X" whichever sign the server stores them with.
const minus = (paise: number) => `− ${formatPaise(Math.abs(paise))}`;
const signed = (paise: number) => `${paise > 0 ? '+' : '−'} ${formatPaise(Math.abs(paise))}`;

/** "3h ago" / "Yesterday" — only when it adds something beyond the date itself. */
function recentAgo(iso?: string | null): string | undefined {
  const d = parseDate(iso);
  if (!d || d.getTime() > Date.now()) return undefined;
  const ago = timeAgo(iso);
  return ago === formatDayDate(iso) ? undefined : ago;
}

function heroLine(p: PayoutRow): string {
  const tail = bankTail(p.bankAccountMasked);
  const bank = tail ? `bank ${tail}` : 'your bank';
  switch (p.status) {
    case 'paid':
      return `Paid to ${bank}`;
    case 'processing':
      return `On its way to ${bank}`;
    case 'pending':
      return `Will be paid to ${bank}`;
    case 'failed':
      return `Couldn't be paid to ${bank}`;
    default:
      return tail ? `Bank ${tail}` : '';
  }
}

/** One settlement: what reached the bank, the transfer details, and how gross became net. */
export function PayoutDetailScreen({ navigation, route }: ScreenProps<'PayoutDetail'>) {
  const { id } = route.params;
  const payoutQ = usePayout(id);
  const dedQ = usePayoutDeductions(id);
  const p = payoutQ.data;
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([payoutQ.refetch(), dedQ.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const openOrder = (orderId: string) => navigation.navigate('OrderDetail', { id: orderId });

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
          overline="Payout"
          title={p?.period || 'Payout details'}
          onBack={() => navigation.goBack()}
        />

        {p ? (
          <>
            {p.status === 'failed' ? (
              <Banner
                tone="danger"
                title="This payout failed"
                message="It retries automatically. If it keeps failing, check your bank details."
                actionLabel="Update bank details"
                onAction={() => navigation.navigate('ChangeRequest')}
              />
            ) : null}

            <Hero payout={p} />
            <TransferPanel payout={p} />

            {dedQ.isLoading ? (
              <Panel title="How this was calculated">
                <ActivityIndicator color={colors.ink} style={styles.panelLoader} />
              </Panel>
            ) : dedQ.isError && !dedQ.data ? (
              <Banner
                tone="danger"
                title="Couldn't load the breakdown"
                message={errorMessage(dedQ.error)}
                actionLabel="Retry"
                onAction={() => dedQ.refetch()}
              />
            ) : dedQ.data ? (
              <Deductions data={dedQ.data} onOpenOrder={openOrder} />
            ) : null}
          </>
        ) : payoutQ.isError ? (
          <Banner
            tone="danger"
            title="Couldn't load this payout"
            message={errorMessage(payoutQ.error)}
            actionLabel="Retry"
            onAction={() => {
              payoutQ.refetch();
              dedQ.refetch();
            }}
          />
        ) : (
          <ActivityIndicator color={colors.ink} style={styles.loader} />
        )}
      </ScrollView>
    </Screen>
  );
}

function Hero({ payout }: { payout: PayoutRow }) {
  const status = payoutStatusMeta(payout.status);
  const line = heroLine(payout);
  return (
    <View style={styles.hero}>
      <View style={styles.heroPill}>
        <View style={[styles.heroDot, { backgroundColor: HERO_DOT[status.tone] }]} />
        <AppText variant="meta" color={colors.accentInk}>
          {status.label}
        </AppText>
      </View>
      <AppText variant="cardTitle" color={colors.accentInk} style={styles.heroAmt}>
        {formatPaise(payout.amountPaise)}
      </AppText>
      {line ? (
        <AppText variant="meta" color={colors.accentSub}>
          {line}
        </AppText>
      ) : null}
    </View>
  );
}

function TransferPanel({ payout }: { payout: PayoutRow }) {
  const utr = payout.bankConfirmationRef;
  return (
    <Panel title="Bank transfer">
      <DetailRow
        label="Account"
        value={bankTail(payout.bankAccountMasked) ?? (payout.bankAccountMasked || '—')}
      />
      {/* DetailRow's layout, but the reference must be selectable to copy. */}
      <View style={styles.refRow}>
        <View style={styles.refLabel}>
          <AppText variant="body" color={colors.meta}>
            UTR / reference
          </AppText>
          {utr ? (
            <AppText variant="meta" color={colors.meta}>
              Your bank can trace the transfer with this
            </AppText>
          ) : null}
        </View>
        <AppText variant="body" color={colors.ink} selectable style={styles.refValue}>
          {utr || '—'}
        </AppText>
      </View>
      <DetailRow
        label="Retries"
        value={payout.retryCount > 0 ? String(payout.retryCount) : 'None'}
      />
      <DetailRow
        label="Initiated"
        value={payout.initiatedAt ? formatDateTime(payout.initiatedAt) : 'Not yet'}
        hint={recentAgo(payout.initiatedAt)}
        tone={payout.initiatedAt ? 'default' : 'muted'}
      />
      <DetailRow
        label="Settled"
        value={payout.settledAt ? formatDateTime(payout.settledAt) : 'Not yet'}
        hint={recentAgo(payout.settledAt)}
        tone={payout.settledAt ? 'default' : 'muted'}
      />
    </Panel>
  );
}

function Deductions({
  data,
  onOpenOrder,
}: {
  data: PayoutDeductions;
  onOpenOrder: (orderId: string) => void;
}) {
  const holds = data.holds ?? [];
  const adjustments = data.adjustments ?? [];
  const recoveries = data.recoveries ?? [];

  return (
    <>
      {data.breakdown ? <CalculationPanel b={data.breakdown} /> : null}

      {holds.length > 0 ? (
        <Panel title="Held for disputes">
          <AppText variant="meta" color={colors.meta}>
            Money from disputed orders is held until the dispute is resolved.
          </AppText>
          {holds.map((h, i) => (
            <React.Fragment key={h.id}>
              {i > 0 ? <Divider /> : null}
              <LineItem
                title={h.disputeId ? `Dispute #${h.disputeId.slice(-8)}` : 'Dispute'}
                meta={h.reason}
                amount={formatPaise(h.amountPaise)}
                chip={chipFor(HOLD_STATUS, h.status)}
              />
            </React.Fragment>
          ))}
        </Panel>
      ) : null}

      {adjustments.length > 0 ? (
        <Panel title="Manual adjustments">
          {adjustments.map((a, i) => {
            const credit = a.direction === 'credit';
            return (
              <React.Fragment key={a.id}>
                {i > 0 ? <Divider /> : null}
                <LineItem
                  title={credit ? 'Credit' : 'Deduction'}
                  meta={a.reason}
                  amount={credit ? `+ ${formatPaise(a.amountPaise)}` : minus(a.amountPaise)}
                  amountColor={credit ? colors.success : colors.danger}
                />
              </React.Fragment>
            );
          })}
        </Panel>
      ) : null}

      {recoveries.length > 0 ? (
        <Panel title="Recovering earlier overpayments">
          <AppText variant="meta" color={colors.meta}>
            Refunds made after an earlier payout are taken back from this one.
          </AppText>
          {recoveries.map((r, i) => (
            <React.Fragment key={r.id}>
              {i > 0 ? <Divider /> : null}
              <LineItem
                title={`Order ${shortRef(r.orderId)}`}
                meta={`Refunded ${formatPaise(r.refundedPaise)}`}
                amount={minus(r.plannedDebitPaise)}
                amountColor={colors.danger}
                chip={chipFor(RECOVERY_STATUS, r.status)}
                onPress={r.orderId ? () => onOpenOrder(r.orderId) : undefined}
              />
            </React.Fragment>
          ))}
        </Panel>
      ) : null}
    </>
  );
}

/** Gross → net, line by line. */
function CalculationPanel({ b }: { b: PayoutDeductions['breakdown'] }) {
  const adjustmentsPaise = b.adjustmentsPaise ?? 0;
  // Commission and TCS always show (even at ₹0); other deductions only when they apply.
  const lines = [
    { label: 'Platform commission', paise: b.commissionPaise ?? 0, always: true },
    { label: 'GST on commission', paise: b.commissionTaxPaise ?? 0 },
    { label: 'TCS', paise: b.tcsPaise ?? 0, always: true },
    { label: 'Refunds held back', paise: b.refundsHeldPaise ?? 0 },
    { label: 'Overpaid earlier', paise: b.priorOverPayoutsPaise ?? 0 },
    { label: 'Held for disputes', paise: b.disputeHoldPaise ?? 0 },
  ].filter((l) => l.always || l.paise !== 0);

  return (
    <Panel title="How this was calculated">
      <DetailRow label="Gross sales" value={formatPaise(b.grossPaise)} />
      {lines.map((l) => (
        <DetailRow key={l.label} label={l.label} value={minus(l.paise)} tone="negative" />
      ))}
      {adjustmentsPaise !== 0 ? (
        <DetailRow
          label="Adjustments"
          value={signed(adjustmentsPaise)}
          tone={adjustmentsPaise > 0 ? 'positive' : 'negative'}
        />
      ) : null}
      <Divider />
      <DetailRow label="Net payout" value={formatPaise(b.netPaise)} strong />
    </Panel>
  );
}

/** Title + reason on the left, amount (+ status) on the right. */
function LineItem({
  title,
  meta,
  amount,
  amountColor = colors.ink,
  chip,
  onPress,
}: {
  title: string;
  meta?: string;
  amount: string;
  amountColor?: string;
  chip?: Chip;
  onPress?: () => void;
}) {
  const body = (
    <>
      <View style={styles.lineMain}>
        <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
          {title}
        </AppText>
        {meta ? (
          <AppText variant="meta" color={colors.meta}>
            {meta}
          </AppText>
        ) : null}
      </View>
      <View style={styles.lineSide}>
        <AppText variant="bodyMedium" color={amountColor}>
          {amount}
        </AppText>
        {chip ? (
          <View>
            <StatusChip label={chip.label} tone={chip.tone} />
          </View>
        ) : null}
      </View>
      {onPress ? (
        <Icon name="chevron-forward" size={16} color={colors.meta} style={styles.lineChevron} />
      ) : null}
    </>
  );
  if (!onPress) return <View style={styles.line}>{body}</View>;
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={styles.line}>
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, gap: spacing.md },
  loader: { marginTop: spacing.xl },
  panelLoader: { paddingVertical: spacing.md },
  hero: {
    backgroundColor: colors.accent,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginBottom: spacing.xs,
  },
  heroDot: { width: 7, height: 7, borderRadius: 4 },
  heroAmt: { fontSize: 34, lineHeight: 40 },
  refRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  refLabel: { flexShrink: 1 },
  refValue: { textAlign: 'right', flexShrink: 0, maxWidth: '60%' },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  lineMain: { flex: 1, gap: 2 },
  lineSide: { alignItems: 'flex-end', gap: spacing.xs },
  lineChevron: { alignSelf: 'center' },
});
