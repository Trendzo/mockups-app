import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { StatusTone } from './StatusChip';
import { colors, radii, spacing } from '../theme/theme';

const TONE: Record<StatusTone, { bg: string; fg: string; icon: string }> = {
  neutral: { bg: colors.surface, fg: colors.ink, icon: 'information-circle' },
  pending: { bg: colors.surface, fg: colors.ink, icon: 'time' },
  success: { bg: 'rgba(48,163,108,0.12)', fg: colors.success, icon: 'checkmark-circle' },
  danger: { bg: 'rgba(229,72,77,0.10)', fg: colors.danger, icon: 'alert-circle' },
  warning: { bg: 'rgba(200,140,0,0.12)', fg: '#B8860B', icon: 'warning' },
};

/** Inline status banner (onboarding gate, KYC reminder, store status). */
export function Banner({
  title,
  message,
  tone = 'neutral',
  actionLabel,
  onAction,
  style,
}: {
  title: string;
  message?: string;
  tone?: StatusTone;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const t = TONE[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }, style]}>
      <Icon name={t.icon} size={22} color={t.fg} style={styles.icon} />
      <View style={styles.body}>
        <AppText variant="bodyMedium" color={colors.ink}>
          {title}
        </AppText>
        {message ? (
          <AppText variant="meta" color={colors.meta} style={styles.msg}>
            {message}
          </AppText>
        ) : null}
        {actionLabel && onAction ? (
          <PressableScale onPress={onAction} style={styles.action} toScale={0.97}>
            <AppText variant="bodyMedium" color={t.fg}>
              {actionLabel} →
            </AppText>
          </PressableScale>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: spacing.md,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  icon: { marginTop: 1 },
  body: { flex: 1, gap: 2 },
  msg: { marginTop: 2 },
  action: { marginTop: spacing.sm, alignSelf: 'flex-start' },
});
