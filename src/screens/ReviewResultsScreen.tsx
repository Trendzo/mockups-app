import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  BackButton,
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
import { useProductDraft } from '../store/productDraft';
import { SubmissionStatus } from '../types/enums';
import { colors, spacing } from '../theme/theme';
import { shareRemoteImage } from '../utils/gallery';
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
  const [rejecting, setRejecting] = useState(false);
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
          setSubmission({ ...submission, status: res.status });
          // Feed the chosen mockups into the SAME product wizard used for new
          // catalog products. If the user detoured here from the wizard, keep
          // their in-progress draft and just append the images; otherwise start
          // a fresh product with these images pre-loaded.
          const urls = chosen.map((it) => it.url);
          const draft = useProductDraft.getState();
          if (draft.pendingMockup) {
            draft.addGalleryUrls(urls);
            draft.setPendingMockup(false);
          } else {
            draft.startCreate();
            draft.addGalleryUrls(urls);
          }
          toast.show(`${urls.length} image${urls.length === 1 ? '' : 's'} added — add product details`, 'success');
          navigation.navigate('ProductWizardBasics');
        },
        onError: (e) => toast.show(e.error, 'error'),
      },
    );
  };

  // One-click reject — no reason/notes prompt.
  const onReject = () => {
    setRejecting(true);
    decide.mutate(
      {
        id: submission.id,
        input: { decision: 'reject' },
      },
      {
        onSuccess: (res) => {
          setStatus(submission.id, res.status);
          toast.show('Rejected — capture a new shot', 'info');
          navigation.popToTop();
        },
        onError: (e) => {
          console.warn('[ReviewResults] reject failed:', e.error);
          setRejecting(false);
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
            loading={rejecting}
            disabled={!canDecide || decide.isPending}
            onPress={onReject}
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
                ? `Approve ${chosen.length} → Add to product`
                : 'Select at least one'
              : 'Approved'
          }
          tone="accent"
          loading={decide.isPending && !rejecting}
          disabled={!canApprove}
          onPress={onApprove}
        />
      </View>

      <ImageViewer
        visible={viewerIndex != null}
        images={images}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
        onShare={onShare}
      />
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
});
