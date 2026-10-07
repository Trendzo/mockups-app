import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { colors, radii, spacing } from '../theme/theme';

/** Section heading row: uppercase label + optional "View all"-style link. */
export function SectionHeader({
  label,
  actionLabel,
  onAction,
  style,
}: {
  label: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.head, style]}>
      <AppText variant="sectionLabel" color={colors.meta} style={styles.flex} numberOfLines={1}>
        {label}
      </AppText>
      {actionLabel && onAction ? (
        <PressableScale onPress={onAction} haptic={false}>
          <AppText variant="meta" color={colors.ink}>
            {actionLabel}
          </AppText>
        </PressableScale>
      ) : null}
    </View>
  );
}

/** White rounded block (the app's standard 18pt card) with an optional heading. */
export function Panel({
  title,
  actionLabel,
  onAction,
  children,
  style,
}: {
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.panel, style]}>
      {title ? <SectionHeader label={title} actionLabel={actionLabel} onAction={onAction} /> : null}
      {children}
    </View>
  );
}

/** Hairline divider for use inside a Panel. */
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  flex: { flex: 1 },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  divider: { height: 1, backgroundColor: colors.hairline, marginVertical: spacing.xs },
});
