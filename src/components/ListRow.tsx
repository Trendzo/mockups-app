import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { Icon, IconSet } from './Icon';
import { PressableScale } from './PressableScale';
import { colors, radii, spacing } from '../theme/theme';

const WARNING = '#B8860B';

interface ListRowProps {
  label: string;
  hint?: string;
  icon?: string;
  iconSet?: IconSet;
  /** warning/danger tint the icon + hint (danger also tints the label). */
  tone?: 'warning' | 'danger';
  /** Replaces the chevron (e.g. a chip, count or switch). */
  right?: React.ReactNode;
  /** Count bubble before the chevron. */
  badge?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** White settings/menu row: icon · label + hint · chevron. Same look as Profile's actions. */
export function ListRow({
  label,
  hint,
  icon,
  iconSet,
  tone,
  right,
  badge,
  onPress,
  style,
}: ListRowProps) {
  const tint = tone === 'danger' ? colors.danger : tone === 'warning' ? WARNING : undefined;
  const body = (
    <>
      {icon ? <Icon name={icon} set={iconSet} size={20} color={tint ?? colors.ink} /> : null}
      <View style={styles.flex}>
        <AppText variant="bodyMedium" color={tone === 'danger' ? colors.danger : colors.ink}>
          {label}
        </AppText>
        {hint ? (
          <AppText variant="meta" color={tint ?? colors.meta}>
            {hint}
          </AppText>
        ) : null}
      </View>
      {badge != null && badge > 0 ? (
        <View style={styles.badge}>
          <AppText variant="meta" color={colors.accentInk} style={styles.badgeText}>
            {badge > 99 ? '99+' : badge}
          </AppText>
        </View>
      ) : null}
      {right ?? (onPress ? <Icon name="chevron-forward" size={18} color={colors.meta} /> : null)}
    </>
  );
  if (!onPress) return <View style={[styles.row, style]}>{body}</View>;
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={[styles.row, style]}>
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  flex: { flex: 1 },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, lineHeight: 14 },
});
