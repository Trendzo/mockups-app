import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { colors, radii, spacing } from '../theme/theme';

/** Compact − n + stepper (cart quantities, capacity). */
export function QtyStepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  compact,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  compact?: boolean;
}) {
  const size = compact ? 30 : 36;
  const btn = [styles.btn, { width: size, height: size, borderRadius: size / 2 }];
  return (
    <View style={styles.row}>
      <PressableScale
        onPress={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        toScale={0.88}
        style={btn}
      >
        <Icon name="remove" size={compact ? 16 : 18} color={colors.ink} />
      </PressableScale>
      <AppText variant="bodyMedium" color={colors.ink} style={[styles.value, { minWidth: size }]}>
        {value}
      </AppText>
      <PressableScale
        onPress={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        toScale={0.88}
        style={btn}
      >
        <Icon name="add" size={compact ? 16 : 18} color={colors.ink} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  btn: {
    backgroundColor: colors.canvas,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { textAlign: 'center' },
});
