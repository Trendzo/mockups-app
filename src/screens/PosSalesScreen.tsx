import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  AppText,
  Banner,
  EmptyState,
  FilterChips,
  Icon,
  IconButton,
  PressableScale,
  Screen,
  ScreenHeader,
  StatusChip,
} from '../components';
import type { FilterOption } from '../components';
import { ScreenProps } from '../navigation/types';
import { usePullRefresh } from '../utils/usePullRefresh';
import { useDebouncedValue, usePosSales } from '../api/posHooks';
import { errorMessage } from '../api/request';
import { PosSaleRow, posSaleBadge } from '../types/pos';
import { formatPaise } from '../utils/money';
import { formatDayDate, formatTime, fromYmd, plural, todayYmd } from '../utils/format';
import { colors, radii, spacing, type as typeScale } from '../theme/theme';

type Range = 'today' | 'yesterday' | 'week' | 'month';

const RANGES: FilterOption<Range>[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
];

/** Local start-of-day → end-of-day for the range, as ISO instants. */
function rangeBounds(range: Range, today: Date): { from: string; to: string } {
  const back = range === 'yesterday' ? 1 : range === 'week' ? 6 : range === 'month' ? 29 : 0;
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
  const endDay = range === 'yesterday' ? today.getDate() - 1 : today.getDate();
  const to = new Date(today.getFullYear(), today.getMonth(), endDay, 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

const money = (p: number) => (p < 0 ? `− ${formatPaise(-p)}` : formatPaise(p));

/** Counter sales history: by day range, searchable by invoice number. */
export function PosSalesScreen({ navigation }: ScreenProps<'PosSales'>) {
  const [range, setRange] = useState<Range>('today');
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  // Re-derived when the calendar day rolls over (the screen can stay open overnight).
  const today = todayYmd();
  const bounds = useMemo(() => rangeBounds(range, fromYmd(today)), [range, today]);
  const salesQ = usePosSales({ q: q || undefined, ...bounds });
  const pull = usePullRefresh(salesQ.refetch);
  const rows = useMemo(() => salesQ.data ?? [], [salesQ.data]);

  const summary = useMemo(() => {
    const counted = rows.filter((r) => r.status !== 'voided');
    return { count: counted.length, total: counted.reduce((s, r) => s + r.payablePaise, 0) };
  }, [rows]);
  const showDate = range === 'week' || range === 'month';

  return (
    <Screen edges={['top']}>
      <ScreenHeader
        overline="Billing counter"
        title="Sales"
        onBack={() => navigation.goBack()}
        right={<IconButton icon="add" tone="ink" onPress={() => navigation.popTo('Register')} />}
      />

      <FilterChips options={RANGES} value={range} onChange={setRange} style={styles.chips} />

      <View style={styles.searchBox}>
        <Icon name="search" size={18} color={colors.meta} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search invoice number"
          placeholderTextColor={colors.inkMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.searchInput}
        />
        {search ? (
          <PressableScale onPress={() => setSearch('')} haptic={false} hitSlop={10}>
            <Icon name="close-circle" size={18} color={colors.inkMuted} />
          </PressableScale>
        ) : null}
      </View>

      {salesQ.isLoading ? (
        <ActivityIndicator color={colors.ink} style={styles.loader} />
      ) : salesQ.isError && !salesQ.data ? (
        <Banner
          tone="danger"
          title="Couldn't load sales"
          message={errorMessage(salesQ.error)}
          actionLabel="Retry"
          onAction={() => salesQ.refetch()}
          style={styles.gapTop}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.ink}
            />
          }
          ListHeaderComponent={
            rows.length ? (
              <View style={styles.summary}>
                <AppText variant="bodyMedium" color={colors.ink} style={styles.flex}>
                  {plural(summary.count, 'bill')}
                </AppText>
                {/* Always mounted, so the row doesn't resize as it starts/stops. */}
                <ActivityIndicator
                  size="small"
                  color={colors.ink}
                  animating={salesQ.isPlaceholderData}
                  hidesWhenStopped={false}
                  style={salesQ.isPlaceholderData ? null : styles.hidden}
                />
                <AppText variant="bodyMedium" color={colors.ink}>
                  {money(summary.total)}
                </AppText>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title={q ? `No bills match “${q}”` : 'No bills in this period'}
              message={q ? 'Check the invoice number and try again.' : 'Completed counter sales show up here.'}
            />
          }
          renderItem={({ item }) => (
            <SaleRow
              row={item}
              showDate={showDate}
              onPress={() => navigation.navigate('PosSaleDetail', { id: item.id })}
            />
          )}
        />
      )}
    </Screen>
  );
}

function SaleRow({ row, showDate, onPress }: { row: PosSaleRow; showDate: boolean; onPress: () => void }) {
  const badge = posSaleBadge(row);
  const voided = row.status === 'voided';
  const when = showDate
    ? `${formatDayDate(row.completedAt)}, ${formatTime(row.completedAt)}`
    : formatTime(row.completedAt);
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={styles.row}>
      <View style={styles.flex}>
        <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
          {row.invoiceNumber || 'Draft'}
        </AppText>
        <AppText variant="meta" color={colors.meta} numberOfLines={1}>
          {row.customerName || row.customerPhone || 'Walk-in'} · {when}
        </AppText>
      </View>
      <View style={styles.rowEnd}>
        <AppText
          variant="bodyMedium"
          color={voided ? colors.meta : colors.ink}
          style={voided ? styles.strike : undefined}
        >
          {money(row.payablePaise)}
        </AppText>
        <StatusChip label={badge.label} tone={badge.tone} style={styles.chipEnd} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { marginTop: spacing.md },
  gapTop: { marginTop: spacing.md },
  loader: { marginTop: spacing.xl },
  searchBox: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.sm + 4,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    color: colors.ink,
    fontFamily: typeScale.body.fontFamily,
    fontSize: 15,
  },
  list: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  rowEnd: { alignItems: 'flex-end', gap: spacing.xs },
  chipEnd: { alignSelf: 'flex-end' },
  hidden: { opacity: 0 },
  strike: { textDecorationLine: 'line-through' },
});
