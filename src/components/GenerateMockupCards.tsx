import React, { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { useToast } from './Toast';
import { createMockupsFromUrl } from '../api/mockups';
import { Mode, ModelGender } from '../types/enums';
import { colors, radii, spacing } from '../theme/theme';

type GenKind = 'product' | 'model';

// Same look as the Configure screen's example cards: sample image + accent tag.
const SAMPLE = {
  product: require('../../assets/examples/product-1.jpg'),
  him: require('../../assets/examples/male-1.jpg'),
  her: require('../../assets/examples/female-1.jpg'),
};

/**
 * Two mockup-style cards ("Product" / "On-model") that generate AI images from
 * an already-hosted apparel photo. Renders like the Configure screen examples;
 * tapping a card runs generation and hands the resulting URLs to the caller.
 */
export function GenerateMockupCards({
  apparelUrl,
  modelGender,
  onGenerated,
}: {
  /** Source photo (hosted URL). Cards are disabled while missing. */
  apparelUrl?: string;
  modelGender: ModelGender;
  onGenerated: (urls: string[]) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<GenKind | null>(null);

  const generate = async (kind: GenKind) => {
    if (!apparelUrl || busy) return;
    setBusy(kind);
    try {
      const images = await createMockupsFromUrl(
        apparelUrl,
        kind === 'model' ? Mode.WithModel : Mode.WithoutModel,
        kind === 'model' ? modelGender : undefined,
      );
      if (!images.length) throw new Error('No images returned');
      onGenerated(images.map((i) => i.url));
      toast.show(`${images.length} image${images.length > 1 ? 's' : ''} generated`, 'success');
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not generate images', 'error');
    } finally {
      setBusy(null);
    }
  };

  const card = (kind: GenKind, img: number, label: string) => (
    <PressableScale
      toScale={0.98}
      onPress={() => generate(kind)}
      style={[styles.card, !apparelUrl && styles.cardDisabled]}
    >
      <Image source={img} style={styles.img} resizeMode="cover" />
      {busy === kind ? (
        <View style={styles.busyOverlay}>
          <ActivityIndicator color={colors.canvas} />
        </View>
      ) : null}
      <View style={styles.tag}>
        <AppText variant="meta" color={colors.accentInk}>
          {label}
        </AppText>
      </View>
    </PressableScale>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {card('product', SAMPLE.product, 'Product')}
        {card('model', SAMPLE[modelGender], modelGender === 'him' ? 'Male model' : 'Female model')}
      </View>
      <AppText variant="meta" color={colors.meta}>
        {apparelUrl
          ? 'Tap a card to generate images with AI.'
          : 'Add a product photo first to generate images.'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  card: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: radii.card,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  cardDisabled: { opacity: 0.5 },
  img: { width: '100%', height: '100%' },
  busyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: {
    position: 'absolute',
    left: spacing.xs,
    bottom: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
});
