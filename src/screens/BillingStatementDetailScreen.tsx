import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  Banner,
  DetailRow,
  Divider,
  EmptyState,
  Panel,
  PrimaryButton,
  Screen,
  ScreenHeader,
  useToast,
} from '../components';
import type { StatusTone } from '../components';
import { ScreenProps } from '../navigation/types';
import { useBillingStatement } from '../api/earningsHooks';
import { openBillingStatementPdf } from '../api/invoices';
import { errorMessage } from '../api/request';
import { billingStatusMeta, BillingStatementDetail } from '../types/earnings';
import { usePermissions } from '../utils/usePermission';
import { formatPaise } from '../utils/money';
import { formatDateTime, plural, shortRef } from '../utils/format';
import { colors, radii, spacing } from '../theme/theme';

const minus = (paise: number) => `− ${formatPaise(Math.abs(paise))}`;
const signed = (paise: number) => `${paise > 0 ? '+' : '−'} ${formatPaise(Math.abs(paise))}`;

/** One cycle's statement: gross to net, dispute outcomes, and the PDF. */
export function BillingStatementDetailScreen({
  navigation,
  route,
}: ScreenProps<'BillingStatementDetail'>) {
  const { id } = route.params;
  const toast = useToast();
  const { can } = usePermissions();
  const allowed = can('payouts.view');
  const q = useBillingStatement(allowed ? id : undefined);
  const s = q.data;
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await q.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const openPdf = async () => {
    if (opening) return;
    setOpening(true);
    try {
      await openBillingStatementPdf(id, s?.period);
    } catch (e) {
      toast.show(errorMessage(e, "Couldn't open the statement PDF"), 'error');
    } finally {
      setOpening(false);
    }
  };

  if (!allowed) {
    return (
      <Screen edges={['top']}>
        <ScreenHeader overline="Statement" title="Billing statement" onBack={() => navigation.goBack()} />
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />
        }
      >
        <ScreenHeader
          overline="Statement"
          title={s?.period || 'Billing statement'}
          onBack={() => navigation.goBack()}
        />

        {s ? (
          <>
            <Hero s={s} />
            <MoneyFlow s={s} />
            <DisputeOutcomes s={s} />
            <PrimaryButton
              label="Download statement PDF"
              tone="accent"
              loading={opening}
              onPress={openPdf}
            />
            <PrimaryButton
              label="View payout"
              tone="surface"
              onPress={() => navigation.navigate('PayoutDetail', { id })}
            />
          </>
        ) : q.isError ? (
          <Banner
            tone="danger"
            title="Couldn't load this statement"
            message={errorMessage(q.error)}
            actionLabel="Retry"
            onAction={() => q.refetch()}
          />
        ) : (
          <ActivityIndicator color={colors.ink} style={styles.loader} />
        )}
      </ScrollView>
    </Screen>
  );
}

/** Status dot on the black hero, where the light StatusChip tints don't read. */
const HERO_DOT: Record<StatusTone, string> = {
  success: colors.success,
  danger: colors.danger,
  warning: '#B8860B',
  pending: colors.accentInk,
  neutral: colors.accentSub,
};

function Hero({ s }: { s: BillingStatementDetail }) {
  const status = billingStatusMeta(s.status);
  return (
    <View style={styles.hero}>
      <View style={styles.heroPill}>
        <View style={[styles.heroDot, { backgroundColor: HERO_DOT[status.tone] }]} />
        <AppText variant="meta" color={colors.accentInk}>
          {status.label}
        </AppText>
      </View>
      <AppText variant="meta" color={colors.accentSub}>
        Net payout
      </AppText>
      <AppText variant="cardTitle" color={colors.accentInk} style={styles.heroAmt}>
        {formatPaise(s.netPaise)}
      </AppText>
      <AppText variant="meta" color={colors.accentSub}>
        {plural(s.ordersCount, 'order')}
        {s.generatedAt ? ` · generated ${formatDateTime(s.generatedAt)}` : ''}
      </AppText>
    </View>
  );
}

function MoneyFlow({ s }: { s: BillingStatementDetail }) {
  return (
    <Panel title="Money flow">
      <DetailRow label="Gross sales" value={formatPaise(s.grossPaise)} />
      <DetailRow label="Platform commission" value={minus(s.commissionPaise)} tone="negative" />
      <DetailRow
        label="Taxes on fees (GST / TCS)"
        value={minus(s.tcsPaise)}
        tone="negative"
      />
      <DetailRow label="Refunds deducted" value={minus(s.refundsPaise)} tone="negative" />
      {s.holdsPaise !== 0 ? (
        <DetailRow label="Held back" value={minus(s.holdsPaise)} tone="negative" />
      ) : null}
      {s.adjustmentsPaise !== 0 ? (
        <DetailRow
          label="Adjustments"
          value={signed(s.adjustmentsPaise)}
          tone={s.adjustmentsPaise > 0 ? 'positive' : 'negative'}
        />
      ) : null}
      <Divider />
      <DetailRow label="Net payout" value={formatPaise(s.netPaise)} strong />
    </Panel>
  );
}

function DisputeOutcomes({ s }: { s: BillingStatementDetail }) {
  const items = s.liabilityBookings;
  return (
    <Panel title="Dispute outcomes">
      {items.length === 0 ? (
        <AppText variant="meta" color={colors.meta}>
          No dispute decisions recorded this period.
        </AppText>
      ) : (
        items.map((b, i) => (
          <React.Fragment key={b.id || i}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.booking}>
              <View style={styles.bookingMain}>
                <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
                  Issue {shortRef(b.issueId)}
                </AppText>
                {b.description ? (
                  <AppText variant="meta" color={colors.meta}>
                    {b.description}
                  </AppText>
                ) : null}
              </View>
              <AppText variant="bodyMedium" color={colors.danger}>
                {minus(b.amountPaise)}
              </AppText>
            </View>
          </React.Fragment>
        ))
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, gap: spacing.md },
  loader: { marginTop: spacing.xl },
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
  booking: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  bookingMain: { flex: 1, gap: 2 },
});
