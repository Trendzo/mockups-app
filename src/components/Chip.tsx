import React from 'react';
import { StyleSheet } from 'react-native';
import { PressableScale } from './PressableScale';
import { AppText } from './AppText';
import { colors, radii, spacing } from '../theme/theme';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}

/** Selectable pill — used for view limits, occasion/age tags (§5.4/§5.7). */
export function Chip({ label, selected = false, onPress }: ChipProps) {
  return (
    <PressableScale
      onPress={onPress}
      toScale={0.94}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: colors.accent, borderColor: colors.accent }
          : { backgroundColor: 'transparent', borderColor: colors.hairline },
      ]}
    >
      <AppText
        variant="meta"
        color={selected ? colors.accentInk : colors.meta}
        style={styles.label}
      >
        {label}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radii.pill,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  label: { fontSize: 13 },
});
