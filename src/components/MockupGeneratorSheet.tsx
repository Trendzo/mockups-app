import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppImage } from './AppImage';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { PrimaryButton } from './PrimaryButton';
import { SegmentedControl } from './SegmentedControl';
import { useToast } from './Toast';
import { useGenerateMockups } from '../api/hooks';
import { Mode, ModelGender, prettyView } from '../types/enums';
import { NamedImage } from '../types/api';
import { colors, radii, spacing } from '../theme/theme';

type GenKind = 'product' | 'model';

interface Props {
  /** Already-hosted apparel image the mockups are generated from. */
  apparelImageUrl: string | null;
  /** URLs already attached to the variant — shown as pre-selected/disabled. */
  existing: string[];
  onAdd: (urls: string[]) => void;
  onClose: () => void;
}

/**
 * Bottom-sheet body that turns a hosted apparel image into AI mockups and lets the
 * retailer pick which generated images to attach to a variant. Stateless endpoint —
 * every "Generate" is a fresh call; picks accumulate only in local state.
 */
export function MockupGeneratorSheet({ apparelImageUrl, existing, onAdd, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const gen = useGenerateMockups();

  const [kind, setKind] = useState<GenKind>('product');
  const [gender, setGender] = useState<ModelGender>('her');
  const [results, setResults] = useState<NamedImage[]>([]);
  const [picked, setPicked] = useState<string[]>([]);

  const toggle = (url: string) =>
    setPicked((p) => (p.includes(url) ? p.filter((u) => u !== url) : [...p, url]));

  const generate = () => {
    if (!apparelImageUrl) return;
    gen.mutate(
      {
        apparelImageUrl,
        mode: kind === 'model' ? Mode.WithModel : Mode.WithoutModel,
        ...(kind === 'model' ? { modelGender: gender } : {}),
      },
      {
        onSuccess: (images) => {
          setResults(images);
          setPicked([]);
          if (!images.length) toast.show('No mockups came back — try again', 'info');
        },
        onError: (e) => toast.show(e?.error ?? 'Generation failed', 'error'),
      },
    );
  };

  return (
    <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
      <AppText variant="cardTitle" color={colors.ink} style={styles.title}>
        Generate with AI
      </AppText>

      {!apparelImageUrl ? (
        <AppText variant="meta" color={colors.meta}>
          Add a gallery image to this product first — the mockups are generated from it.
        </AppText>
      ) : (
        <>
          <View style={styles.sourceRow}>
            <AppImage uri={apparelImageUrl} radius={radii.sm} containerStyle={styles.sourceImg} />
            <AppText variant="meta" color={colors.meta} style={styles.flex}>
              Source apparel image
            </AppText>
          </View>

          <SegmentedControl<GenKind>
            value={kind}
            onChange={setKind}
            options={[
              { value: 'product', label: 'Product only' },
              { value: 'model', label: 'On model' },
            ]}
          />
          {kind === 'model' ? (
            <SegmentedControl<ModelGender>
              value={gender}
              onChange={setGender}
              options={[
                { value: 'her', label: 'Female' },
                { value: 'him', label: 'Male' },
              ]}
            />
          ) : null}

          <PrimaryButton
            label={results.length ? 'Regenerate' : 'Generate'}
            tone="surface"
            loading={gen.isPending}
            onPress={generate}
          />

          {gen.isPending ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.ink} />
              <AppText variant="meta" color={colors.meta}>
                Generating mockups…
              </AppText>
            </View>
          ) : results.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickScroll}>
              {results.map((img, i) => {
                const already = existing.includes(img.url);
                const on = picked.includes(img.url);
                return (
                  <PressableScale
                    key={`${img.url}-${i}`}
                    onPress={() => !already && toggle(img.url)}
                    disabled={already}
                    style={styles.pickCell}
                  >
                    <AppImage uri={img.url} radius={radii.sm} containerStyle={styles.pickImg} />
                    <View style={styles.pickLabel}>
                      <AppText variant="meta" color={colors.ink} numberOfLines={1}>
                        {prettyView(img.name)}
                      </AppText>
                    </View>
                    {already || on ? (
                      <View style={[styles.pickBadge, already ? styles.pickBadgeMuted : null]}>
                        <Icon name="checkmark" size={14} color={colors.accentInk} />
                      </View>
                    ) : null}
                  </PressableScale>
                );
              })}
            </ScrollView>
          ) : null}
        </>
      )}

      <View style={styles.footerRow}>
        <PrimaryButton label="Cancel" tone="surface" style={styles.flex} onPress={onClose} />
        <PrimaryButton
          label={`Add ${picked.length || ''}`.trim()}
          tone="accent"
          style={styles.flex}
          disabled={picked.length === 0}
          onPress={() => onAdd(picked)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { marginBottom: spacing.xs },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sourceImg: { width: 44, height: 44 },
  loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  pickScroll: { marginTop: spacing.xs },
  pickCell: { marginRight: spacing.sm, width: 120 },
  pickImg: { width: 120, height: 150 },
  pickLabel: {
    position: 'absolute',
    left: spacing.xs,
    bottom: spacing.xs,
    maxWidth: '86%',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  pickBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    padding: 3,
  },
  pickBadgeMuted: { backgroundColor: colors.hairline },
  footerRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
});
