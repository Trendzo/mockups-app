import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  AppImage,
  AppText,
  Chip,
  Icon,
  PressableScale,
  PrimaryButton,
  Screen,
  SegmentedControl,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { Mode, prettyView, viewsForMode } from '../types/enums';
import { colors, radii, spacing, type as typeScale } from '../theme/theme';
import { prepareUpload } from '../utils/image';
import { LocalPhoto } from '../navigation/types';

/** Configure generation (§5.4). Skippable — sane defaults (product views, no design). */
export function ConfigureScreen({ navigation, route }: ScreenProps<'Configure'>) {
  const { apparel, apparelBack } = route.params;
  const [mode, setMode] = useState<Mode>(Mode.WithoutModel);
  const [design, setDesign] = useState<LocalPhoto | null>(null);
  const [prompt, setPrompt] = useState('');
  const [only, setOnly] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const availableViews = useMemo(() => viewsForMode(mode), [mode]);

  const toggleView = (view: string) =>
    setOnly((prev) =>
      prev.includes(view) ? prev.filter((v) => v !== view) : [...prev, view],
    );

  const onAddDesign = async () => {
    const res = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.9,
      maxWidth: 2048,
      maxHeight: 2048,
    });
    const asset = res.assets?.[0];
    if (asset?.uri) setDesign({ uri: asset.uri });
  };

  const onGenerate = async () => {
    setBusy(true);
    try {
      const apparelFile = await prepareUpload(apparel.uri);
      const apparelBackFile = apparelBack
        ? await prepareUpload(apparelBack.uri)
        : undefined;
      const designFile = design ? await prepareUpload(design.uri) : undefined;
      // `only` must match the active mode's view namespace.
      const validOnly = only.filter((v) =>
        (availableViews as readonly string[]).includes(v),
      );
      navigation.navigate('Generating', {
        apparel: apparelFile,
        apparelBack: apparelBackFile,
        design: designFile,
        mode,
        prompt: prompt.trim() || undefined,
        only: validOnly.length ? validOnly : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <AppText variant="sectionLabel" color={colors.meta}>
          Step 2 · Configure
        </AppText>
        <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
          How should we shoot it?
        </AppText>

        {/* Apparel preview */}
        <View style={styles.previewRow}>
          <AppImage
            uri={apparel.uri}
            radius={radii.sm + 4}
            containerStyle={styles.apparelThumb}
          />
          {apparelBack ? (
            <AppImage
              uri={apparelBack.uri}
              radius={radii.sm + 4}
              containerStyle={styles.apparelThumb}
            />
          ) : null}
          <View style={styles.previewText}>
            <AppText variant="bodyMedium" color={colors.ink}>
              {apparelBack ? 'Front + back ready' : 'Apparel ready'}
            </AppText>
            <AppText variant="meta" color={colors.meta}>
              We'll generate {mode === Mode.WithModel ? 'on-model' : 'product'} views.
            </AppText>
          </View>
        </View>

        {/* Mode */}
        <Section label="Mode">
          <SegmentedControl<Mode>
            value={mode}
            onChange={(v) => {
              setMode(v);
              setOnly([]);
            }}
            options={[
              { value: Mode.WithoutModel, label: 'Product views' },
              { value: Mode.WithModel, label: 'On-model' },
            ]}
          />
        </Section>

        {/* Add design */}
        <Section label="Add design (optional)">
          <PressableScale onPress={onAddDesign} style={styles.designBox}>
            {design ? (
              <AppImage
                uri={design.uri}
                radius={radii.sm}
                containerStyle={styles.designThumb}
              />
            ) : (
              <View style={styles.designThumbEmpty}>
                <Icon name="add" size={24} color={colors.inkMuted} />
              </View>
            )}
            <View style={styles.flex}>
              <AppText variant="bodyMedium" color={colors.ink}>
                {design ? 'Design added' : 'Print a graphic'}
              </AppText>
              <AppText variant="meta" color={colors.meta}>
                {design ? 'Tap to replace' : 'A logo or artwork to print first'}
              </AppText>
            </View>
            {design && (
              <PressableScale onPress={() => setDesign(null)} style={styles.clearBtn}>
                <AppText variant="meta" color={colors.danger}>
                  Remove
                </AppText>
              </PressableScale>
            )}
          </PressableScale>
        </Section>

        {/* Prompt */}
        <Section label="Prompt (optional)">
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder="e.g. minimal studio, soft light, neutral background"
            placeholderTextColor={colors.inkMuted}
            multiline
            style={styles.promptInput}
          />
        </Section>

        {/* Only views */}
        <Section label="Limit views (optional)">
          <View style={styles.chips}>
            {availableViews.map((view) => (
              <Chip
                key={view}
                label={prettyView(view)}
                selected={only.includes(view)}
                onPress={() => toggleView(view)}
              />
            ))}
          </View>
          <AppText variant="meta" color={colors.meta} style={styles.hint}>
            {only.length
              ? `Generating ${only.length} view${only.length > 1 ? 's' : ''}.`
              : 'Leave empty to generate the default set.'}
          </AppText>
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label="Generate"
          tone="accent"
          loading={busy}
          onPress={onGenerate}
        />
      </View>
    </Screen>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <AppText variant="sectionLabel" color={colors.meta}>
        {label}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  h1: { fontSize: 22, lineHeight: 26, marginBottom: spacing.xs },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  apparelThumb: { width: 56, height: 56 },
  previewText: { flex: 1, gap: 2 },
  section: { gap: spacing.sm },
  designBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  designThumb: { width: 48, height: 48 },
  designThumbEmpty: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  clearBtn: { padding: spacing.xs },
  promptInput: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    minHeight: 88,
    textAlignVertical: 'top',
    color: colors.ink,
    fontFamily: typeScale.body.fontFamily,
    fontSize: typeScale.body.fontSize,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hint: { marginTop: spacing.xs },
  footer: { paddingVertical: spacing.md },
});
