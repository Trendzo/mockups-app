import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  AppText,
  Banner,
  Divider,
  Field,
  Icon,
  KeyboardStickyView,
  Panel,
  PressableScale,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SectionHeader,
  StatusChip,
  toneForStatus,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import type { AppealMessage } from '../api/onboarding';
import { useRetailerMe } from '../api/onboardingHooks';
import { errorMessage } from '../api/request';
import { uploadToFolder } from '../api/storeSettings';
import {
  useAccountAppeal,
  usePostAppeal,
  useRequestClosure,
  useRequestReopen,
} from '../api/storeSettingsHooks';
import { useStoreGate } from '../navigation/useStoreGate';
import { ACCOUNT_DELETION_URL } from '../config/legal';
import { Store } from '../types/onboarding';
import { usePermissions } from '../utils/usePermission';
import { plural, timeAgo } from '../utils/format';
import { prepareUpload } from '../utils/image';
import { colors, radii, spacing, type as typeScale } from '../theme/theme';

const READ_ONLY_NOTE = 'Only the owner or a manager can do this.';
const MAX_REASON = 500;
const MIN_MESSAGE = 3;

function statusSummary(account: string, store: Store | null): string {
  if (account === 'closed') {
    return 'Your account is closed and your store is suspended. Your records are kept.';
  }
  if (account === 'terminated') return 'This account has been terminated by Trendzo.';
  if (account === 'pending_approval') {
    return "Your account is being set up. You'll get full access once it's active.";
  }
  if (!store) return "Your store isn't set up yet.";
  if (store.status === 'terminated') return 'Your store has been terminated by Trendzo.';
  if (store.status === 'suspended') return 'Your store has been suspended by Trendzo.';
  if (store.status === 'paused') {
    return "Your storefront is paused — customers can't place orders until you resume.";
  }
  if (store.status === 'onboarding') return 'Your store is set up — add products and go live.';
  return 'Your account and store are in good standing.';
}

/**
 * Account status: account + store standing, the suspension/termination appeal
 * thread with the Trendzo team, and the closure / reopen requests (both are
 * reviewed by Trendzo before anything changes).
 */
