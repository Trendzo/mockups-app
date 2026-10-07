import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import {
  AppText,
  Banner,
  EmptyState,
  FilterChips,
  Icon,
  ListRow,
  PressableScale,
  Screen,
  ScreenHeader,
  StatusChip,
} from '../components';
import type { FilterOption } from '../components';
import { ScreenProps } from '../navigation/types';
import { usePayouts, useUpcomingPayout } from '../api/earningsHooks';
import { errorMessage } from '../api/request';
import { bankTail, cycleLabel, PayoutRow, payoutStatusMeta } from '../types/earnings';
import { usePermissions } from '../utils/usePermission';
import { formatPaise } from '../utils/money';
import { formatDate, formatDayDate, plural } from '../utils/format';
import { colors, radii, spacing } from '../theme/theme';

type Filter = 'all' | 'paid' | 'scheduled' | 'failed';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'paid', label: 'Paid' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'failed', label: 'Failed' },
];

const EMPTY: Record<Filter, { icon: string; title: string; message: string }> = {
  all: {
    icon: 'wallet-outline',
    title: 'No payouts yet',
    message: 'Your first payout appears here once a cycle settles.',
  },
  paid: {
    icon: 'checkmark-done-outline',
    title: 'No paid payouts yet',
    message: 'Payouts show up here once they reach your bank.',
  },
  scheduled: {
    icon: 'time-outline',
    title: 'Nothing scheduled',
    message: 'Payouts waiting to be sent show up here.',
  },
  failed: {
    icon: 'checkmark-circle-outline',
    title: 'No failed payouts',
    message: "Payouts that couldn't reach your bank show up here.",
  },
};

function inFilter(p: PayoutRow, filter: Filter): boolean {
  switch (filter) {
    case 'paid':
      return p.status === 'paid';
    case 'scheduled':
      return p.status === 'pending' || p.status === 'processing';
    case 'failed':
      return p.status === 'failed';
    default:
      return true;
  }
}

