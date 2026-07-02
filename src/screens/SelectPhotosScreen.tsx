import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  AppImage,
  AppText,
  Icon,
  PressableScale,
  PrimaryButton,
  Screen,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { PhotoSlot, useCaptureDraft } from '../store/captureDraft';
import { colors, radii, spacing } from '../theme/theme';

/**
 * Two-card garment upload (front required, back optional). Each card takes a
 * photo from the camera or the library; back can be left empty.
 */
export function SelectPhotosScreen({ navigation }: ScreenProps<'SelectPhotos'>) {
  const toast = useToast();
  const front = useCaptureDraft((s) => s.front);
  const back = useCaptureDraft((s) => s.back);
  const setPhoto = useCaptureDraft((s) => s.setPhoto);
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

  const canContinue = front != null;

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <AppText variant="sectionLabel" color={colors.meta}>
          Step 1 · Garment photos
        </AppText>
        <AppText variant="cardTitle" color={colors.ink} style={styles.title}>
          Add front & back
        </AppText>
        <AppText variant="meta" color={colors.meta}>
          Front is required. Back is optional — add it for truer back views.
        </AppText>
      </View>

      <View style={styles.row}>
        <PhotoCard
          label="Front"
          required
          photo={front}
          onAdd={() => setChooser('front')}
          onRemove={() => setPhoto('front', null)}
        />
        <PhotoCard
          label="Back"
          photo={back}
          onAdd={() => setChooser('back')}
          onRemove={() => setPhoto('back', null)}
        />
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          label="Continue"
          tone="accent"
          disabled={!canContinue}
          onPress={() =>
            navigation.navigate('Configure', {
              apparel: front!,
              apparelBack: back ?? undefined,
            })
          }
        />
      </View>

      {/* Source chooser */}
      <Modal
        visible={chooser != null}
        transparent
        animationType="slide"
        onRequestClose={() => setChooser(null)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setChooser(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
              Add {chooser} photo
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
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function PhotoCard({
  label,
  required,
  photo,
  onAdd,
  onRemove,
}: {
  label: string;
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
            <Icon name="add" size={34} color={colors.inkMuted} />
            <AppText variant="meta" color={colors.meta} style={styles.emptyLabel}>
              Add {label.toLowerCase()}
            </AppText>
          </View>
        )}
      </PressableScale>
      <AppText variant="sectionLabel" color={colors.meta} style={styles.cardLabel}>
        {label}
        {required ? ' *' : ' · optional'}
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
  header: { paddingTop: spacing.md, gap: spacing.xs },
  title: { fontSize: 24, lineHeight: 28 },
  row: {
    flexDirection: 'row',
    gap: spacing.cardGap,
    marginTop: spacing.xl,
  },
  cardCol: { flex: 1, gap: spacing.sm },
  card: {
    aspectRatio: 0.75,
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
  },
  emptyLabel: {},
  fillCard: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  removeChip: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: { marginLeft: 2 },
  footer: { flex: 1, justifyContent: 'flex-end', paddingBottom: spacing.md },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
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
  sheetTitle: { fontSize: 20, lineHeight: 24, textTransform: 'capitalize' },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
});