export function AccountStatusScreen({ navigation }: ScreenProps<'AccountStatus'>) {
  const toast = useToast();
  const me = useRetailerMe();
  const gate = useStoreGate();
  const { can, subRole } = usePermissions();
  // Closure / reopen requests: the server wants change_requests.submit AND owner/manager
  // (a missing sub-role is the primary account).
  const canManage =
    can('change_requests.submit') && (!subRole || subRole === 'owner' || subRole === 'manager');
  const retailer = me.data?.retailer;
  const store = me.data?.store ?? null;
  const accountStatus = retailer?.status;
  const closurePending = me.data?.pendingAccountRequest === 'account_deletion';
  const reopenPending = me.data?.pendingAccountRequest === 'account_reopen';

  // Suspension / termination is a decision the retailer can contest. The owner's
  // own approved closure suspends the store too, but there's nothing to appeal
  // (the gate already sorts closed accounts out of `abilities.appeal`).
  const actioned =
    store?.status === 'suspended' ||
    store?.status === 'terminated' ||
    accountStatus === 'terminated';
  const appealMode = gate.abilities.appeal;

  const appealQ = useAccountAppeal(!!me.data);
  const messages = appealQ.data?.messages ?? [];
  const showThread = actioned || messages.length > 0;
  const showComposer = showThread && !!appealQ.data?.canAppeal;

  const postAppeal = usePostAppeal();
  const requestClosure = useRequestClosure();
  const requestReopen = useRequestReopen();

  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [reason, setReason] = useState('');
  // Own flag rather than isFetching, so the background polls never spin it.
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // The closure reason sits at the end of the page. With the message composer
  // pinned (and lifted by the keyboard) nothing else scrolls it into view, so
  // bring it up once the keyboard has opened.
  const revealReason = () => {
    if (Keyboard.isVisible()) {
      scrollRef.current?.scrollToEnd({ animated: true });
      return;
    }
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      sub.remove();
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    setTimeout(() => sub.remove(), 1500);
  };

  // A terminated ACCOUNT is read-only server-side: only POST /account/appeal is let
  // through, so the photo upload (POST /uploads) would 403. Text-only appeal there.
  const canAttach = gate.state !== 'account_terminated';

  const trimmed = text.trim();
  const canSend = trimmed.length >= MIN_MESSAGE && !attaching && !postAppeal.isPending;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([me.refetch(), me.data ? appealQ.refetch() : null]);
    } finally {
      setRefreshing(false);
    }
  };

  const attach = async () => {
    if (attaching) return;
    const res = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.9,
      maxWidth: 2400,
      maxHeight: 2400,
    });
    if (res.errorCode) {
      toast.show(res.errorMessage || "Couldn't open your photos", 'error');
      return;
    }
    const uri = res.assets?.[0]?.uri;
    if (!uri) return;
    setAttaching(true);
    try {
      // Same folder the pending-approval appeal composer uploads to.
      const url = await uploadToFolder(await prepareUpload(uri), 'onboarding');
      setAttachments((list) => [...list, url]);
    } catch (e) {
      toast.show(errorMessage(e, 'Upload failed'), 'error');
    } finally {
      setAttaching(false);
    }
  };

  const send = () => {
    if (!canSend) return;
    postAppeal.mutate(
      { body: trimmed, attachmentUrls: attachments },
      {
        onSuccess: () => {
          setText('');
          setAttachments([]);
          toast.show(appealMode ? 'Appeal sent to Trendzo' : 'Message sent', 'success');
        },
        onError: (e) => toast.show(errorMessage(e, "Couldn't send your message"), 'error'),
      },
    );
  };

  const confirmClosure = () => {
    if (closurePending || requestClosure.isPending) return;
    Alert.alert(
      'Request account closure?',
      "Trendzo reviews every closure request. Your store keeps running until it's approved.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request closure',
          style: 'destructive',
          onPress: () =>
            requestClosure.mutate(reason.trim() || undefined, {
              onSuccess: () => {
                setReason('');
                toast.show('Closure requested - pending admin review', 'info');
              },
              onError: (e) =>
                toast.show(errorMessage(e, "Couldn't submit the closure request"), 'error'),
            }),
        },
      ],
    );
  };

  const onReopen = () => {
    if (reopenPending || requestReopen.isPending) return;
    requestReopen.mutate(undefined, {
      onSuccess: () => toast.show('Reopen requested - pending admin review', 'info'),
      onError: (e) => toast.show(errorMessage(e, "Couldn't submit the reopen request"), 'error'),
    });
  };

  const openClosureDetails = () =>
    Linking.openURL(ACCOUNT_DELETION_URL).catch(() =>
      toast.show("Couldn't open the page", 'error'),
    );

  return (
    // The pinned composer owns the bottom inset (KeyboardStickyView), so only the
    // top edge is applied here.
    <Screen edges={['top']}>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[styles.content, showComposer ? styles.contentAboveComposer : null]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // The pinned composer only follows the keyboard on show/hide events, so
        // an interactive drag-dismiss would leave it floating mid-screen.
        keyboardDismissMode={showComposer ? 'on-drag' : 'interactive'}
        // With the composer pinned it already rises above the keyboard; insetting
        // the scroll view as well would leave a double gap.
        automaticallyAdjustKeyboardInsets={!showComposer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />
        }
      >
        <ScreenHeader overline="Account" title="Account status" onBack={() => navigation.goBack()} />

        {me.isLoading ? (
          <ActivityIndicator color={colors.ink} style={styles.loader} />
        ) : !retailer ? (
          <Banner
            tone="danger"
            title="Couldn't load your account"
            message={errorMessage(me.error, 'Check your connection and try again.')}
            actionLabel="Retry"
            onAction={() => me.refetch()}
          />
        ) : (
          <>
            <Panel>
              <FactRow label="Account">
                <StatusChip
                  label={retailer.status.replace(/_/g, ' ')}
                  tone={toneForStatus(retailer.status)}
                />
              </FactRow>
              <Divider />
              <FactRow label="Store">
                {store ? (
                  <StatusChip
                    label={store.status.replace(/_/g, ' ')}
                    tone={toneForStatus(store.status)}
                  />
                ) : (
                  <AppText variant="body" color={colors.meta}>
                    Not set up yet
                  </AppText>
                )}
              </FactRow>
              <AppText variant="meta" color={colors.meta}>
                {statusSummary(retailer.status, store)}
              </AppText>
              {closurePending ? (
                <Banner
                  tone="warning"
                  title="Closure request pending"
                  message="Trendzo is reviewing your request to close this account. Nothing changes until it's approved."
                />
              ) : null}
              {reopenPending ? (
                <Banner
                  tone="warning"
                  title="Reopen request pending"
                  message="Your reopen request is with the Trendzo team. You'll regain full access once it's approved."
                />
              ) : null}
              {gate.state === 'store_paused' ? (
                <PrimaryButton
                  label={gate.abilities.resume.allowed ? 'Resume storefront' : 'Storefront status'}
                  tone="accent"
                  onPress={() => navigation.navigate('StoreStatus')}
                />
              ) : null}
            </Panel>

            {gate.abilities.reopen ? (
              <Panel title="Reopen account">
                <AppText variant="body" color={colors.ink}>
                  Your data is safe. Request to reopen whenever you're ready — Trendzo restores your
                  access once it's approved.
                </AppText>
                {canManage ? (
                  <PrimaryButton
                    label={reopenPending ? 'Reopen request pending' : 'Request to reopen'}
                    tone="accent"
                    disabled={reopenPending}
                    loading={requestReopen.isPending}
                    onPress={onReopen}
                  />
                ) : (
                  <ReadOnlyNote />
                )}
              </Panel>
            ) : null}

            {showThread ? (
              <View style={styles.thread}>
                <SectionHeader label={appealMode ? 'Appeal this decision' : 'Messages'} />
                {appealMode ? (
                  <AppText variant="meta" color={colors.meta}>
                    {showComposer
                      ? 'Tell the Trendzo team why your store should be restored. Attach anything that supports your case.'
                      : 'Replies from the Trendzo team show up here.'}
                  </AppText>
                ) : null}
                {appealQ.isLoading ? (
                  <ActivityIndicator color={colors.ink} />
                ) : appealQ.isError && !appealQ.data ? (
                  <Banner
                    tone="danger"
                    title="Couldn't load messages"
                    message={errorMessage(appealQ.error, 'Check your connection and try again.')}
                    actionLabel="Retry"
                    onAction={() => appealQ.refetch()}
                  />
                ) : messages.length ? (
                  messages.map((m) => <Bubble key={m.id} message={m} />)
                ) : (
                  <AppText variant="meta" color={colors.meta}>
                    No messages
                  </AppText>
                )}
              </View>
            ) : null}

            {accountStatus === 'active' ? (
              <Panel title="Danger zone">
                <AppText variant="bodyMedium" color={colors.danger}>
                  Close this account
                </AppText>
                <AppText variant="meta" color={colors.meta}>
                  This sends a closure request to the Trendzo team for review. Nothing changes until
                  an admin approves it. Once approved, your store is suspended and your account is
                  closed — but your records are kept, and you can request to reopen the account
                  anytime.
                </AppText>
                <PressableScale onPress={openClosureDetails} haptic={false} style={styles.linkRow}>
                  <AppText variant="bodyMedium" color={colors.ink} style={styles.link}>
                    Read account closure details
                  </AppText>
                  <Icon name="open-outline" size={16} color={colors.ink} />
                </PressableScale>
                {closurePending || !canManage ? null : (
                  <View style={styles.fieldWrap}>
                    <Field
                      label="Reason (optional)"
                      boxed
                      multiline
                      value={reason}
                      onChangeText={setReason}
                      maxLength={MAX_REASON}
                      placeholder="Tell us why you're leaving"
                      style={styles.reasonInput}
                      onFocus={revealReason}
                    />
                    <AppText variant="meta" color={colors.meta} style={styles.counter}>
                      {reason.length}/{MAX_REASON}
                    </AppText>
                  </View>
                )}
                {canManage ? (
                  <PrimaryButton
                    label={closurePending ? 'Closure request pending' : 'Request account closure'}
                    tone="danger"
                    disabled={closurePending}
                    loading={requestClosure.isPending}
                    onPress={confirmClosure}
                  />
                ) : (
                  <ReadOnlyNote />
                )}
              </Panel>
            ) : null}
          </>
        )}
      </ScrollView>

      {showComposer ? (
        <KeyboardStickyView style={styles.composer} minBottom={spacing.sm}>
          {attachments.length ? (
            <View style={styles.attachNote}>
              <Icon name="attach" size={14} color={colors.meta} />
              <AppText variant="meta" color={colors.meta} style={styles.flex}>
                {plural(attachments.length, 'attachment')} ready
              </AppText>
              <PressableScale onPress={() => setAttachments([])} haptic={false}>
                <AppText variant="meta" color={colors.ink}>
                  Remove
                </AppText>
              </PressableScale>
            </View>
          ) : null}
          {trimmed.length > 0 && trimmed.length < MIN_MESSAGE ? (
            <AppText variant="meta" color={colors.meta} style={styles.composerHint}>
              Write at least {MIN_MESSAGE} characters.
            </AppText>
          ) : null}
          <View style={styles.composerRow}>
            {canAttach ? (
              <PressableScale
                onPress={attach}
                disabled={postAppeal.isPending}
                toScale={0.9}
                accessibilityLabel="Attach a photo"
                style={styles.attachBtn}
              >
                {attaching ? (
                  <ActivityIndicator color={colors.ink} />
                ) : (
                  <Icon name="attach" size={22} color={colors.ink} />
                )}
              </PressableScale>
            ) : null}
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={appealMode ? 'Write your appeal…' : 'Write a message…'}
              placeholderTextColor={colors.inkMuted}
              multiline
              maxLength={2000}
              style={styles.input}
            />
            <PressableScale
              onPress={send}
              disabled={!canSend}
              toScale={0.9}
              accessibilityLabel="Send"
              style={styles.sendBtn}
            >
              {postAppeal.isPending ? (
                <ActivityIndicator color={colors.accentInk} />
              ) : (
                <Icon name="arrow-up" size={20} color={colors.accentInk} />
              )}
            </PressableScale>
          </View>
        </KeyboardStickyView>
      ) : null}
    </Screen>
  );
}

