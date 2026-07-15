import React, { useState } from 'react';
import { ActivityIndicator, Linking, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useQuery } from '@tanstack/react-query';
import {
  AppText,
  Banner,
  Icon,
  KeyboardStickyView,
  PressableScale,
  PrimaryButton,
  Screen,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useRetailerMe } from '../api/onboardingHooks';
import { getAccountAppeal, postAccountAppeal, requestAccountReopen, uploadDocument, type AppealMessage } from '../api/onboarding';
import { useAuth } from '../store/auth';
import { inferMimeType } from '../utils/image';
import { colors, radii, spacing, type as typeScale } from '../theme/theme';

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
  const [attachments, setAttachments] = useState<string[]>([]);
  const [appealing, setAppealing] = useState(false);

  const attachToAppeal = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.9, maxWidth: 2400, maxHeight: 2400 });
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    try {
      const up = await uploadDocument({ uri: asset.uri, name: asset.fileName ?? `att_${Date.now()}.jpg`, type: asset.type ?? inferMimeType(asset.uri) });
      setAttachments((p) => [...p, up.url]);
    } catch (e: any) {
      toast.show(e?.message ?? 'Upload failed', 'error');
    }
  };

  const sendAppeal = async () => {
    if ((!appealText.trim() && attachments.length === 0) || appealing) return;
    setAppealing(true);
    try {
      await postAccountAppeal({
        body: appealText.trim() || '(see attachment)',
        attachmentUrls: attachments,
      });
      setAppealText('');
      setAttachments([]);
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

  // Suspended / terminated / closed → the same status-and-messages layout as
  // the post-onboarding ApplicationStatusScreen, with the appeal thread as the
  // conversation. Fully replaces the old pending-gate look for these states.
  if (showAppeal) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScrollView
          style={styles.flex}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={styles.statusContent}
          refreshControl={
            <RefreshControl refreshing={me.isFetching} onRefresh={() => me.refetch()} />
          }
        >
          <View style={styles.header}>
            <AppText variant="sectionLabel" color={colors.meta}>
              {me.data?.retailer.legalName ?? 'Trendzo Studio'}
            </AppText>
            <AppText variant="cardTitle" color={colors.ink} style={styles.statusH1}>
              Account status
            </AppText>
          </View>

          <Banner tone={banner.tone} title={banner.title} message={banner.message} />

          <View style={styles.thread}>
            <AppText variant="sectionLabel" color={colors.meta}>Messages</AppText>
            {(appealQ.data?.messages ?? []).length > 0 ? (
              (appealQ.data?.messages ?? []).map((m: AppealMessage) => {
                const mine = m.authorKind !== 'admin' && m.authorKind !== 'system';
                return (
                  <View key={m.id} style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleThem]}>
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
              })
            ) : (
              <AppText variant="meta" color={colors.meta}>No messages yet.</AppText>
            )}
          </View>
        </ScrollView>

        <KeyboardStickyView style={styles.composer} minBottom={spacing.sm}>
          {attachments.length > 0 ? (
            <AppText variant="meta" color={colors.meta} style={styles.attachNote}>
              {attachments.length} attachment{attachments.length > 1 ? 's' : ''} ready
            </AppText>
          ) : null}
          <View style={styles.composerRow}>
            <PressableScale onPress={attachToAppeal} style={styles.attachBtn} toScale={0.9}>
              <Icon name="attach" size={22} color={colors.ink} />
            </PressableScale>
            <TextInput
              value={appealText}
              onChangeText={setAppealText}
              placeholder="Write your appeal…"
              placeholderTextColor={colors.inkMuted}
              multiline
              style={styles.input}
            />
            <PressableScale onPress={sendAppeal} disabled={appealing} style={styles.sendBtn} toScale={0.9}>
              {appealing ? <ActivityIndicator color={colors.accentInk} /> : <Icon name="arrow-up" size={20} color={colors.accentInk} />}
            </PressableScale>
          </View>
        </KeyboardStickyView>

        <View style={styles.footer}>
          {isClosed && canManageAccount ? (
            <PrimaryButton
              label={reopenPending ? 'Reopen requested — pending review' : 'Request to reopen'}
              tone="accent"
              loading={reopening}
              disabled={reopenPending || reopening}
              onPress={onReopen}
            />
          ) : null}
          <PrimaryButton label="Log out" tone="ghost" onPress={logout} />
        </View>
      </Screen>
    );
  }

  // Pending approval / store paused — the original waiting gate.
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
  flex: { flex: 1 },
  content: { paddingTop: spacing.xl, paddingBottom: spacing.xl, gap: spacing.md },
  // Status-and-messages layout (suspended/terminated/closed).
  statusContent: { paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  header: { gap: spacing.xs },
  statusH1: { fontSize: 24, lineHeight: 28 },
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
  // Appeal thread + composer — mirrors ApplicationStatusScreen's chat styles.
  thread: { gap: spacing.sm },
  bubble: { maxWidth: '85%', borderRadius: radii.card, padding: spacing.md, gap: 2 },
  bubbleMine: { backgroundColor: colors.ink, alignSelf: 'flex-end' },
  bubbleThem: { backgroundColor: colors.surface, alignSelf: 'flex-start' },
  composer: { borderTopWidth: 1, borderTopColor: colors.hairline, paddingVertical: spacing.sm },
  attachNote: { marginBottom: spacing.xs },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  attachBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.ink,
    fontFamily: typeScale.body.fontFamily,
    fontSize: typeScale.body.fontSize,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  attLink: { textDecorationLine: 'underline' },
});
