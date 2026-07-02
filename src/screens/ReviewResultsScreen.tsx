import React, { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  AppText,
  ImageViewer,
  MockupGrid,
  PrimaryButton,
  Screen,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useDecideSubmission } from '../api/hooks';
import { useSession } from '../store/session';
import { useCaptureDraft } from '../store/captureDraft';
import { SubmissionStatus } from '../types/enums';
import { colors, radii, spacing, type as typeScale } from '../theme/theme';
import { saveRemoteImage, shareRemoteImage } from '../utils/gallery';
import { ensurePhotoAddPermission, openAppSettings } from '../utils/permissions';
import { Haptics } from '../utils/haptics';

/** Review Results (§5.6): grid + viewer + save/share + Approve/Reject/Make again. */
export function ReviewResultsScreen({
  navigation,
  route,
}: ScreenProps<'ReviewResults'>) {
  const toast = useToast();
  const decide = useDecideSubmission();
  const setStatus = useSession((s) => s.setStatus);
  const clearDraft = useCaptureDraft((s) => s.clear);

  const [submission, setSubmission] = useState(route.params.submission);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [notes, setNotes] = useState('');

  const images = useMemo(
    () =>
      submission.outputUrls.map((url, i) => ({
        url,
        name: submission.outputUrls.length ? guessName(url, i) : `view-${i}`,
      })),
    [submission.outputUrls],
  );

  const canDecide = submission.status === SubmissionStatus.ReadyForReview;

  const onSave = async (index: number) => {
    const url = submission.outputUrls[index];
    const perm = await ensurePhotoAddPermission();
    if (perm === 'blocked') {
      toast.show('Enable photo access in Settings', 'error');
      openAppSettings();
      return;
    }
    try {
      await saveRemoteImage(url);
      toast.show('Saved to gallery', 'success');
    } catch {
      toast.show("Couldn't save image", 'error');
    }
  };

  const onShare = async (index: number) => {
    try {
      await shareRemoteImage(submission.outputUrls[index]);
    } catch {
      /* user cancelled */
    }
  };

  const onApprove = () => {
    if (!canDecide) return;
    decide.mutate(
      { id: submission.id, input: { decision: 'accept' } },
      {
        onSuccess: (res) => {
          Haptics.success();
          setStatus(submission.id, res.status);
          const next = { ...submission, status: res.status };
          setSubmission(next);
          navigation.navigate('Publish', { submission: next });
        },
        onError: (e) => toast.show(e.error, 'error'),
      },
    );
  };

  const onReject = () => {
    decide.mutate(
      {
        id: submission.id,
        input: { decision: 'reject', revisionNotes: notes.trim() || undefined },
      },
      {
        onSuccess: (res) => {
          setStatus(submission.id, res.status);
          setRejectOpen(false);
          toast.show('Rejected — capture a new shot', 'info');
          navigation.popToTop();
        },
        onError: (e) => {
          setRejectOpen(false);
          toast.show(e.error, 'error');
        },
      },
    );
  };

  return (
    <Screen edges={['top']} padded={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <AppText variant="sectionLabel" color={colors.meta}>
          Step 3 · Review results
        </AppText>
        <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
          {images.length} mockups ready
        </AppText>
        <AppText variant="meta" color={colors.meta} style={styles.sub}>
          Tap any to zoom, save, or share. Approve to publish, or reject to redo.
        </AppText>

        <MockupGrid items={images} onPressItem={(i) => setViewerIndex(i)} />
      </ScrollView>

      {/* Sticky decision bar */}
      <View style={styles.bar}>
        <View style={styles.row}>
          <PrimaryButton
            label="Reject"
            tone="ghost"
            style={styles.flex}
            disabled={!canDecide || decide.isPending}
            onPress={() => setRejectOpen(true)}
          />
          <PrimaryButton
            label="Make again"
            tone="surface"
            style={styles.flex}
            onPress={() => {
              clearDraft();
              navigation.navigate('SelectPhotos');
            }}
          />
        </View>
        <PrimaryButton
          label={canDecide ? 'Approve → Publish' : 'Approved'}
          tone="accent"
          loading={decide.isPending && !rejectOpen}
          disabled={!canDecide}
          onPress={onApprove}
        />
      </View>

      <ImageViewer
        visible={viewerIndex != null}
        images={images}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
        onSave={onSave}
        onShare={onShare}
      />

      {/* Reject notes sheet */}
      <Modal visible={rejectOpen} transparent animationType="slide">
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
              What should change?
            </AppText>
            <AppText variant="meta" color={colors.meta}>
              Optional revision notes saved with the rejection.
            </AppText>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. lighting too warm, show the back view"
              placeholderTextColor={colors.inkMuted}
              multiline
              style={styles.notesInput}
            />
            <View style={styles.row}>
              <PrimaryButton
                label="Cancel"
                tone="surface"
                style={styles.flex}
                onPress={() => setRejectOpen(false)}
              />
              <PrimaryButton
                label="Reject"
                tone="danger"
                style={styles.flex}
                loading={decide.isPending}
                onPress={onReject}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

/** Best-effort view name from a /files/<job>/<view>.png url. */
function guessName(url: string, index: number): string {
  const file = url.split('?')[0].split('/').pop() ?? '';
  const stem = file.replace(/\.[a-z0-9]+$/i, '');
  return stem || `view-${index}`;
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    paddingBottom: 200,
    gap: spacing.sm,
  },
  h1: { fontSize: 24, lineHeight: 28 },
  sub: { marginBottom: spacing.md },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    gap: spacing.md,
  },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
  notesInput: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    minHeight: 96,
    textAlignVertical: 'top',
    color: colors.ink,
    fontFamily: typeScale.body.fontFamily,
    fontSize: typeScale.body.fontSize,
  },
});
