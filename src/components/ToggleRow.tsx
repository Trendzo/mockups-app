import React from 'react';
import { StyleProp, StyleSheet, Switch, View, ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { colors, spacing } from '../theme/theme';

/**
 * Label + hint + switch. The Switch is display-only (`pointerEvents="none"`)
 * and the row's press is the single source of toggles — the same fix as the
 * Home store card, where letting the Switch fire too toggled twice per tap.
 */
export function ToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled,
  style,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      onPress={() => onChange(!value)}
      disabled={disabled}
      toScale={0.99}
      haptic={false}
      style={[styles.row, style]}
    >
      <View style={styles.flex}>
        <AppText variant="bodyMedium" color={colors.ink}>
          {label}
        </AppText>
        {hint ? (
          <AppText variant="meta" color={colors.meta}>
            {hint}
          </AppText>
        ) : null}
      </View>
      <View pointerEvents="none">
        <Switch
          value={value}
          trackColor={{ false: colors.cardGray, true: colors.success }}
          thumbColor={colors.surface}
          ios_backgroundColor={colors.cardGray}
        />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  flex: { flex: 1 },
});
