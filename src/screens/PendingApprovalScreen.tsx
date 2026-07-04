import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  Banner,
  Icon,
  PrimaryButton,
  Screen,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useRetailerMe } from '../api/onboardingHooks';
import { useAuth } from '../store/auth';
import { colors, spacing } from '../theme/theme';

/**
 * Post-login gate for retailers whose account/store isn't ready yet
 * (status !== active, or store paused/suspended/terminated).
 */
export function PendingApprovalScreen({ navigation }: ScreenProps<'PendingApproval'>) {
  const me = useRetailerMe();
  const logout = useAuth((s) => s.logout);

  const status = me.data?.retailer.status;
  const store = me.data?.store;

  const banner = (() => {
    if (status === 'terminated') {
      return {
        tone: 'danger' as const,
        title: 'Account terminated',
        message: 'This retailer account has been terminated. Contact support.',
      };
    }
    if (store && store.status === 'suspended') {
      return {
        tone: 'danger' as const,
        title: 'Store suspended',
        message: 'Your store is suspended. Contact support to restore access.',
      };
    }
    if (store && store.status === 'paused') {
      return {
        tone: 'warning' as const,
        title: 'Store paused',
        message: 'Your store is paused. Publishing is disabled until it resumes.',
      };
    }
    return {
      tone: 'pending' as const,
      title: 'Approval pending',
      message:
        "Your application is approved and your account is being set up. You'll get full access once it's active.",
    };
  })();

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={me.isFetching} onRefresh={() => me.refetch()} />
        }
      >
        <View style={styles.badge}>
          <Icon name="time-outline" size={30} color={colors.ink} />
        </View>
        <AppText variant="sectionLabel" color={colors.meta}>
          Trenzo Studio
        </AppText>
        <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
          Almost there
        </AppText>

        <Banner tone={banner.tone} title={banner.title} message={banner.message} />

        {me.data ? (
          <View style={styles.card}>
            <Row label="Account" value={me.data.retailer.legalName} />
            <Row label="Status" value={status ?? '—'} />
            <Row label="Store" value={store ? store.status : 'not created yet'} />
          </View>
        ) : null}

        <AppText variant="meta" color={colors.meta} style={styles.hint}>
          Pull to refresh, or check back later.
        </AppText>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label="Refresh"
          tone="accent"
          loading={me.isFetching}
          onPress={() => me.refetch()}
        />
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
    borderRadius: 18,
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowValue: { flexShrink: 1, textAlign: 'right', textTransform: 'capitalize' },
  hint: { textAlign: 'center' },
  footer: { gap: spacing.sm, paddingVertical: spacing.md },
});
