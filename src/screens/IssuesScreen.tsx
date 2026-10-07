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
  StatusChip,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useIssues, useIssuesAwaitingStore } from '../api/issuesHooks';
import { errorMessage } from '../api/request';
import {
  IssueFilters,
  IssueRow,
  issueDecisionLabel,
  issueStatusMeta,
  needsRetailerResponse,
} from '../types/issues';
import { shortRef, timeAgo } from '../utils/format';
import { usePermissions } from '../utils/usePermission';
import { usePullRefresh } from '../utils/usePullRefresh';
import { colors, radii, spacing } from '../theme/theme';

type Chip = 'all' | 'needs' | 'open' | 'requested_evidence' | 'escalated' | 'decided';

/** Each chip is a server-side filter on GET /retailer/issues. */
const CHIP_FILTER: Record<Chip, IssueFilters> = {
  all: {},
  needs: { awaitingParty: 'retailer' },
  open: { status: 'open' },
  requested_evidence: { status: 'requested_evidence' },
  escalated: { status: 'escalated' },
  decided: { status: 'decided' },
};

const CHIP_LABEL: Record<Chip, string> = {
  all: 'All',
  needs: 'Needs response',
  open: 'Open',
  requested_evidence: 'Evidence requested',
  escalated: 'Escalated',
  decided: 'Decided',
};

const EMPTY_COPY: Record<Chip, string> = {
  all: 'Disputes linked to your store’s orders and returns show up here.',
  needs: 'Nothing is waiting on your reply.',
  open: 'No open disputes.',
  requested_evidence: 'Trendzo has not asked for more evidence on any dispute.',
  escalated: 'No escalated disputes.',
  decided: 'No decided disputes yet.',
};

/** Disputes on the store's orders and returns — newest activity first, polled every 10s. */
export function IssuesScreen({ navigation, route }: ScreenProps<'Issues'>) {
  const orderId = route.params?.orderId;
  const { can } = usePermissions();
  const allowed = can('disputes.view');
  const [chip, setChip] = useState<Chip>('all');

  const filters = useMemo<IssueFilters>(
    () => ({ ...CHIP_FILTER[chip], ...(orderId ? { orderId } : {}), limit: 200 }),
    [chip, orderId],
  );
  const q = useIssues(filters, allowed);
  const awaiting = useIssuesAwaitingStore(allowed && !orderId);
  const pull = usePullRefresh(q.refetch);
  const rows = q.data ?? [];

  const options = (Object.keys(CHIP_LABEL) as Chip[]).map((k) => ({
    value: k,
    label: CHIP_LABEL[k],
    count: k === 'needs' && !orderId ? awaiting.count : undefined,
  }));

  return (
    <Screen edges={['top']}>
      <ScreenHeader
        overline="Support"
        title={orderId ? `Disputes · ${shortRef(orderId)}` : 'Disputes'}
        onBack={() => navigation.goBack()}
      />

      {!allowed ? (
        <EmptyState
          icon="lock-closed-outline"
          title="You don't have access to disputes"
          message="Ask the store owner to turn on dispute access for your login."
        />
      ) : (
        <>
          <FilterChips options={options} value={chip} onChange={setChip} style={styles.chips} />
          {orderId ? (
            <Banner
              tone="neutral"
              title={`Showing disputes for order ${shortRef(orderId)}`}
              actionLabel="Show all"
              onAction={() => navigation.setParams({ orderId: undefined })}
              style={styles.banner}
            />
          ) : null}

          {q.isLoading ? (
            <ActivityIndicator color={colors.ink} style={styles.loader} />
          ) : q.isError && !q.data ? (
            <Banner
              tone="danger"
              title="Couldn't load disputes"
              message={errorMessage(q.error)}
              actionLabel="Retry"
              onAction={() => q.refetch()}
              style={styles.banner}
            />
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(i) => i.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={colors.ink} />
              }
              ListEmptyComponent={
                <EmptyState
                  icon="chatbubbles-outline"
                  title="No disputes"
                  message={`${EMPTY_COPY[chip]}${
                    chip === 'all' && can('issues.create')
                      ? ' To raise one, open an order and tap “Raise dispute”.'
                      : ''
                  }`}
                  actionLabel={chip === 'all' && can('issues.create') ? 'Go to orders' : undefined}
                  onAction={() => navigation.navigate('Orders')}
                />
              }
              renderItem={({ item }) => (
                <IssueCard issue={item} onPress={() => navigation.navigate('IssueDetail', { id: item.id })} />
              )}
            />
          )}
        </>
      )}
    </Screen>
  );
}

function IssueCard({ issue, onPress }: { issue: IssueRow; onPress: () => void }) {
  const meta = issueStatusMeta(issue.status);
  const needs = needsRetailerResponse(issue);
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={[styles.card, needs && styles.cardNeeds]}>
      <View style={styles.topRow}>
        <StatusChip label={meta.label} tone={meta.tone} style={styles.chip} />
        {needs ? <StatusChip label="Needs your response" tone="warning" style={styles.chip} /> : null}
        <View style={styles.flex} />
        <AppText variant="meta" color={colors.meta}>
          {timeAgo(issue.lastMessageAt || issue.createdAt)}
        </AppText>
      </View>
      <AppText variant="bodyMedium" color={colors.ink} numberOfLines={2}>
        {issue.subject}
      </AppText>
      <AppText variant="meta" color={colors.meta} numberOfLines={2}>
        {issue.description}
      </AppText>
      <View style={styles.bottomRow}>
        <Icon name={issue.orderId ? 'receipt-outline' : 'return-down-back-outline'} size={14} color={colors.meta} />
        <AppText variant="meta" color={colors.meta} style={styles.flex} numberOfLines={1}>
          {issue.orderId ? `Order ${shortRef(issue.orderId)}` : `Return ${shortRef(issue.returnId)}`}
          {issue.decision ? ` · Decision: ${issueDecisionLabel(issue.decision)}` : ''}
        </AppText>
        <Icon name="chevron-forward" size={16} color={colors.meta} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chips: { marginTop: spacing.md },
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
  cardNeeds: { borderWidth: 1.5, borderColor: colors.ink },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  chip: { alignSelf: 'center' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
});
