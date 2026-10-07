import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { Icon, IconSet } from './Icon';
import { PrimaryButton } from './PrimaryButton';
import { colors, spacing } from '../theme/theme';

/** Centered "nothing here yet" block for lists and sections. */
export function EmptyState({
  icon = 'file-tray-outline',
  set,
  title,
  message,
  actionLabel,
  onAction,
  style,
}: {
  icon?: string;
  set?: IconSet;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.badge}>
        <Icon name={icon} set={set} size={26} color={colors.meta} />
      </View>
      <AppText variant="bodyMedium" color={colors.ink} style={styles.center}>
        {title}
      </AppText>
      {message ? (
        <AppText variant="meta" color={colors.meta} style={styles.center}>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <PrimaryButton
          label={actionLabel}
          tone="accent"
          fullWidth={false}
          onPress={onAction}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  center: { textAlign: 'center' },
  action: { marginTop: spacing.md, paddingHorizontal: spacing.lg },
});
