import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import {
  AppImage,
  AppText,
  BackButton,
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
import { useCaptureDraft } from '../store/captureDraft';

/** Product shots, or on a male / female model. */
type GenType = 'product' | 'male' | 'female';

/** Configure generation (§5.4). Reads garment photos + config from the capture
 *  draft, so "Adjust & regenerate" can return here with everything preserved. */
export function ConfigureScreen({ navigation }: ScreenProps<'Configure'>) {
  const draft = useCaptureDraft();
  const apparel = draft.front;
  const apparelBack = draft.back;
  const closeupCount = [draft.pattern, draft.logo, draft.tag].filter(Boolean).length;
  const { mode, modelGender, design, prompt, only } = draft.config;
  const setConfig = draft.setConfig;
  const [busy, setBusy] = useState(false);

  const availableViews = useMemo(() => viewsForMode(mode), [mode]);

  // Single control drives both mode and model gender.
  const genType: GenType =
    mode === Mode.WithModel
      ? modelGender === 'her'
        ? 'female'
        : 'male'
      : 'product';
  const setGenType = (t: GenType) => {
    // Changing mode also clears `only`, since the view namespaces differ.
    if (t === 'product') {
      setConfig({ mode: Mode.WithoutModel, modelGender: null, only: [] });
    } else {
      setConfig({
        mode: Mode.WithModel,
        modelGender: t === 'male' ? 'him' : 'her',
        only: [],
      });
    }
  };

  const toggleView = (view: string) =>
    setConfig({
      only: only.includes(view)
        ? only.filter((v) => v !== view)
        : [...only, view],
    });

  const onAddDesign = async () => {
    const res = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.9,
      maxWidth: 2048,
      maxHeight: 2048,
    });
    const asset = res.assets?.[0];
    if (asset?.uri) setConfig({ design: { uri: asset.uri } });
  };

  const onGenerate = async () => {
    if (!apparel) return;
    setBusy(true);
    try {
      const apparelFile = await prepareUpload(apparel.uri);
      const apparelBackFile = apparelBack
        ? await prepareUpload(apparelBack.uri)
        : undefined;
      const designFile = design ? await prepareUpload(design.uri) : undefined;
      const patternFile = draft.pattern
        ? await prepareUpload(draft.pattern.uri)
        : undefined;
      const logoFile = draft.logo ? await prepareUpload(draft.logo.uri) : undefined;
      const tagFile = draft.tag ? await prepareUpload(draft.tag.uri) : undefined;
      // `only` must match the active mode's view namespace.
      const validOnly = only.filter((v) =>
        (availableViews as readonly string[]).includes(v),
      );
      navigation.navigate('Generating', {
        apparel: apparelFile,
        apparelBack: apparelBackFile,
        design: designFile,
        pattern: patternFile,
        logo: logoFile,
        tag: tagFile,
        // modelGender only for on-model generation.
        modelGender:
          mode === Mode.WithModel ? modelGender ?? undefined : undefined,
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
        <BackButton onPress={() => navigation.goBack()} />
        <AppText variant="sectionLabel" color={colors.meta}>
          Step 2 · Configure
        </AppText>
        <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
          How should we shoot it?
        </AppText>

        {/* Apparel preview */}
        <View style={styles.previewRow}>
          <AppImage
            uri={apparel?.uri}
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
              {apparelBack ? 'Front + back ready' : 'Front ready'}
            </AppText>
            <AppText variant="meta" color={colors.meta}>
              {closeupCount > 0
                ? `${closeupCount} close-up${closeupCount > 1 ? 's' : ''} · `
                : ''}
              {mode === Mode.WithModel ? 'on-model' : 'product'} views
            </AppText>
          </View>
        </View>

        {/* Mockup type: product shots, or on a male / female model */}
        <Section label="Mockup type">
          <SegmentedControl<GenType>
            value={genType}
            onChange={setGenType}
            options={[
              { value: 'product', label: 'Product' },
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
            ]}
          />
          <AppText variant="meta" color={colors.meta} style={styles.hint}>
            {genType === 'product'
              ? 'Clean product shots on a white background.'
              : `On-model shots with a ${genType} model.`}
          </AppText>
        </Section>

        {/* Add design */}
        <Section label="Add design">
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
              <PressableScale onPress={() => setConfig({ design: null })} style={styles.clearBtn}>
                <AppText variant="meta" color={colors.danger}>
                  Remove
                </AppText>
              </PressableScale>
            )}
          </PressableScale>
        </Section>

        {/* Prompt */}
        <Section label="Prompt">
          <TextInput
            value={prompt}
            onChangeText={(text) => setConfig({ prompt: text })}
            placeholder="e.g. minimal studio, soft light, neutral background"
            placeholderTextColor={colors.inkMuted}
            multiline
            style={styles.promptInput}
          />
        </Section>

        {/* Only views */}
        <Section label="Limit views">
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
