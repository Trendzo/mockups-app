import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, spacing } from '../theme/theme';

export type DetailTone = 'default' | 'negative' | 'positive' | 'muted';

/**
 * label ···· value line for totals, breakdowns and key facts. `strong` is the
 * bold total line; `negative` values go red (fees, deductions).
 */
export function DetailRow({
  label,
  value,
  hint,
  tone = 'default',
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: DetailTone;
  strong?: boolean;
}) {
  const valueColor =
    tone === 'negative'
      ? colors.danger
      : tone === 'positive'
        ? colors.success
        : tone === 'muted'
          ? colors.meta
          : colors.ink;
  return (
    <View style={styles.row}>
      <View style={styles.labelCol}>
        <AppText variant={strong ? 'bodyMedium' : 'body'} color={strong ? colors.ink : colors.meta}>
          {label}
        </AppText>
        {hint ? (
          <AppText variant="meta" color={colors.meta}>
            {hint}
          </AppText>
        ) : null}
      </View>
      <AppText
        variant={strong ? 'bodyMedium' : 'body'}
        color={strong ? colors.ink : valueColor}
        style={styles.value}
      >
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  labelCol: { flexShrink: 1 },
  value: { textAlign: 'right', flexShrink: 0, maxWidth: '60%' },
});
