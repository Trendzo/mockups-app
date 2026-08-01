import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Chip } from './Chip';
import { SegmentedControl } from './SegmentedControl';
import { Mode, prettyView, viewsForMode } from '../types/enums';
import { useCaptureDraft } from '../store/captureDraft';
import { colors, spacing } from '../theme/theme';

/** Product shots, or on a male / female model. */
type GenType = 'product' | 'male' | 'female';

/**
 * The "how should we shoot it?" controls — mockup type (product / male / female)
 * + limit-views chips — reading/writing the capture-draft config. Extracted so the
 * bulk-mockup screen can present the same config inline (compact) as the single
 * flow's Configure step. Self-contained; renders no headings of its own.
 */
export function ShootConfig() {
  const { mode, modelGender, only } = useCaptureDraft((s) => s.config);
  const setConfig = useCaptureDraft((s) => s.setConfig);
  const availableViews = useMemo(() => viewsForMode(mode), [mode]);

  const genType: GenType =
    mode === Mode.WithModel ? (modelGender === 'her' ? 'female' : 'male') : 'product';

  const setGenType = (t: GenType) => {
    if (t === 'product') setConfig({ mode: Mode.WithoutModel, modelGender: null, only: [] });
    else setConfig({ mode: Mode.WithModel, modelGender: t === 'male' ? 'him' : 'her', only: [] });
  };

  const toggleView = (view: string) =>
    setConfig({ only: only.includes(view) ? only.filter((v) => v !== view) : [...only, view] });

  return (
    <View style={styles.wrap}>
      <View style={styles.block}>
        <AppText variant="sectionLabel" color={colors.meta}>
          Mockup type
        </AppText>
        <SegmentedControl<GenType>
          value={genType}
          onChange={setGenType}
          options={[
            { value: 'product', label: 'Product' },
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
          ]}
        />
      </View>

      <View style={styles.block}>
        <AppText variant="sectionLabel" color={colors.meta}>
          Limit views
        </AppText>
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
        <AppText variant="meta" color={colors.meta}>
          {only.length
            ? `Generating ${only.length} view${only.length > 1 ? 's' : ''}.`
            : 'Leave empty for the default set.'}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  block: { gap: spacing.sm },
  // Explicit rowGap so wrapped chip rows have breathing room between them
  // (a single `gap` can render tight vertically on some RN versions).
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.sm,
    rowGap: spacing.sm + 2,
  },
});
