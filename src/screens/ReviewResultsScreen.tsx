import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  BackButton,
  BottomSheet,
  ImageViewer,
  PrimaryButton,
  Screen,
  SortableMockupGrid,
  SortableMockupItem,
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
  const insets = useSafeAreaInsets();
  const decide = useDecideSubmission();
  const setStatus = useSession((s) => s.setStatus);
  const clearDraft = useCaptureDraft((s) => s.clear);
  // The garment photos are still in the draft during the live review flow, so we
  // can send the user back to Configure to tweak & regenerate the same garment.
  const hasGarment = useCaptureDraft((s) => !!s.front);

  const [submission, setSubmission] = useState(route.params.submission);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [dragging, setDragging] = useState(false);

  // Stable item list (id + url + view name). The user arranges the order and
  // selects which mockups to keep; only the chosen ones publish, in this order.
  const items = useMemo<SortableMockupItem[]>(
    () =>
      submission.outputUrls.map((url, i) => ({
        id: String(i),
        url,
        name: guessName(url, i),
      })),
    [submission.outputUrls],
  );
  const itemsById = useMemo(
    () => Object.fromEntries(items.map((it) => [it.id, it])),
    [items],
  );

  const [order, setOrder] = useState<string[]>(() => items.map((it) => it.id));
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((it) => [it.id, true])),
  );

  const orderedItems = useMemo(
    () =>
      order.map((id) => itemsById[id]).filter(Boolean) as SortableMockupItem[],
    [order, itemsById],
  );
  const chosen = useMemo(
    () => orderedItems.filter((it) => selected[it.id]),
    [orderedItems, selected],
  );
  // The zoom viewer works over the currently arranged order.
  const images = orderedItems;

  const canDecide = submission.status === SubmissionStatus.ReadyForReview;
  const canApprove = canDecide && chosen.length > 0;

  const onSave = async (index: number) => {
    const url = orderedItems[index]?.url;
    if (!url) return;
    const perm = await ensurePhotoAddPermission();
    if (perm === 'blocked') {
      toast.show('Enable photo access in Settings', 'error');
      openAppSettings();
      return;
    }
    try {
      await saveRemoteImage(url);
      // Explicit confirmation popup that the image was downloaded to the gallery.
      Alert.alert('Image downloaded', 'Saved to your gallery in the “Trendzo” album.');
    } catch {
      Alert.alert("Couldn't download image", 'Please try again.');
    }
  };

  const onShare = async (index: number) => {
    const url = orderedItems[index]?.url;
    if (!url) return;
    try {
      await shareRemoteImage(url);
    } catch {
      /* user cancelled */
    }
  };

  const onApprove = () => {
    if (!canApprove) return;
    decide.mutate(
      { id: submission.id, input: { decision: 'accept' } },
      {
        onSuccess: (res) => {
          Haptics.success();
          setStatus(submission.id, res.status);
          // Keep the full set in local state, but publish only the chosen
          // mockups in the arranged order.
          const updated = { ...submission, status: res.status };
          setSubmission(updated);
          navigation.navigate('Publish', {
            submission: { ...updated, outputUrls: chosen.map((it) => it.url) },
          });
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
          console.warn('[ReviewResults] reject failed:', e.error);
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
        scrollEnabled={!dragging}
      >
        <BackButton onPress={() => navigation.goBack()} />
        <AppText variant="sectionLabel" color={colors.meta}>
          Step 3 · Review results
        </AppText>
        <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
          {chosen.length} of {items.length} selected
        </AppText>
        <AppText variant="meta" color={colors.meta} style={styles.sub}>
          Tap to select · hold &amp; drag to reorder · ⤢ to zoom. Chosen mockups
          publish in this order.
        </AppText>

        <SortableMockupGrid
          items={items}
          selected={selected}
          onToggleSelect={(id) =>
            setSelected((s) => ({ ...s, [id]: !s[id] }))
          }
          onReorder={setOrder}
          onZoom={(id) =>
            setViewerIndex(orderedItems.findIndex((it) => it.id === id))
          }
          onDragStart={() => setDragging(true)}
          onDragEnd={() => setDragging(false)}
        />
      </ScrollView>

      {/* Sticky decision bar */}
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.row}>
          <PrimaryButton
            label="Reject"
            tone="ghost"
            style={styles.flex}
            disabled={!canDecide || decide.isPending}
            onPress={() => setRejectOpen(true)}
          />
          {canDecide && hasGarment ? (
            <PrimaryButton
              label="Regenerate"
              tone="surface"
              style={styles.flex}
              disabled={decide.isPending}
              // Keep the garment photos + prior settings; go tweak and re-run.
              onPress={() => navigation.navigate('Configure')}
            />
          ) : (
            <PrimaryButton
              label="Make again"
              tone="surface"
              style={styles.flex}
              onPress={() => {
                clearDraft();
                navigation.navigate('SelectPhotos');
              }}
            />
          )}
        </View>
        <PrimaryButton
          label={
            canDecide
              ? chosen.length > 0
                ? `Approve ${chosen.length} → Publish`
                : 'Select at least one'
              : 'Approved'
          }
          tone="accent"
          loading={decide.isPending && !rejectOpen}
          disabled={!canApprove}
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
      <BottomSheet
        visible={rejectOpen}
        onClose={() => setRejectOpen(false)}
        avoidKeyboard
      >
        <View style={styles.sheet}>
            <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
              What should change?
            </AppText>
            <AppText variant="meta" color={colors.meta}>
              Revision notes saved with the rejection.
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
      </BottomSheet>
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
    // paddingBottom applied inline from the safe-area inset.
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    gap: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
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