/** Same bubbles as the pending-approval appeal thread. */
function Bubble({ message }: { message: AppealMessage }) {
  const mine = message.authorKind !== 'admin' && message.authorKind !== 'system';
  const author =
    message.authorKind === 'admin'
      ? 'Trendzo team'
      : message.authorKind === 'system'
        ? 'System'
        : 'You';
  const muted = mine ? colors.onDarkMuted : colors.meta;
  return (
    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleThem]}>
      <AppText variant="meta" color={muted}>
        {message.createdAt ? `${author} · ${timeAgo(message.createdAt)}` : author}
      </AppText>
      <AppText variant="body" color={mine ? colors.accentInk : colors.ink}>
        {message.body}
      </AppText>
      {message.attachments?.map((url, i) => (
        <PressableScale
          key={`${url}-${i}`}
          onPress={() => Linking.openURL(url).catch(() => {})}
          haptic={false}
          style={styles.attRow}
        >
          <Icon name="attach" size={14} color={mine ? colors.onDarkMuted : colors.ink} />
          <AppText
            variant="meta"
            color={mine ? colors.onDarkMuted : colors.ink}
            style={styles.link}
          >
            Attachment {i + 1}
          </AppText>
        </PressableScale>
      ))}
    </View>
  );
}

/** DetailRow's layout with a chip on the right instead of plain text. */
function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.factRow}>
      <AppText variant="body" color={colors.meta}>
        {label}
      </AppText>
      <View style={styles.factValue}>{children}</View>
    </View>
  );
}

