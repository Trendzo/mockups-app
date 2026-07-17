import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
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
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { PhotoSlot, useCaptureDraft } from '../store/captureDraft';
import { colors, radii, spacing } from '../theme/theme';

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
export function SelectPhotosScreen({ navigation }: ScreenProps<'SelectPhotos'>) {
  const toast = useToast();
  const draft = useCaptureDraft();
  const setPhoto = draft.setPhoto;
  const [chooser, setChooser] = useState<PhotoSlot | null>(null);

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
        contentContainerStyle={styles.content}
      >
        <BackButton onPress={() => navigation.goBack()} />

        <View style={styles.header}>
          <AppText variant="sectionLabel" color={colors.meta}>
            Step 1 · Garment photos
          </AppText>
          <AppText variant="cardTitle" color={colors.ink} style={styles.title}>
            Add product photos
          </AppText>
          <AppText variant="meta" color={colors.meta}>
            Front is required. The rest are extra references that improve fidelity.
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
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label="Continue"
          tone="accent"
          disabled={!canContinue}
          onPress={() => navigation.navigate('Configure')}
        />
      </View>

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
