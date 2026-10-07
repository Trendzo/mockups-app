import React from 'react';
import { ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { colors, radii, spacing } from '../theme/theme';

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  /** Optional count shown inside the pill. */
  count?: number;
}

/**
 * Horizontally scrolling pill filters (order tabs, stock flags…). Bleeds to the
 * screen edges so the row can scroll under the 24pt gutter; the active pill is
 * the black accent, like SegmentedControl.
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: FilterOption<T>[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // One tap on a chip should filter even while a search keyboard is up.
      keyboardShouldPersistTaps="handled"
      style={[styles.bleed, style]}
      contentContainerStyle={styles.row}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <PressableScale
            key={o.value}
            onPress={() => onChange(o.value)}
            toScale={0.95}
            haptic={false}
            style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}
          >
            <AppText variant="bodyMedium" color={active ? colors.accentInk : colors.ink} style={styles.label}>
              {o.label}
            </AppText>
            {o.count != null && o.count > 0 ? (
              <View style={[styles.count, active ? styles.countActive : styles.countIdle]}>
                <AppText
                  variant="meta"
                  color={active ? colors.ink : colors.accentInk}
                  style={styles.countText}
                >
                  {o.count > 99 ? '99+' : o.count}
                </AppText>
              </View>
            ) : null}
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // A ScrollView defaults to flexShrink: 1, so above a long list the row got
  // squeezed and the pills were cut off at the bottom. Never let it shrink.
  bleed: { marginHorizontal: -spacing.screenH, flexGrow: 0, flexShrink: 0 },
  row: { gap: spacing.sm, paddingHorizontal: spacing.screenH },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  chipActive: { backgroundColor: colors.accent },
  chipIdle: { backgroundColor: colors.surface },
  label: { fontSize: 14, lineHeight: 18 },
  count: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countActive: { backgroundColor: colors.surface },
  countIdle: { backgroundColor: colors.accent },
  countText: { fontSize: 11, lineHeight: 14 },
});
