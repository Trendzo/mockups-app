import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, radii, spacing } from '../theme/theme';

export type StatusTone = 'neutral' | 'pending' | 'success' | 'danger' | 'warning';

const TONE: Record<StatusTone, { bg: string; fg: string }> = {
  neutral: { bg: 'rgba(10,10,10,0.06)', fg: colors.meta },
  pending: { bg: 'rgba(10,10,10,0.06)', fg: colors.ink },
  success: { bg: 'rgba(48,163,108,0.14)', fg: colors.success },
  danger: { bg: 'rgba(229,72,77,0.12)', fg: colors.danger },
  warning: { bg: 'rgba(200,140,0,0.14)', fg: '#B8860B' },
};

/** Small status pill (doc/application/kyc statuses). */
export function StatusChip({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: StatusTone;
}) {
  const t = TONE[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
      <AppText variant="meta" color={t.fg} style={styles.label}>
        {label}
      </AppText>
    </View>
  );
}

/** Map common status strings to a tone. */
export function toneForStatus(status?: string): StatusTone {
  switch (status) {
    case 'verified':
    case 'approved':
    case 'active':
      return 'success';
    case 'rejected':
    case 'terminated':
    case 'suspended':
      return 'danger';
    case 'overdue':
    case 'paused':
    case 'docs_requested':
      return 'warning';
    case 'missing':
      return 'neutral';
    default:
      return 'pending';
  }
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  label: { fontSize: 11, textTransform: 'capitalize' },
});
