import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  AppImage,
  AppText,
  ImageViewer,
  PressableScale,
  PrimaryButton,
  Screen,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { saveRemoteImage, shareRemoteImage } from '../utils/gallery';
import { ensurePhotoAddPermission, openAppSettings } from '../utils/permissions';
import { colors, radii, spacing } from '../theme/theme';

/** Try-On result (§5.8): final result + the intermediate steps. */
export function TryOnResultScreen({
  navigation,
  route,
}: ScreenProps<'TryOnResult'>) {
  const { result } = route.params;
  const toast = useToast();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const images = useMemo(() => {
    const list = [{ url: result.result, name: 'result' }];
    result.steps.forEach((url, i) =>
      list.push({ url, name: `step-${i + 1}` }),
    );
    return list;
  }, [result]);

  const onSave = async (index: number) => {
    const perm = await ensurePhotoAddPermission();
    if (perm === 'blocked') {
      toast.show('Enable photo access in Settings', 'error');
      openAppSettings();
      return;
    }
    try {
      await saveRemoteImage(images[index].url);
      toast.show('Saved to gallery', 'success');
    } catch {
      toast.show("Couldn't save image", 'error');
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <AppText variant="sectionLabel" color={colors.meta}>
          Try-On result
        </AppText>
        <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
          The final look
        </AppText>

        <PressableScale onPress={() => setViewerIndex(0)} toScale={0.98}>
          <AppImage
            uri={result.result}
            radius={radii.card}
            containerStyle={styles.hero}
          />
        </PressableScale>

        {result.steps.length > 1 && (
          <>
            <AppText variant="sectionLabel" color={colors.meta} style={styles.stepsLabel}>
              Steps
            </AppText>
            <View style={styles.stepsRow}>
              {result.steps.map((url, i) => (
                <PressableScale
                  key={`${url}-${i}`}
                  onPress={() => setViewerIndex(i + 1)}
                  toScale={0.97}
                >
                  <AppImage
                    uri={url}
                    radius={radii.sm + 4}
                    containerStyle={styles.stepImg}
                  />
                </PressableScale>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label="Save to gallery"
          tone="accent"
          onPress={() => onSave(0)}
        />
        <PrimaryButton
          label="Share"
          tone="surface"
          onPress={() => shareRemoteImage(result.result).catch(() => {})}
        />
        <PrimaryButton
          label="Done"
          tone="ghost"
          onPress={() => navigation.popToTop()}
        />
      </View>

      <ImageViewer
        visible={viewerIndex != null}
        images={images}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
        onSave={onSave}
        onShare={(i) => shareRemoteImage(images[i].url).catch(() => {})}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  h1: { fontSize: 24, lineHeight: 28, marginBottom: spacing.sm },
  hero: { height: 380, width: '100%' },
  stepsLabel: { marginTop: spacing.md },
  stepsRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  stepImg: { width: 96, height: 128 },
  footer: { gap: spacing.sm, paddingVertical: spacing.md },
});