function ReadOnlyNote() {
  return (
    <View style={styles.readOnly}>
      <Icon name="lock-closed-outline" size={14} color={colors.meta} style={styles.readOnlyIcon} />
      <AppText variant="meta" color={colors.meta} style={styles.flex}>
        {READ_ONLY_NOTE}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: spacing.xxl, gap: spacing.md },
  contentAboveComposer: { paddingBottom: spacing.lg },
  loader: { marginTop: spacing.xl },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  factValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  readOnly: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  readOnlyIcon: { marginTop: 1 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' },
  link: { textDecorationLine: 'underline' },
  fieldWrap: { gap: spacing.xs },
  reasonInput: { minHeight: 88, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end' },
  // Thread + composer: mirrors PendingApprovalScreen's appeal chat.
  thread: { gap: spacing.sm },
  bubble: { maxWidth: '85%', borderRadius: radii.card, padding: spacing.md, gap: 2 },
  bubbleMine: { backgroundColor: colors.ink, alignSelf: 'flex-end' },
  bubbleThem: { backgroundColor: colors.surface, alignSelf: 'flex-start' },
  attRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  composer: { borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: spacing.sm },
  attachNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  composerHint: { marginBottom: spacing.xs },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    // Same height as the 40pt attach / send buttons beside it.
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.ink,
    fontFamily: typeScale.body.fontFamily,
    fontSize: typeScale.body.fontSize,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
