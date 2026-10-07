import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  AppText,
  Banner,
  DetailRow,
  Divider,
  Icon,
  KeyboardStickyView,
  ListRow,
  Panel,
  PressableScale,
  PrimaryButton,
  Screen,
  ScreenHeader,
  StatusChip,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useHandBackIssue, useIssue, usePostIssueMessage } from '../api/issuesHooks';
import { errorMessage } from '../api/request';
import {
  AWAITING_LABEL,
  ISSUE_MESSAGE_MAX,
  IssueDetail,
  IssueMessage,
  IssueTransition,
  SENDER_LABEL,
  issueDecisionLabel,
  issueStatusMeta,
  needsRetailerResponse,
} from '../types/issues';
import { formatDateTime, humanize, shortRef, timeAgo } from '../utils/format';
import { formatPaise } from '../utils/money';
import { usePermissions } from '../utils/usePermission';
import { usePullRefresh } from '../utils/usePullRefresh';
import { pickAndUpload } from './orders/OrderActionSheets';
import { EvidenceStrip } from './orders/EvidenceStrip';
import { colors, radii, spacing, type as typeScale } from '../theme/theme';

const MAX_ATTACHMENTS = 5;

/** One dispute: what was raised, Trendzo's decision, the message thread, and a reply box. */
export function IssueDetailScreen({ navigation, route }: ScreenProps<'IssueDetail'>) {
  const { id } = route.params;
  const toast = useToast();
  const { can } = usePermissions();
  const q = useIssue(id);
  const send = usePostIssueMessage(id);
  const handBack = useHandBackIssue(id);
  const pull = usePullRefresh(q.refetch);
  const scrollRef = useRef<ScrollView>(null);

  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [attaching, setAttaching] = useState(false);

  const issue = q.data;
  const canRespond = can('disputes.respond');

  if (!issue) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader overline="Dispute" title={shortRef(id)} onBack={() => navigation.goBack()} />
        {q.isError ? (
          <Banner
            tone="danger"
            title="Couldn't load this dispute"
            message={errorMessage(q.error)}
            actionLabel="Retry"
            onAction={() => q.refetch()}
            style={styles.gapTop}
          />
        ) : (
          <ActivityIndicator color={colors.ink} style={styles.loader} />
        )}
      </Screen>
    );
  }

  const meta = issueStatusMeta(issue.status);
  const needs = needsRetailerResponse(issue);
  const trimmed = text.trim();
  const canSend = canRespond && trimmed.length > 0 && !send.isPending && !attaching;
  const messages = [...issue.messages].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const attach = async () => {
    if (attaching || attachments.length >= MAX_ATTACHMENTS) return;
    setAttaching(true);
    try {
      const url = await pickAndUpload(`issues/${id}`);
      if (url) setAttachments((a) => [...a, url]);
    } catch (e) {
      toast.show(errorMessage(e, 'Upload failed'), 'error');
    } finally {
      setAttaching(false);
    }
  };

  const onSend = () => {
    if (!canSend) return;
    send.mutate(
      { body: trimmed, attachments },
      {
        onSuccess: () => {
          setText('');
          setAttachments([]);
          toast.show('Message sent', 'success');
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250);
        },
        onError: (e) => toast.show(errorMessage(e, "Couldn't send the message"), 'error'),
      },
    );
  };

  const onHandBack = () =>
    Alert.alert(
      'Hand back to Trendzo?',
      'Use this when you have said everything you need to — the dispute goes back to the Trendzo team to decide.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Hand back',
          onPress: () =>
            handBack.mutate(undefined, {
              onSuccess: () => toast.show('Handed back to Trendzo', 'success'),
              onError: (e) => toast.show(errorMessage(e, "Couldn't hand this back"), 'error'),
            }),
        },
      ],
    );

  const showComposer = canRespond;

  return (
    // The pinned composer owns the bottom inset (KeyboardStickyView).
    <Screen edges={['top']}>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[styles.content, showComposer && styles.contentAboveComposer]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={showComposer ? 'on-drag' : 'interactive'}
        automaticallyAdjustKeyboardInsets={!showComposer}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={colors.ink} />}
      >
        <ScreenHeader overline="Dispute" title={issue.subject} onBack={() => navigation.goBack()} />

        <Panel>
          <View style={styles.chipRow}>
            <StatusChip label={meta.label} tone={meta.tone} style={styles.chip} />
            {needs ? <StatusChip label="Needs your response" tone="warning" style={styles.chip} /> : null}
          </View>
          <AppText variant="meta" color={colors.meta}>
            Opened {formatDateTime(issue.createdAt)} · {timeAgo(issue.createdAt)} · {shortRef(issue.id)}
          </AppText>
          {!needs && !isFinished(issue) && issue.awaitingParty !== 'none' ? (
            <AppText variant="meta" color={colors.meta}>
              Waiting on {AWAITING_LABEL[issue.awaitingParty] ?? humanize(issue.awaitingParty)}
            </AppText>
          ) : null}
        </Panel>

        {needs ? (
          <Banner
            tone="warning"
            title="Trendzo is waiting on your reply"
            message={
              canRespond
                ? 'Reply below with what happened and any photos. Hand it back when you are done.'
                : 'Ask the store owner to reply — your login can read this dispute but not respond.'
            }
          />
        ) : null}

        {issue.orderId ? (
          <ListRow
            icon="receipt-outline"
            label={`Order ${shortRef(issue.orderId)}`}
            hint="Open the order"
            onPress={() => navigation.navigate('OrderDetail', { id: issue.orderId as string })}
          />
        ) : null}
        {issue.returnId && can('returns.view') ? (
          <ListRow
            icon="return-down-back-outline"
            label={`Return ${shortRef(issue.returnId)}`}
            hint="Open the return"
            onPress={() => navigation.navigate('ReturnDetail', { id: issue.returnId as string })}
          />
        ) : null}

        <Panel title="What was raised">
          <AppText variant="body" color={colors.ink}>
            {issue.description || '—'}
          </AppText>
          <EvidenceStrip title="Evidence" urls={issue.evidence} />
        </Panel>

        {issue.decision || issue.decisionNote || issue.payoutAdjustmentPaise != null ? (
          <Panel title="Decision">
            {issue.decision ? <DetailRow label="Outcome" value={issueDecisionLabel(issue.decision)} strong /> : null}
            {issue.decidedAt ? <DetailRow label="Decided" value={formatDateTime(issue.decidedAt)} /> : null}
            {issue.payoutAdjustmentPaise != null ? (
              <DetailRow
                label="Payout adjustment"
                value={`${issue.payoutAdjustmentPaise < 0 ? '− ' : ''}${formatPaise(Math.abs(issue.payoutAdjustmentPaise))}`}
                tone={issue.payoutAdjustmentPaise < 0 ? 'negative' : 'default'}
              />
            ) : null}
            {issue.decisionNote ? (
              <>
                <Divider />
                <AppText variant="body" color={colors.ink}>
                  {issue.decisionNote}
                </AppText>
              </>
            ) : null}
          </Panel>
        ) : null}

        <Panel title={`Messages (${messages.length})`}>
          {messages.length === 0 ? (
            <AppText variant="meta" color={colors.meta}>
              No messages yet.
            </AppText>
          ) : (
            <View style={styles.thread}>
              {messages.map((m) => (
                <Bubble key={m.id} message={m} />
              ))}
            </View>
          )}
        </Panel>

        {issue.transitions.length ? <Activity issue={issue} /> : null}

        {needs && canRespond ? (
          <PrimaryButton
            label="Hand back to Trendzo"
            tone="surface"
            loading={handBack.isPending}
            onPress={onHandBack}
          />
        ) : null}
      </ScrollView>

      {showComposer ? (
        <KeyboardStickyView style={styles.composer} minBottom={spacing.sm}>
          {attachments.length ? (
            <View style={styles.attachNote}>
              <Icon name="attach" size={14} color={colors.meta} />
              <AppText variant="meta" color={colors.meta} style={styles.flex}>
                {attachments.length} photo{attachments.length === 1 ? '' : 's'} ready
              </AppText>
              <PressableScale onPress={() => setAttachments([])} haptic={false}>
                <AppText variant="meta" color={colors.ink}>
                  Remove
                </AppText>
              </PressableScale>
            </View>
          ) : null}
          <View style={styles.composerRow}>
            <PressableScale
              onPress={attach}
              disabled={send.isPending || attaching || attachments.length >= MAX_ATTACHMENTS}
              toScale={0.9}
              accessibilityLabel="Attach a photo"
              style={styles.attachBtn}
            >
              {attaching ? <ActivityIndicator color={colors.ink} /> : <Icon name="attach" size={22} color={colors.ink} />}
            </PressableScale>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Write a reply…"
              placeholderTextColor={colors.inkMuted}
              multiline
              maxLength={ISSUE_MESSAGE_MAX}
              style={styles.input}
            />
            <PressableScale
              onPress={onSend}
              disabled={!canSend}
              toScale={0.9}
              accessibilityLabel="Send"
              style={[styles.sendBtn, !canSend && styles.sendBtnOff]}
            >
              {send.isPending ? (
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

function isFinished(i: IssueDetail): boolean {
  return i.status === 'decided' || i.status === 'resolved' || i.status === 'closed';
}

/** Store messages sit right in black; Trendzo and the customer sit left in white. */
function Bubble({ message }: { message: IssueMessage }) {
  const mine = message.senderType === 'retailer';
  const author = SENDER_LABEL[message.senderType] ?? humanize(message.senderType);
  const muted = mine ? colors.onDarkMuted : colors.meta;
  return (
    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleThem]}>
      <AppText variant="meta" color={muted}>
        {author} · {timeAgo(message.at)}
      </AppText>
      <AppText variant="body" color={mine ? colors.accentInk : colors.ink}>
        {message.body}
      </AppText>
      {message.attachments?.length ? (
        <EvidenceStrip urls={message.attachments} />
      ) : null}
    </View>
  );
}

function transitionLine(t: IssueTransition): string {
  const to = issueStatusMeta(t.toStatus).label;
  const who = t.awaitingPartyTo && t.awaitingPartyTo !== 'none' ? ` · now with ${AWAITING_LABEL[t.awaitingPartyTo]}` : '';
  return `${to}${who}`;
}

/** Status history, oldest first. */
function Activity({ issue }: { issue: IssueDetail }) {
  const steps = [...issue.transitions].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return (
    <Panel title="Activity">
      {steps.map((t, i) => {
        const last = i === steps.length - 1;
        return (
          <View key={t.id} style={styles.step}>
            <View style={styles.rail}>
              <View style={[styles.dot, last && styles.dotLast]} />
              {!last ? <View style={styles.line} /> : null}
            </View>
            <View style={styles.stepBody}>
              <AppText variant="bodyMedium" color={colors.ink}>
                {transitionLine(t)}
              </AppText>
              <AppText variant="meta" color={colors.meta}>
                {formatDateTime(t.at)} · {SENDER_LABEL[t.actorType] ?? humanize(t.actorType)}
              </AppText>
              {t.reason ? (
                <AppText variant="meta" color={colors.ink}>
                  {humanize(t.reason)}
                </AppText>
              ) : null}
            </View>
          </View>
        );
      })}
    </Panel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: spacing.xxl, gap: spacing.md },
  contentAboveComposer: { paddingBottom: spacing.lg },
  loader: { marginTop: spacing.xl },
  gapTop: { marginTop: spacing.md },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  chip: { alignSelf: 'center' },
  thread: { gap: spacing.sm },
  bubble: { maxWidth: '88%', borderRadius: radii.card, padding: spacing.md, gap: 4 },
  bubbleMine: { backgroundColor: colors.ink, alignSelf: 'flex-end' },
  bubbleThem: { backgroundColor: colors.canvas, alignSelf: 'flex-start' },
  step: { flexDirection: 'row', gap: spacing.md },
  rail: { width: 12, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.cardGray, marginTop: 6 },
  dotLast: { backgroundColor: colors.ink },
  line: { flex: 1, width: 2, backgroundColor: colors.hairline, marginTop: 2 },
  stepBody: { flex: 1, paddingBottom: spacing.md, gap: 2 },
  composer: { borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: spacing.sm },
  attachNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
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
  sendBtnOff: { opacity: 0.35 },
});
