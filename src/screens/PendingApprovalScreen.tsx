import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  Banner,
  Icon,
  PrimaryButton,
  Screen,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { gateState } from '../navigation/storeGate';
import { useKyc, useRetailerMe } from '../api/onboardingHooks';
import { useAuth } from '../store/auth';
import { colors, radii, spacing } from '../theme/theme';

/**
 * Post-login waiting room for a retailer that is genuinely not live yet: the account is
 * still pending approval, or approved but the store is not provisioned. Every other
 * lockout (store paused / suspended / terminated, account closed / terminated) now stays
 * inside the main app behind a banner - see navigation/storeGate - where Resume, the
 * appeal thread and Reopen live on StoreStatus / AccountStatus.
 */
export function PendingApprovalScreen({ navigation }: ScreenProps<'PendingApproval'>) {
  const me = useRetailerMe();
  const kyc = useKyc(!!me.data);
  const logout = useAuth((s) => s.logout);
  // Manual pull-to-refresh only: binding the spinner to me.isFetching makes the
  // page "reload" every 20s background poll.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await me.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const status = me.data?.retailer.status;
  const store = me.data?.store;
  const settingUp = gateState(me.data) === 'no_store';

  const kycStatus = kyc.data?.status;
  const kycNeedsAction =
    kycStatus === 'pending' || kycStatus === 'overdue' || kycStatus === 'rejected';

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.badge}>
          <Icon name="time-outline" size={30} color={colors.ink} />
        </View>
        <AppText variant="sectionLabel" color={colors.meta}>
          Trendzo Retailer
        </AppText>
        <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
          Almost there
        </AppText>

        <Banner
          tone="pending"
          title={settingUp ? 'Setting up your store' : 'Approval pending'}
          message={
            settingUp
              ? "Your account is approved and your store is being set up. You'll get full access once it's ready."
              : "Your application is approved and your account is being set up. You'll get full access once it's active."
          }
        />

        {me.data ? (
          <View style={styles.card}>
            <Row label="Account" value={me.data.retailer.legalName} />
            <Row label="Status" value={status ?? '-'} />
            <Row label="Store" value={store ? store.status : 'not created yet'} />
          </View>
        ) : null}

        <AppText variant="meta" color={colors.meta} style={styles.hint}>
          Pull to refresh, or check back later.
        </AppText>
      </ScrollView>

      <View style={styles.footer}>
        {kycNeedsAction ? (
          <PrimaryButton
            label="Verification (KYC)"
            tone="surface"
            onPress={() => navigation.navigate('Kyc')}
          />
        ) : null}
        <PrimaryButton label="Refresh" tone="accent" loading={refreshing} onPress={onRefresh} />
        <PrimaryButton label="Log out" tone="ghost" onPress={logout} />
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="meta" color={colors.meta}>
        {label}
      </AppText>
      <AppText variant="bodyMedium" color={colors.ink} style={styles.rowValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xl, paddingBottom: spacing.xl, gap: spacing.md },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  h1: { fontSize: 26, lineHeight: 30, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowValue: { flexShrink: 1, textAlign: 'right', textTransform: 'capitalize' },
  hint: { textAlign: 'center' },
  footer: { gap: spacing.sm, paddingVertical: spacing.md },
});
