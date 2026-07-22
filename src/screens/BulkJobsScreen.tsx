import React from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import {
  AppImage,
  AppText,
  BackButton,
  Banner,
  Icon,
  PressableScale,
  PrimaryButton,
  Screen,
  StatusChip,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useBulkJobs, useCancelBulkJob, useDismissBulkJob } from '../api/bulkMockupHooks';
import { useProductDraft } from '../store/productDraft';
import { BulkJobStatus, BulkMockupJob } from '../types/bulkMockup';
import type { StatusTone } from '../components';
import { colors, radii, spacing } from '../theme/theme';

const STATUS_META: Record<BulkJobStatus, { label: string; tone: StatusTone }> = {
  queued: { label: 'Queued', tone: 'neutral' },
  processing: { label: 'Generating', tone: 'warning' },
  ready: { label: 'Ready', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  dismissed: { label: 'Dismissed', tone: 'neutral' },
};

/**
 * Bulk-mockup job queue (beta). Opened from the Bulk Mockup screen's badge.
 * Queued → cancel; ready → finish (into the product-details flow) or dismiss.
 */
export function BulkJobsScreen({ navigation }: ScreenProps<'BulkJobs'>) {
  const toast = useToast();
  const jobsQ = useBulkJobs();
  const cancel = useCancelBulkJob();
  const dismiss = useDismissBulkJob();
  const jobs = jobsQ.data ?? [];

  const finish = (job: BulkMockupJob) => {
    const draft = useProductDraft.getState();
    draft.startCreate();
    draft.addGalleryUrls(job.outputUrls);
    toast.show('Add product details to go live', 'success');
    navigation.navigate('ProductWizardBasics');
  };

  return (
    <Screen edges={['top']}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>
      <AppText variant="sectionLabel" color={colors.meta}>
        Bulk Mockup · Beta
      </AppText>
      <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
        Generation queue
      </AppText>

      {jobsQ.isLoading ? (
        <ActivityIndicator color={colors.ink} style={styles.loader} />
      ) : jobsQ.isError ? (
        <Banner
          tone="danger"
          title="Couldn't load jobs"
          message={(jobsQ.error as { message?: string })?.message}
          actionLabel="Retry"
          onAction={() => jobsQ.refetch()}
        />
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(j) => j.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={jobsQ.isRefetching}
              onRefresh={() => jobsQ.refetch()}
              tintColor={colors.ink}
            />
          }
          ListEmptyComponent={
            <AppText variant="meta" color={colors.meta} style={styles.empty}>
              No mockup jobs yet. Add products from the Bulk Mockup screen.
            </AppText>
          }
          renderItem={({ item }) => (
            <JobRow
              job={item}
              onFinish={() => finish(item)}
              onCancel={() => cancel.mutate(item.id, { onError: (e) => toast.show((e as Error).message, 'error') })}
              onDismiss={() => dismiss.mutate(item.id, { onError: (e) => toast.show((e as Error).message, 'error') })}
              busy={cancel.isPending || dismiss.isPending}
            />
          )}
        />
      )}
    </Screen>
  );
}

function JobRow({
  job,
  onFinish,
  onCancel,
  onDismiss,
  busy,
}: {
  job: BulkMockupJob;
  onFinish: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  const meta = STATUS_META[job.status];
  const thumb = job.outputUrls[0] ?? job.referenceImageUrls[0];
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        {thumb ? (
          <AppImage uri={thumb} radius={radii.sm} containerStyle={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Icon name="image-outline" size={22} color={colors.inkMuted} />
          </View>
        )}
        <View style={styles.cardBody}>
          <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
            {job.mode === 'with_model' ? 'On-model mockups' : 'Product mockups'}
          </AppText>
          <AppText variant="meta" color={colors.meta}>
            {job.status === 'ready'
              ? `${job.outputUrls.length} image${job.outputUrls.length === 1 ? '' : 's'} ready`
              : job.status === 'failed'
                ? job.errorMessage ?? 'Generation failed'
                : job.status === 'processing'
                  ? 'Generating mockups…'
                  : 'Waiting in queue'}
          </AppText>
        </View>
        <StatusChip label={meta.label} tone={meta.tone} />
      </View>

      {/* Ready preview strip */}
      {job.status === 'ready' && job.outputUrls.length > 1 ? (
        <View style={styles.strip}>
          {job.outputUrls.slice(0, 4).map((u) => (
            <AppImage key={u} uri={u} radius={radii.sm} containerStyle={styles.stripThumb} />
          ))}
        </View>
      ) : null}

      {/* Actions */}
      <View style={styles.actions}>
        {job.status === 'queued' ? (
          <PrimaryButton label="Cancel" tone="ghost" disabled={busy} onPress={onCancel} />
        ) : null}
        {job.status === 'processing' ? (
          <View style={styles.processing}>
            <ActivityIndicator size="small" color={colors.meta} />
            <AppText variant="meta" color={colors.meta}>
              Generating…
            </AppText>
          </View>
        ) : null}
        {job.status === 'ready' ? (
          <View style={styles.readyRow}>
            <PrimaryButton
              label="Dismiss"
              tone="surface"
              style={styles.flex}
              disabled={busy}
              onPress={onDismiss}
            />
            <PrimaryButton
              label="Finish product"
              tone="accent"
              style={styles.flex}
              onPress={onFinish}
            />
          </View>
        ) : null}
        {job.status === 'failed' || job.status === 'cancelled' ? (
          <PrimaryButton label="Dismiss" tone="surface" disabled={busy} onPress={onDismiss} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xs },
  h1: { fontSize: 24, lineHeight: 28, marginBottom: spacing.sm },
  loader: { marginTop: spacing.xl },
  listContent: { paddingTop: spacing.sm, paddingBottom: 120, gap: spacing.md },
  empty: { textAlign: 'center', marginTop: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: { width: 52, height: 52, borderRadius: radii.sm },
  thumbEmpty: { backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, gap: 2 },
  strip: { flexDirection: 'row', gap: spacing.xs },
  stripThumb: { flex: 1, aspectRatio: 0.8, borderRadius: radii.sm },
  actions: { gap: spacing.sm },
  processing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  readyRow: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
