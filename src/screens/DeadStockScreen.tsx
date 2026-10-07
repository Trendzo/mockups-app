import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import {
  AppText,
  Banner,
  EmptyState,
  Field,
  FilterChips,
  IconButton,
  PressableScale,
  Screen,
  ScreenHeader,
  useToast,
} from '../components';
import type { FilterOption } from '../components';
import { ScreenProps } from '../navigation/types';
import { useDeadStock } from '../api/catalogHooks';
import { errorMessage } from '../api/request';
import type { DeadStockRow } from '../types/catalog';
import {
  clampDays,
  DEAD_STOCK_DEFAULT_DAYS,
  DEAD_STOCK_LIMIT,
  deadStockCsv,
  lastSoldLabel,
  totalUnits,
} from '../utils/deadStock';
import { savedMessage, saveTextFile } from '../utils/saveFile';
import { usePermissions } from '../utils/usePermission';
import { plural } from '../utils/format';
import { colors, radii, spacing } from '../theme/theme';

const PRESETS: FilterOption<string>[] = ['7', '15', '30', '60', '90', '180'].map((d) => ({
  value: d,
  label: `${d} days`,
}));

/**
 * Dead stock: in-stock variants nobody has ordered for N days (or ever), biggest piles
 * first, so the store can mark them down or retire them. Same report as the web portal.
 */
export function DeadStockScreen({ navigation }: ScreenProps<'DeadStock'>) {
  const toast = useToast();
  const { can } = usePermissions();
  const allowed = can('reports.view');
  const [daysText, setDaysText] = useState(String(DEAD_STOCK_DEFAULT_DAYS));
  // Only the settled number goes to the server.
  const [days, setDays] = useState(DEAD_STOCK_DEFAULT_DAYS);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDays(clampDays(daysText)), 400);
    return () => clearTimeout(t);
  }, [daysText]);

  const q = useDeadStock(days, allowed);
  const rows = q.data?.rows ?? [];
  const units = totalUnits(rows);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await q.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const exportCsv = async () => {
    if (saving || rows.length === 0) return;
    setSaving(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const saved = await saveTextFile(`dead-stock-${days}d-${stamp}.csv`, deadStockCsv(rows));
      toast.show(savedMessage(saved), 'success');
    } catch (e) {
      toast.show(errorMessage(e, "Couldn't save the file"), 'error');
    } finally {
      setSaving(false);
    }
  };

  const title = (
    <ScreenHeader
      overline="Inventory"
      title="Dead stock"
      onBack={() => navigation.goBack()}
      right={
        allowed ? (
          <IconButton
            icon="download-outline"
            onPress={exportCsv}
            disabled={saving || rows.length === 0}
          />
        ) : undefined
      }
    />
  );

  if (!allowed) {
    return (
      <Screen edges={['top']}>
        {title}
        <EmptyState
          icon="lock-closed-outline"
          title="Not available for your role"
          message="Ask the store owner or a manager to share the reports."
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      {title}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.variantId}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />
        }
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <AppText variant="body" color={colors.meta}>
              In-stock variants with no order in the last {plural(days, 'day')}. Mark them down or
              retire them.
            </AppText>
            <Field
              label="Days without a sale"
              boxed
              value={daysText}
              onChangeText={(t) => setDaysText(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              maxLength={4}
              selectTextOnFocus
            />
            <FilterChips
              options={PRESETS}
              value={String(days)}
              onChange={(v) => setDaysText(v)}
            />
            {rows.length > 0 ? (
              <View style={styles.summary}>
                <AppText variant="meta" color={colors.meta} style={styles.flex}>
                  {plural(rows.length, 'variant')} · {plural(units, 'unit')} sitting
                  {rows.length >= DEAD_STOCK_LIMIT ? ` (top ${DEAD_STOCK_LIMIT})` : ''}
                  {q.data?.generatedAtIst ? ` · as of ${q.data.generatedAtIst}` : ''}
                </AppText>
                <ActivityIndicator
                  size="small"
                  color={colors.ink}
                  animating={q.isFetching}
                  hidesWhenStopped={false}
                  style={q.isFetching ? null : styles.hidden}
                />
              </View>
            ) : null}
            {q.isError && rows.length > 0 ? (
              <Banner
                tone="danger"
                title="Couldn't refresh the report"
                message={errorMessage(q.error)}
                actionLabel="Retry"
                onAction={() => q.refetch()}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          q.isPending ? (
            <ActivityIndicator color={colors.ink} style={styles.loader} />
          ) : q.isError ? (
            <Banner
              tone="danger"
              title="Couldn't load dead stock"
              message={errorMessage(q.error)}
              actionLabel="Retry"
              onAction={() => q.refetch()}
            />
          ) : (
            <EmptyState
              icon="checkmark-circle-outline"
              title="No dead stock"
              message={`Everything in stock sold within the last ${plural(days, 'day')}.`}
            />
          )
        }
        renderItem={({ item }) => (
          <DeadStockCard
            row={item}
            onPress={() => navigation.navigate('ProductDetail', { id: item.listingId })}
          />
        )}
      />
    </Screen>
  );
}

function DeadStockCard({ row, onPress }: { row: DeadStockRow; onPress: () => void }) {
  const detail = [row.label, row.sku].filter(Boolean).join(' · ');
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={styles.card}>
      <View style={styles.info}>
        <AppText variant="bodyMedium" color={colors.ink} numberOfLines={2}>
          {row.listingName}
        </AppText>
        {detail ? (
          <AppText variant="meta" color={colors.meta} numberOfLines={1}>
            {detail}
          </AppText>
        ) : null}
        <AppText variant="meta" color={row.lastSoldAt ? colors.meta : colors.danger}>
          {lastSoldLabel(row.lastSoldAt)}
        </AppText>
      </View>
      <View style={styles.units}>
        <AppText variant="cardTitle" color={colors.ink} style={styles.unitsValue}>
          {row.totalStock}
        </AppText>
        <AppText variant="meta" color={colors.meta}>
          {row.totalStock === 1 ? 'unit' : 'units'}
        </AppText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listContent: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  listHeader: { gap: spacing.sm + 4, marginBottom: spacing.xs },
  loader: { marginTop: spacing.xl },
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hidden: { opacity: 0 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  info: { flex: 1, gap: 2 },
  units: { alignItems: 'flex-end' },
  unitsValue: { fontSize: 24, lineHeight: 28 },
});
