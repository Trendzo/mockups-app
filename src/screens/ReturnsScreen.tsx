import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import {
  AppText,
  Banner,
  EmptyState,
  FilterChips,
  Icon,
  PressableScale,
  Screen,
  ScreenHeader,
  SegmentedControl,
  StatusChip,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useReturns } from '../api/returnsHooks';
import { errorMessage } from '../api/request';
import type { ReturnDecision } from '../types/orders';
import {
  AGENT_DISPOSITION_LABEL,
  ReturnFilters,
  ReturnRow,
  goodsAtStore,
  returnDecisionMeta,
} from '../types/returns';
import { cashOwedTotal, sortReturnsQueue, useNow, verificationWindowLeft } from '../utils/orders';
import { formatPaise } from '../utils/money';
import { shortRef, timeAgo } from '../utils/format';
import { usePermissions } from '../utils/usePermission';
import { usePullRefresh } from '../utils/usePullRefresh';
import { colors, radii, spacing } from '../theme/theme';

type Kind = 'door' | 'standard';
type Decision = 'all' | ReturnDecision;

const KIND_OF: Record<Kind, string> = { door: 'door_return', standard: 'standard_return' };

const DECISIONS: { value: Decision; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'To verify' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Declined' },
];

const EMPTY: Record<Decision, string> = {
  all: 'Returns on your orders show up here.',
  pending: 'Nothing is waiting for your verification.',
  accepted: 'No accepted returns.',
  rejected: 'No declined returns.',
};

/**
 * The returns verification queue: door returns (a try-and-buy customer handed
 * items back at the door) and standard returns (opened after delivery). What needs
 * a decision is on top, then any cash still owed to a customer.
 */
export function ReturnsScreen({ navigation }: ScreenProps<'Returns'>) {
  const { can } = usePermissions();
  const allowed = can('returns.view');
  const [kind, setKind] = useState<Kind>('door');
  const [decision, setDecision] = useState<Decision>('all');

  const filters = useMemo<ReturnFilters>(
    () => ({ ...(decision === 'all' ? {} : { decision }), limit: 200 }),
    [decision],
  );
  const q = useReturns(filters, allowed);
  const pull = usePullRefresh(q.refetch);
  const now = useNow(30_000);

  const all = useMemo(() => q.data ?? [], [q.data]);
  const count = (k: Kind) => all.filter((r) => r.kind === KIND_OF[k]).length;
  const rows = useMemo(
    () => sortReturnsQueue(all.filter((r) => r.kind === KIND_OF[kind])),
    [all, kind],
  );
  const cash = useMemo(() => cashOwedTotal(all), [all]);

  return (
    <Screen edges={['top']}>
      <ScreenHeader overline="Returns" title="Returns queue" onBack={() => navigation.goBack()} />

      {!allowed ? (
        <EmptyState
          icon="lock-closed-outline"
          title="You don't have access to returns"
          message="Ask the store owner to turn on returns access for your login."
        />
      ) : (
        <>
          <View style={styles.segment}>
            <SegmentedControl<Kind>
              options={[
                { value: 'door', label: `Door returns · ${count('door')}` },
                { value: 'standard', label: `Standard returns · ${count('standard')}` },
              ]}
              value={kind}
              onChange={setKind}
              compact
            />
          </View>
          <FilterChips options={DECISIONS} value={decision} onChange={setDecision} style={styles.chips} />

          {cash.legs > 0 ? (
            <Banner
              tone="warning"
              title={`${formatPaise(cash.paise)} in cash refunds to hand over`}
              message="Cash-on-delivery refunds are paid across the counter. Open the return to record it."
              style={styles.banner}
            />
          ) : null}

          {q.isLoading ? (
            <ActivityIndicator color={colors.ink} style={styles.loader} />
          ) : q.isError && !q.data ? (
            <Banner
              tone="danger"
              title="Couldn't load returns"
              message={errorMessage(q.error)}
              actionLabel="Retry"
              onAction={() => q.refetch()}
              style={styles.banner}
            />
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(r) => r.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={colors.ink} />
              }
              ListEmptyComponent={
                <EmptyState
                  icon="return-down-back-outline"
                  title={kind === 'door' ? 'No door returns' : 'No standard returns'}
                  message={EMPTY[decision]}
                />
              }
              renderItem={({ item }) => (
                <ReturnCard
                  row={item}
                  now={now}
                  onPress={() => navigation.navigate('ReturnDetail', { id: item.id })}
                />
              )}
            />
          )}
        </>
      )}
    </Screen>
  );
}

function ReturnCard({ row, now, onPress }: { row: ReturnRow; now: number; onPress: () => void }) {
  const meta = returnDecisionMeta(row.storeDecision);
  const pending = row.storeDecision === 'pending';
  const win = pending ? verificationWindowLeft(row.verificationWindowExpiresAt, now) : null;
  const waitingForGoods = pending && !goodsAtStore(row);
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={[styles.card, pending && styles.cardPending]}>
      <View style={styles.topRow}>
        <AppText variant="bodyMedium" color={colors.ink} style={styles.flex} numberOfLines={2}>
          {row.orderItem.listingNameSnap}
        </AppText>
        <StatusChip label={meta.label} tone={meta.tone} style={styles.chip} />
      </View>
      <AppText variant="meta" color={colors.meta} numberOfLines={1}>
        {[row.orderItem.attributesLabelSnap, row.orderItem.order.consumerNameSnap, shortRef(row.orderItem.orderId)]
          .filter(Boolean)
          .join(' · ')}
      </AppText>

      {row.cashRefundDue || row.agentDisposition ? (
        <View style={styles.chipRow}>
          {row.cashRefundDue ? (
            <StatusChip
              label={`${formatPaise(row.cashRefundDue.amountPaise)} cash to hand over`}
              tone="warning"
              style={styles.chip}
            />
          ) : null}
          {row.agentDisposition ? (
            <StatusChip
              label={`Agent: ${AGENT_DISPOSITION_LABEL[row.agentDisposition] ?? row.agentDisposition}`}
              tone={row.agentDisposition === 'refused' ? 'danger' : row.agentDisposition === 'returned' ? 'warning' : 'neutral'}
              style={styles.chip}
            />
          ) : null}
        </View>
      ) : null}

      {row.reasonText ? (
        <AppText variant="meta" color={colors.ink} numberOfLines={2}>
          “{row.reasonText}”
        </AppText>
      ) : null}

      <View style={styles.bottomRow}>
        <Icon
          name={waitingForGoods ? 'cube-outline' : win ? 'timer-outline' : 'time-outline'}
          size={14}
          color={win?.urgent ? colors.danger : colors.meta}
        />
        <AppText variant="meta" color={win?.urgent ? colors.danger : colors.meta} style={styles.flex} numberOfLines={1}>
          {waitingForGoods
            ? `Opened ${timeAgo(row.openedAt)} · goods not at your store yet`
            : win
              ? `Opened ${timeAgo(row.openedAt)} · verification ${win.expired ? 'window expired' : win.label}`
              : `Opened ${timeAgo(row.openedAt)}`}
        </AppText>
        <Icon name="chevron-forward" size={16} color={colors.meta} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  segment: { marginTop: spacing.md },
  chips: { marginTop: spacing.sm },
  banner: { marginTop: spacing.md },
  loader: { marginTop: spacing.xl },
  list: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: 4,
  },
  cardPending: { borderWidth: 1.5, borderColor: colors.ink },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  chip: { alignSelf: 'center' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
});
