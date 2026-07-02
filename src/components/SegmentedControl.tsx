import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from './PressableScale';
import { AppText } from './AppText';
import { colors, radii, spacing } from '../theme/theme';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Two/three-way selector (e.g. Product views vs On-model). Yellow marks active. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <View style={styles.track}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <PressableScale
            key={opt.value}
            onPress={() => onChange(opt.value)}
            toScale={0.97}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <AppText
              variant="bodyMedium"
              color={active ? colors.accentInk : colors.meta}
            >
              {opt.label}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md - 2,
    borderRadius: radii.pill,
  },
  segmentActive: {
    backgroundColor: colors.accent,
  },
});
