import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
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
import { useCreateTryon } from '../api/hooks';
import { LocalPhoto } from '../navigation/types';
import { prepareUpload } from '../utils/image';
import { colors, radii, spacing } from '../theme/theme';
import { Haptics } from '../utils/haptics';

/** Virtual Try-On (§5.8): person + 1–2 ordered garments → composited result. */
export function TryOnScreen({ navigation }: ScreenProps<'TryOn'>) {
  const toast = useToast();
  const tryon = useCreateTryon();
  const [person, setPerson] = useState<LocalPhoto | null>(null);
  const [garments, setGarments] = useState<LocalPhoto[]>([]);

  const pick = async (onPicked: (p: LocalPhoto) => void) => {
    const res = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.9,
      maxWidth: 2048,
      maxHeight: 2048,
    });
    const asset = res.assets?.[0];
    if (asset?.uri) onPicked({ uri: asset.uri });
  };

  const addGarment = () =>
    pick((p) => setGarments((prev) => [...prev, p].slice(0, 2)));

  const removeGarment = (idx: number) =>
    setGarments((prev) => prev.filter((_, i) => i !== idx));

  const canGenerate = person != null && garments.length >= 1;

  const onGenerate = async () => {
    if (!canGenerate) return;
    Haptics.press();
    const personFile = await prepareUpload(person!.uri);
    const garmentFiles = await Promise.all(
      garments.map((g) => prepareUpload(g.uri)),
    );
    tryon.mutate(
      { person: personFile, garments: garmentFiles },
      {
        onSuccess: (result) => {
          Haptics.success();
          navigation.navigate('TryOnResult', { result });
        },
        onError: (e) => toast.show(e.error, 'error'),
      },
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <AppText variant="sectionLabel" color={colors.meta}>
          Virtual Try-On
        </AppText>
        <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
          Dress the model
        </AppText>

        {/* Person */}
        <AppText variant="sectionLabel" color={colors.meta}>
          Person
        </AppText>
        <PressableScale onPress={() => pick(setPerson)} style={styles.personBox}>
          {person ? (
            <AppImage
              uri={person.uri}
              radius={radii.card}
              containerStyle={styles.personImg}
            />
          ) : (
            <View style={styles.personEmpty}>
              <AppText variant="body" color={colors.inkMuted}>
                Tap to add a person photo
              </AppText>
            </View>
          )}
        </PressableScale>

        {/* Garments */}
        <AppText variant="sectionLabel" color={colors.meta}>
          Garments (in order — e.g. top then bottom)
        </AppText>
        <View style={styles.garmentRow}>
          {garments.map((g, i) => (
            <PressableScale
              key={`${g.uri}-${i}`}
              onPress={() => removeGarment(i)}
              style={styles.garmentCell}
            >
              <AppImage
                uri={g.uri}
                radius={radii.card}
                containerStyle={styles.garmentImg}
              />
              <View style={styles.orderBadge}>
                <AppText variant="meta" color={colors.accentInk}>
                  {i + 1}
                </AppText>
              </View>
              <View style={styles.removeTag}>
                <AppText variant="meta" color={colors.surface}>
                  Remove
                </AppText>
              </View>
            </PressableScale>
          ))}
          {garments.length < 2 && (
            <PressableScale onPress={addGarment} style={styles.garmentAdd}>
              <Icon name="add" size={26} color={colors.inkMuted} />
            </PressableScale>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label="Generate try-on"
          tone="accent"
          loading={tryon.isPending}
          disabled={!canGenerate}
          onPress={onGenerate}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  h1: { fontSize: 24, lineHeight: 28, marginBottom: spacing.sm },
  personBox: { height: 260 },
  personImg: { flex: 1, width: '100%' },
  personEmpty: {
    flex: 1,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  garmentRow: { flexDirection: 'row', gap: spacing.md },
  garmentCell: { width: 120, height: 150 },
  garmentImg: { width: 120, height: 150 },
  orderBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.accent,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeTag: {
    position: 'absolute',
    bottom: spacing.sm,
    alignSelf: 'center',
    backgroundColor: colors.scrim,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  garmentAdd: {
    width: 120,
    height: 150,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  footer: { paddingVertical: spacing.md },
});
