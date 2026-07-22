import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  AppImage,
  AppText,
  BackButton,
  BottomSheet,
  SheetSurface,
  Icon,
  PressableScale,
  PrimaryButton,
  Screen,
  ShootConfig,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { PhotoSlot, useCaptureDraft } from '../store/captureDraft';
import { useBulkJobSummary, useEnqueueBulkMockup } from '../api/bulkMockupHooks';
import { Mode, viewsForMode } from '../types/enums';
import { prepareUpload } from '../utils/image';
import { colors, radii, spacing } from '../theme/theme';

const PHOTO_SLOTS: PhotoSlot[] = ['front', 'back', 'pattern', 'logo', 'tag'];

const SLOT_LABEL: Record<PhotoSlot, string> = {
  front: 'Front',
  back: 'Back',
  pattern: 'Pattern',
  logo: 'Logo',
  tag: 'Brand tag',
};

/**
 * Garment photo upload (§New Mockup). Front required; back optional; plus three
 * optional close-up references (pattern, logo, tag) - same upload mechanism.
 */
export function SelectPhotosScreen({ navigation, route }: ScreenProps<'SelectPhotos'>) {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const draft = useCaptureDraft();
  const setPhoto = draft.setPhoto;
  const [chooser, setChooser] = useState<PhotoSlot | null>(null);

  // Bulk Mockup mode (beta): same capture screen, but the "how we shoot" config
  // lives here (accordion) and the CTA queues a job + clears the images so the
  // retailer can immediately add the next product. Absent = the normal flow.
  const bulk = route.params?.bulk === true;
  const [configOpen, setConfigOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const summaryQ = useBulkJobSummary(bulk);
  const enqueue = useEnqueueBulkMockup();
  const pending = summaryQ.data?.pending ?? 0;

  const clearImages = () => PHOTO_SLOTS.forEach((s) => setPhoto(s, null));

  const onAddNext = async () => {
    if (!draft.front || submitting) return;
    setSubmitting(true);
    try {
      const apparel = await prepareUpload(draft.front.uri);
      const apparelBack = draft.back ? await prepareUpload(draft.back.uri) : undefined;
      const pattern = draft.pattern ? await prepareUpload(draft.pattern.uri) : undefined;
      const logo = draft.logo ? await prepareUpload(draft.logo.uri) : undefined;
      const tag = draft.tag ? await prepareUpload(draft.tag.uri) : undefined;
      const { mode, modelGender, only } = draft.config;
      const validOnly = only.filter((v) => (viewsForMode(mode) as readonly string[]).includes(v));
      await enqueue.mutateAsync({
        mode,
        apparel,
        apparelBack,
        pattern,
        logo,
        tag,
        modelGender: mode === Mode.WithModel ? modelGender ?? undefined : undefined,
        only: validOnly.length ? validOnly : undefined,
      });
      clearImages(); // keep the config; just reset the photos for the next product
      toast.show('Queued — add the next product', 'success');
    } catch (e) {
      toast.show((e as { message?: string })?.message ?? 'Could not queue mockups', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const pickFromLibrary = async (slot: PhotoSlot) => {
    setChooser(null);
    const res = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.9,
      maxWidth: 2048,
      maxHeight: 2048,
    });
    if (res.errorCode) {
      toast.show(res.errorMessage ?? 'Could not open library', 'error');
      return;
    }
    const uri = res.assets?.[0]?.uri;
    if (uri) setPhoto(slot, { uri });
  };

  const takePhoto = (slot: PhotoSlot) => {
    setChooser(null);
    navigation.navigate('Capture', { slot });
  };

  const canContinue = draft.front != null;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, bulk && styles.contentBulk]}
      >
        {/* Header row: back + (bulk) a queued-jobs badge that opens the queue. */}
        <View style={styles.topRow}>
          <BackButton onPress={() => navigation.goBack()} />
          {bulk ? (
            <PressableScale
              onPress={() => navigation.navigate('BulkJobs')}
              style={styles.badge}
              haptic={false}
            >
              <Icon name="layers-outline" size={16} color={colors.ink} />
              <AppText variant="meta" color={colors.ink}>
                {pending > 0 ? `${pending} in queue` : 'Queue'}
              </AppText>
              {pending > 0 ? <View style={styles.badgeDot} /> : null}
            </PressableScale>
          ) : null}
        </View>

        <View style={styles.header}>
          <AppText variant="sectionLabel" color={colors.meta}>
            {bulk ? 'Bulk Mockup · Beta' : 'Step 1 · Garment photos'}
          </AppText>
          <AppText variant="cardTitle" color={colors.ink} style={styles.title}>
            Add product photos
          </AppText>
          <AppText variant="meta" color={colors.meta}>
            {bulk
              ? 'Queue each product, then add the next. Mockups generate in the background.'
              : 'Front is required. The rest are extra references that improve fidelity.'}
          </AppText>
        </View>

        <View style={styles.row}>
          <PhotoCard
            label="Front"
            required
            photo={draft.front}
            onAdd={() => setChooser('front')}
            onRemove={() => setPhoto('front', null)}
          />
          <PhotoCard
            label="Back"
            photo={draft.back}
            onAdd={() => setChooser('back')}
            onRemove={() => setPhoto('back', null)}
          />
        </View>

        <AppText variant="sectionLabel" color={colors.meta} style={styles.closeupLabel}>
          Close-ups
        </AppText>
        <View style={styles.row}>
          <PhotoCard
            label="Pattern"
            hint="Texture / weave"
            photo={draft.pattern}
            onAdd={() => setChooser('pattern')}
            onRemove={() => setPhoto('pattern', null)}
          />
          <PhotoCard
            label="Logo"
            hint="Monogram"
            photo={draft.logo}
            onAdd={() => setChooser('logo')}
            onRemove={() => setPhoto('logo', null)}
          />
          <PhotoCard
            label="Brand tag"
            hint="Label"
            photo={draft.tag}
            onAdd={() => setChooser('tag')}
            onRemove={() => setPhoto('tag', null)}
          />
        </View>

        {/* Bulk mode: inline "how we shoot" config as a compact accordion. */}
        {bulk ? (
          <View style={styles.configCard}>
            <PressableScale
              onPress={() => setConfigOpen((o) => !o)}
              haptic={false}
              style={styles.configHead}
            >
              <View style={styles.flex}>
                <AppText variant="sectionLabel" color={colors.meta}>
                  Config
                </AppText>
                <AppText variant="meta" color={colors.meta}>
                  {draft.config.mode === Mode.WithModel
                    ? `On-model · ${draft.config.modelGender === 'her' ? 'female' : 'male'}`
                    : 'Product shots'}
                  {draft.config.only.length ? ` · ${draft.config.only.length} views` : ''}
                </AppText>
              </View>
              <Icon
                name={configOpen ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.meta}
              />
            </PressableScale>
            {configOpen ? (
              <View style={styles.configBody}>
                <ShootConfig />
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {bulk ? (
        // Floating CTA — queues the current product, then clears for the next.
        <PressableScale
          onPress={onAddNext}
          disabled={!canContinue || submitting}
          style={[
            styles.fab,
            { bottom: insets.bottom + spacing.md },
            (!canContinue || submitting) && styles.fabDisabled,
          ]}
        >
          <Icon name="add" size={20} color={colors.accentInk} />
          <AppText variant="bodyMedium" color={colors.accentInk}>
            {submitting ? 'Queuing…' : 'Add next product'}
          </AppText>
        </PressableScale>
      ) : (
        <View style={styles.footer}>
          <PrimaryButton
            label="Continue"
            tone="accent"
            disabled={!canContinue}
            onPress={() => navigation.navigate('Configure')}
          />
        </View>
      )}

      {/* Source chooser */}
      <BottomSheet visible={chooser != null} onClose={() => setChooser(null)}>
        <SheetSurface style={styles.sheet}>
          <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
            Add {chooser ? SLOT_LABEL[chooser] : ''} photo
          </AppText>
          <SheetRow
            icon="camera"
            label="Take photo"
            onPress={() => chooser && takePhoto(chooser)}
          />
          <SheetRow
            icon="images"
            label="Choose from library"
            onPress={() => chooser && pickFromLibrary(chooser)}
          />
          <PrimaryButton
            label="Cancel"
            tone="surface"
            onPress={() => setChooser(null)}
          />
        </SheetSurface>
      </BottomSheet>
    </Screen>
  );
}

function PhotoCard({
  label,
  hint,
  required,
  photo,
  onAdd,
  onRemove,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  photo: { uri: string } | null;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.cardCol}>
      <PressableScale onPress={onAdd} toScale={0.98} style={styles.card}>
        {photo ? (
          <>
            <AppImage
              uri={photo.uri}
              radius={radii.card}
              containerStyle={styles.fillCard}
            />
            <PressableScale onPress={onRemove} style={styles.removeChip} toScale={0.9}>
              <Icon name="close" size={16} color={colors.surface} />
            </PressableScale>
          </>
        ) : (
          <View style={styles.empty}>
            <Icon name="add" size={28} color={colors.inkMuted} />
            {hint ? (
              <AppText variant="meta" color={colors.meta} style={styles.hintText}>
                {hint}
              </AppText>
            ) : null}
          </View>
        )}
      </PressableScale>
      <AppText variant="sectionLabel" color={colors.meta} style={styles.cardLabel}>
        {label}
        {required ? ' *' : ''}
      </AppText>
    </View>
  );
}

function SheetRow({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} style={styles.sheetRow} toScale={0.98}>
      <Icon name={icon} size={22} color={colors.ink} />
      <AppText variant="bodyMedium" color={colors.ink}>
        {label}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  contentBulk: { paddingBottom: 96 },
  flex: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  badgeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  configCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  configHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  configBody: { marginTop: spacing.md },
  fab: {
    position: 'absolute',
    left: spacing.screenH,
    right: spacing.screenH,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabDisabled: { opacity: 0.5 },
  header: { gap: spacing.xs, marginTop: spacing.sm },
  title: { fontSize: 24, lineHeight: 28 },
  row: { flexDirection: 'row', gap: spacing.cardGap },
  closeupLabel: { marginTop: spacing.sm, marginLeft: 2 },
  cardCol: { flex: 1, gap: spacing.sm },
  card: {
    aspectRatio: 0.8,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderStyle: 'dashed',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  hintText: { textAlign: 'center' },
  fillCard: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  removeChip: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: { marginLeft: 2 },
  footer: { paddingVertical: spacing.md },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.canvas,
    borderRadius: radii.card,
    padding: spacing.md,
  },
});
