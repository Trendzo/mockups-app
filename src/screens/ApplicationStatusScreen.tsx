import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useQuery } from '@tanstack/react-query';
import {
  AppText,
  BackButton,
  Banner,
  Icon,
  KeyboardStickyView,
  PressableScale,
  PrimaryButton,
  Screen,
  StatusTone,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import {
  getApplicationStatus,
  getMessages,
  postMessage,
  uploadDocument,
} from '../api/onboarding';
import { ApplicationStatus, ThreadMessage } from '../types/onboarding';
import { inferMimeType } from '../utils/image';
import { colors, radii, spacing, type as typeScale } from '../theme/theme';

const BANNER: Record<ApplicationStatus, { tone: StatusTone; title: string; message: string }> = {
  pending: {
    tone: 'pending',
    title: 'Application under review',
    message: "Our team is reviewing your application. We'll notify you here.",
  },
  docs_requested: {
    tone: 'warning',
    title: 'We need more information',
    message: 'Reply below and attach any documents the team asked for.',
  },
  rejected: {
    tone: 'danger',
    title: 'Action needed',
    message: 'Your application needs changes before it can be approved.',
  },
  approved: {
    tone: 'success',
    title: "You're approved!",
    message: 'Your account and store are ready. Log in to start.',
  },
};

export function ApplicationStatusScreen({
  navigation,
  route,
}: ScreenProps<'ApplicationStatus'>) {
  const { applicationId, email } = route.params;
  const toast = useToast();

  const statusQ = useQuery({
    queryKey: ['application-status', applicationId],
    queryFn: () => getApplicationStatus(applicationId, email),
    retry: 0,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'approved' || s === 'rejected' ? false : 25_000;
    },
  });

  const status = statusQ.data?.status;
  const showThread = status === 'docs_requested' || status === 'pending';

  const messagesQ = useQuery({
    queryKey: ['application-messages', applicationId],
    queryFn: () => getMessages(applicationId, email),
    enabled: showThread,
    retry: 0,
    refetchInterval: showThread ? 25_000 : false,
  });

  const [reply, setReply] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const attach = async () => {
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

  const send = async () => {
    if (!reply.trim() && attachments.length === 0) return;
    setSending(true);
    try {
      await postMessage(applicationId, {
        applicantEmail: email,
        body: reply.trim() || '(see attachment)',
        attachmentUrls: attachments,
      });
      setReply('');
      setAttachments([]);
      messagesQ.refetch();
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not send', 'error');
    } finally {
      setSending(false);
    }
  };

  const banner = status ? BANNER[status] : null;

  return (
    <Screen edges={['top']}>
      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={styles.content}
      >
        <BackButton onPress={() => navigation.navigate('Login')} />
          <View style={styles.header}>
            <AppText variant="sectionLabel" color={colors.meta}>
              Application {applicationId}
            </AppText>
            <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
              Onboarding status
            </AppText>
          </View>

          {statusQ.isLoading ? (
            <ActivityIndicator color={colors.ink} />
          ) : statusQ.isError ? (
            <Banner tone="danger" title="Couldn't load status" message={(statusQ.error as any)?.message} actionLabel="Retry" onAction={() => statusQ.refetch()} />
          ) : banner ? (
            <>
              <Banner tone={banner.tone} title={banner.title} message={banner.message} />

              {statusQ.data?.submittedAt ? (
                <AppText variant="meta" color={colors.meta}>
                  Submitted {new Date(statusQ.data.submittedAt).toLocaleDateString()}
                </AppText>
              ) : null}

              {status === 'rejected' && statusQ.data?.decisionReason ? (
                <View style={styles.reasonCard}>
                  <AppText variant="sectionLabel" color={colors.meta}>Reason</AppText>
                  <AppText variant="body" color={colors.ink}>{statusQ.data.decisionReason}</AppText>
                </View>
              ) : null}

              {status === 'approved' ? (
                <PrimaryButton label="Continue to login" tone="accent" onPress={() => navigation.navigate('Login')} />
              ) : null}

              {status === 'rejected' ? (
                <PrimaryButton label="Fix & resubmit" tone="accent" onPress={() => navigation.navigate('Resubmit', { applicationId, email })} />
              ) : null}

              {showThread ? (
                <View style={styles.thread}>
                  <AppText variant="sectionLabel" color={colors.meta}>Messages</AppText>
                  {messagesQ.data && messagesQ.data.length > 0 ? (
                    messagesQ.data.map((m) => <Bubble key={m.id} message={m} />)
                  ) : (
                    <AppText variant="meta" color={colors.meta}>No messages yet.</AppText>
                  )}
                </View>
              ) : null}
            </>
          ) : null}
        </ScrollView>

      {showThread ? (
        <KeyboardStickyView style={styles.composer} minBottom={spacing.sm}>
          {attachments.length > 0 ? (
            <AppText variant="meta" color={colors.meta} style={styles.attachNote}>
              {attachments.length} attachment{attachments.length > 1 ? 's' : ''} ready
            </AppText>
          ) : null}
          <View style={styles.composerRow}>
            <PressableScale onPress={attach} style={styles.attachBtn} toScale={0.9}>
              <Icon name="attach" size={22} color={colors.ink} />
            </PressableScale>
            <TextInput
              value={reply}
              onChangeText={setReply}
              placeholder="Reply to the team…"
              placeholderTextColor={colors.inkMuted}
              multiline
              style={styles.input}
            />
            <PressableScale onPress={send} disabled={sending} style={styles.sendBtn} toScale={0.9}>
              {sending ? <ActivityIndicator color={colors.accentInk} /> : <Icon name="arrow-up" size={20} color={colors.accentInk} />}
            </PressableScale>
          </View>
        </KeyboardStickyView>
      ) : null}
    </Screen>
  );
}

function Bubble({ message }: { message: ThreadMessage }) {
  const mine = message.from === 'applicant';
  return (
    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleThem]}>
      <AppText variant="body" color={mine ? colors.accentInk : colors.ink}>
        {message.body}
      </AppText>
      {message.attachmentUrls?.length ? (
        <AppText variant="meta" color={mine ? colors.onDarkMuted : colors.meta}>
          📎 {message.attachmentUrls.length} attachment(s)
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  header: { gap: spacing.xs },
  h1: { fontSize: 24, lineHeight: 28 },
  reasonCard: { backgroundColor: colors.surface, borderRadius: radii.card, padding: spacing.md, gap: spacing.xs },
  thread: { gap: spacing.sm, marginTop: spacing.sm },
  bubble: { maxWidth: '85%', borderRadius: radii.card, padding: spacing.md, gap: 2 },
  bubbleThem: { backgroundColor: colors.surface, alignSelf: 'flex-start' },
  bubbleMine: { backgroundColor: colors.ink, alignSelf: 'flex-end' },
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
});
