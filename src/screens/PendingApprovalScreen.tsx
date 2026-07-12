import React, { useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  AppText,
  Banner,
  Icon,
  PressableScale,
  PrimaryButton,
  Screen,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useRetailerMe } from '../api/onboardingHooks';
import { getAccountAppeal, postAccountAppeal, requestAccountReopen, type AppealMessage } from '../api/onboarding';
import { useAuth } from '../store/auth';
import { colors, radii, spacing } from '../theme/theme';

/**
 * Post-login gate for retailers whose account/store isn't ready yet
 * (status !== active, or store paused/suspended/terminated), and the landing
 * screen for a `closed` account — where the owner/manager can request a reopen.
 */
export function PendingApprovalScreen({ navigation }: ScreenProps<'PendingApproval'>) {
  const me = useRetailerMe();
  const logout = useAuth((s) => s.logout);
  const toast = useToast();
  const [reopening, setReopening] = useState(false);

  const status = me.data?.retailer.status;
  const store = me.data?.store;
  const subRole = me.data?.retailer.subRole;
  const isClosed = status === 'closed';
  const reopenPending = me.data?.pendingAccountRequest === 'account_reopen';
  const canManageAccount = subRole === 'owner' || subRole === 'manager';

  // Suspend/terminate appeal: the in-band channel to contest the action.
  const showAppeal = store?.status === 'suspended' || status === 'terminated';
  const appealQ = useQuery({
    queryKey: ['account-appeal'],
    queryFn: getAccountAppeal,
    enabled: !!me.data && showAppeal,
    retry: 0,
    refetchInterval: showAppeal ? 25_000 : false,
  });
  const [appealText, setAppealText] = useState('');
  const [appealing, setAppealing] = useState(false);
  const sendAppeal = async () => {
    if (!appealText.trim() || appealing) return;
    setAppealing(true);
    try {
      await postAccountAppeal({ body: appealText.trim() });
      setAppealText('');
      await appealQ.refetch();
      toast.show('Appeal sent to ClosetX', 'info');
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not send appeal', 'error');
    } finally {
      setAppealing(false);
    }
  };

  const onReopen = async () => {
    setReopening(true);
    try {
      await requestAccountReopen();
      await me.refetch();
      toast.show('Reopen requested — pending admin review', 'info');
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not submit reopen request', 'error');
    } finally {
      setReopening(false);
    }
  };

  const banner = (() => {
    // Closed is checked BEFORE the store-suspended branch: a closed account's store
    // is suspended, but we want the reversible closed/reopen framing, not "contact support".
    if (isClosed) {
      return {
        tone: 'warning' as const,
        title: reopenPending ? 'Reopen request pending' : 'Account closed',
        message: reopenPending
          ? "Your reopen request is with the ClosetX team for review. You'll regain full access once it's approved."
          : "Your account is closed and your store is suspended. Your data is safe — request to reopen whenever you're ready.",
      };
    }
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
          Trendzo Studio
        </AppText>
        <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
          {isClosed ? 'Account closed' : 'Almost there'}
        </AppText>

        <Banner tone={banner.tone} title={banner.title} message={banner.message} />

        {me.data ? (
          <View style={styles.card}>
            <Row label="Account" value={me.data.retailer.legalName} />
            <Row label="Status" value={status ?? '—'} />
            <Row label="Store" value={store ? store.status : 'not created yet'} />
          </View>
        ) : null}

        {showAppeal ? (
          <View style={styles.appealCard}>
            <AppText variant="sectionLabel" color={colors.meta}>Appeal this decision</AppText>
            <AppText variant="meta" color={colors.meta}>
              Message the ClosetX team to contest the {status === 'terminated' ? 'termination' : 'suspension'}. They'll reply here.
            </AppText>
            {(appealQ.data?.messages ?? []).map((m: AppealMessage) => {
              const mine = m.authorKind !== 'admin' && m.authorKind !== 'system';
              return (
                <View key={m.id} style={[styles.appealBubble, mine ? styles.bubbleMine : styles.bubbleThem]}>
                  <AppText variant="meta" color={mine ? colors.onDarkMuted : colors.meta}>
                    {m.authorKind === 'admin' ? 'ClosetX admin' : m.authorKind === 'system' ? 'System' : 'You'}
                  </AppText>
                  <AppText variant="body" color={mine ? colors.accentInk : colors.ink}>{m.body}</AppText>
                  {m.attachments?.map((url, i) => (
                    <PressableScale key={url} onPress={() => Linking.openURL(url).catch(() => {})}>
                      <AppText variant="meta" color={mine ? colors.onDarkMuted : colors.ink} style={styles.attLink}>📎 Attachment {i + 1}</AppText>
                    </PressableScale>
                  ))}
                </View>
              );
            })}
            <View style={styles.appealRow}>
              <TextInput
                value={appealText}
                onChangeText={setAppealText}
                placeholder="Write your appeal…"
                placeholderTextColor={colors.inkMuted}
                multiline
                style={styles.appealInput}
              />
              <PrimaryButton label={appealing ? '…' : 'Send'} tone="accent" disabled={appealing || !appealText.trim()} onPress={sendAppeal} />
            </View>
          </View>
        ) : null}

        <AppText variant="meta" color={colors.meta} style={styles.hint}>
          {isClosed && !reopenPending
            ? canManageAccount
              ? 'Ready to come back? Request to reopen below.'
              : 'Ask the account owner to reopen this account.'
            : 'Pull to refresh, or check back later.'}
        </AppText>
      </ScrollView>

      <View style={styles.footer}>
        {isClosed && canManageAccount ? (
          <PrimaryButton
            label={reopenPending ? 'Reopen requested — pending review' : 'Request to reopen'}
            tone="accent"
            loading={reopening}
            disabled={reopenPending || reopening}
            onPress={onReopen}
          />
        ) : (
          <PrimaryButton
            label="Refresh"
            tone="accent"
            loading={me.isFetching}
            onPress={() => me.refetch()}
          />
        )}
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
  appealCard: { backgroundColor: colors.surface, borderRadius: 18, padding: spacing.lg, gap: spacing.sm },
  appealBubble: { borderRadius: radii.card, padding: spacing.sm, gap: 2, maxWidth: '90%' },
  bubbleMine: { backgroundColor: colors.ink, alignSelf: 'flex-end' },
  bubbleThem: { backgroundColor: colors.canvas, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.hairline },
  appealRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginTop: spacing.xs },
  appealInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.canvas,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.ink,
  },
  attLink: { textDecorationLine: 'underline' },
});