/** Every settlement cycle sent (or due) to the store's bank, newest first. */
export function PayoutsScreen({ navigation }: ScreenProps<'Payouts'>) {
  const { can } = usePermissions();
  const allowed = can('payouts.view');
  const payoutsQ = usePayouts(allowed);
  const upcomingQ = useUpcomingPayout(allowed);
  const up = upcomingQ.data;
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const payouts = useMemo(() => payoutsQ.data ?? [], [payoutsQ.data]);
  const rows = useMemo(() => payouts.filter((p) => inFilter(p, filter)), [payouts, filter]);
  const options: FilterOption<Filter>[] = useMemo(
    () =>
      FILTERS.map((f) => ({ ...f, count: payouts.filter((p) => inFilter(p, f.value)).length })),
    [payouts],
  );
  const paid = payouts.filter((p) => p.status === 'paid');
  const paidTotal = paid.reduce((sum, p) => sum + (p.netPaise || 0), 0);
  const failedCount = payouts.filter((p) => p.status === 'failed').length;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([payoutsQ.refetch(), upcomingQ.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  if (!allowed) {
    return (
      <Screen edges={['top']}>
        <ScreenHeader overline="Payments" title="Payout history" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="lock-closed-outline"
          title="Not available for your role"
          message="Ask the store owner or a manager about payouts."
        />
      </Screen>
    );
  }

  const header = (
    <View style={styles.listHeader}>
      {/* Hidden only when it can't load at all (e.g. no access to earnings). */}
      {up || !upcomingQ.isError ? (
        <NextPayoutCard
          amount={up ? formatPaise(up.outstandingPayable) : '…'}
          date={up ? formatDayDate(up.nextCycleDate) : '…'}
          // pop: return to an open Earnings screen instead of stacking another.
          onPress={() => navigation.navigate('Earnings', undefined, { pop: true })}
        />
      ) : null}

      {/* Below the next-payout card, so it can't push that card down as it loads. */}
      {failedCount > 0 ? (
        <Banner
          tone="warning"
          title={failedCount === 1 ? 'A payout failed' : `${failedCount} payouts failed`}
          message="It retries automatically. If it keeps failing, check your bank details."
          actionLabel="Update bank details"
          onAction={() => navigation.navigate('ChangeRequest')}
        />
      ) : null}

      <ListRow
        icon="document-text-outline"
        label="Billing statements"
        hint="Gross to net for every cycle"
        onPress={() => navigation.navigate('BillingStatements')}
      />

      {payouts.length > 0 ? (
        <>
          <FilterChips options={options} value={filter} onChange={setFilter} />
          {paid.length > 0 ? (
            <AppText variant="body" color={colors.meta}>
              Paid so far{' '}
              <AppText variant="bodyMedium" color={colors.ink}>
                {formatPaise(paidTotal)}
              </AppText>{' '}
              across {plural(paid.length, 'payout')}
            </AppText>
          ) : null}
        </>
      ) : null}
    </View>
  );

  return (
    <Screen edges={['top']}>
      <ScreenHeader overline="Payments" title="Payout history" onBack={() => navigation.goBack()} />
      <FlatList
        data={rows}
        keyExtractor={(p) => p.id}
        // Full-bleed list (gutter moved into the content) so the filter row can
        // scroll edge to edge.
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />
        }
        ListHeaderComponent={header}
        ListEmptyComponent={
          payoutsQ.isLoading ? (
            <ActivityIndicator color={colors.ink} style={styles.loader} />
          ) : payoutsQ.isError ? (
            <Banner
              tone="danger"
              title="Couldn't load payouts"
              message={errorMessage(payoutsQ.error)}
              actionLabel="Retry"
              onAction={() => payoutsQ.refetch()}
            />
          ) : (
            <EmptyState {...EMPTY[payouts.length > 0 ? filter : 'all']} />
          )
        }
        renderItem={({ item }) => (
          <PayoutCard
            payout={item}
            onPress={() => navigation.navigate('PayoutDetail', { id: item.id })}
          />
        )}
      />
    </Screen>
  );
}

function NextPayoutCard({
  amount,
  date,
  onPress,
}: {
  amount: string;
  date: string;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={styles.nextCard}>
      <View style={styles.nextIcon}>
        <Icon name="calendar-outline" size={20} color={colors.accentInk} />
      </View>
      <View style={styles.flex}>
        <AppText variant="sectionLabel" color={colors.meta} numberOfLines={1}>
          Next payout
        </AppText>
        <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
          {date}
        </AppText>
      </View>
      <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
        {amount}
      </AppText>
      <Icon name="chevron-forward" size={18} color={colors.meta} />
    </PressableScale>
  );
}

function PayoutCard({ payout, onPress }: { payout: PayoutRow; onPress: () => void }) {
  const status = payoutStatusMeta(payout.status);
  const tail = bankTail(payout.bankAccountMasked);
  const bankLine = [
    tail ? `Bank ${tail}` : null,
    payout.bankConfirmationRef ? `UTR ${payout.bankConfirmationRef}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const dateLine = [
    payout.initiatedAt ? `Initiated ${formatDate(payout.initiatedAt)}` : null,
    payout.settledAt ? `Settled ${formatDate(payout.settledAt)}` : null,
    payout.retryCount > 0 ? plural(payout.retryCount, 'retry', 'retries') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <PressableScale onPress={onPress} toScale={0.98} style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitle}>
          <AppText variant="bodyMedium" color={colors.ink} numberOfLines={2}>
            {cycleLabel(payout) || 'Payout'}
          </AppText>
          <StatusChip label={status.label} tone={status.tone} />
        </View>
        <AppText variant="bodyMedium" color={colors.ink}>
          {formatPaise(payout.netPaise)}
        </AppText>
      </View>
      {/* Net is what reached (or will reach) the bank. */}
      <AppText variant="meta" color={colors.meta}>
        Sales {formatPaise(payout.grossPaise)} · Net {formatPaise(payout.netPaise)}
      </AppText>
      {bankLine ? (
        <AppText variant="meta" color={colors.meta}>
          {bankLine}
        </AppText>
      ) : null}
      {dateLine ? (
        <AppText variant="meta" color={colors.meta}>
          {dateLine}
        </AppText>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { marginHorizontal: -spacing.screenH },
  listContent: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  listHeader: { gap: spacing.md, marginBottom: spacing.xs },
  loader: { marginTop: spacing.xl },
  nextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  nextIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  cardTitle: { flex: 1, gap: 6 },
});
