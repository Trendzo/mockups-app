import React, { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import {
  AppText,
  Banner,
  EmptyState,
  ListRow,
  PressableScale,
  Screen,
  ScreenHeader,
  StatusChip,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useBillingStatements } from '../api/earningsHooks';
import { errorMessage } from '../api/request';
import { BillingStatement, billingStatusMeta } from '../types/earnings';
import { usePermissions } from '../utils/usePermission';
import { formatPaise } from '../utils/money';
import { plural } from '../utils/format';
import { colors, radii, spacing } from '../theme/theme';

const minus = (paise: number) => `−${formatPaise(Math.abs(paise))}`;

/** One statement per settlement cycle: what was sold, what was taken off, what was paid. */
export function BillingStatementsScreen({ navigation }: ScreenProps<'BillingStatements'>) {
  const { can } = usePermissions();
  const allowed = can('payouts.view');
  const q = useBillingStatements(allowed);
  const [refreshing, setRefreshing] = useState(false);
  const rows = q.data ?? [];

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await q.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  if (!allowed) {
    return (
      <Screen edges={['top']}>
        <ScreenHeader overline="Payments" title="Billing statements" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="lock-closed-outline"
          title="Not available for your role"
          message="Ask the store owner or a manager to share the billing statements with you."
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <ScreenHeader overline="Payments" title="Billing statements" onBack={() => navigation.goBack()} />
      <FlatList
        data={rows}
        keyExtractor={(s) => s.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />
        }
        ListHeaderComponent={
          can('invoicing.view') ? (
            <ListRow
              icon="receipt-outline"
              label="Invoices"
              hint="Customer tax invoices and Trendzo commission invoices"
              onPress={() => navigation.navigate('Invoices')}
            />
          ) : null
        }
        ListEmptyComponent={
          q.isLoading ? (
            <ActivityIndicator color={colors.ink} style={styles.loader} />
          ) : q.isError ? (
            <Banner
              tone="danger"
              title="Couldn't load statements"
              message={errorMessage(q.error)}
              actionLabel="Retry"
              onAction={() => q.refetch()}
            />
          ) : (
            <EmptyState
              icon="document-text-outline"
              title="No statements yet"
              message="A statement appears here for each settlement cycle."
            />
          )
        }
        renderItem={({ item }) => (
          <StatementCard
            s={item}
            onPress={() => navigation.navigate('BillingStatementDetail', { id: item.id })}
          />
        )}
      />
    </Screen>
  );
}

function StatementCard({ s, onPress }: { s: BillingStatement; onPress: () => void }) {
  const status = billingStatusMeta(s.status);
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitle}>
          <AppText variant="bodyMedium" color={colors.ink} numberOfLines={2}>
            {s.period || 'Statement'}
          </AppText>
          <StatusChip label={status.label} tone={status.tone} />
        </View>
        <View style={styles.net}>
          <AppText variant="meta" color={colors.meta}>
            Net payout
          </AppText>
          <AppText variant="bodyMedium" color={colors.ink}>
            {formatPaise(s.netPaise)}
          </AppText>
        </View>
      </View>
      <AppText variant="meta" color={colors.meta}>
        {plural(s.ordersCount, 'order')} · Gross {formatPaise(s.grossPaise)}
      </AppText>
      <AppText variant="meta" color={colors.meta}>
        Fee {minus(s.commissionPaise)} · Taxes {minus(s.tcsPaise)} · Refunds {minus(s.refundsPaise)}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  loader: { marginTop: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.xs },
  cardTitle: { flex: 1, gap: 6 },
  net: { alignItems: 'flex-end' },
});
