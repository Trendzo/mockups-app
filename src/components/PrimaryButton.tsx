import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { PressableScale } from './PressableScale';
import { AppText } from './AppText';
import { colors, radii, spacing } from '../theme/theme';

export type ButtonTone = 'accent' | 'ink' | 'danger' | 'ghost' | 'surface';

interface PrimaryButtonProps {
  label: string;
  onPress?: () => void;
  tone?: ButtonTone;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}

const bg: Record<ButtonTone, string> = {
  accent: colors.accent,
  ink: colors.ink,
  danger: colors.danger,
  ghost: 'transparent',
  surface: colors.surface,
};
const fg: Record<ButtonTone, string> = {
  accent: colors.accentInk,
  ink: colors.surface,
  danger: colors.surface,
  ghost: colors.ink,
  surface: colors.ink,
};

/** Pill CTA. Yellow accent used sparingly for the primary action (§2.1). */
export function PrimaryButton({
  label,
  onPress,
  tone = 'accent',
  loading = false,
  disabled = false,
  icon,
  style,
  fullWidth = true,
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      haptic
      style={[
        styles.btn,
        { backgroundColor: bg[tone] },
        tone === 'ghost' && styles.ghostBorder,
        fullWidth && { alignSelf: 'stretch' },
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={fg[tone]} />
        ) : (
          <>
            {icon}
            {/* A button is a fixed-height control, so its label must never wrap
                - two lines double the height. Side-by-side buttons on a 360dp
                screen leave only ~115dp of text room, which "Save changes" was
                overflowing. */}
            <AppText variant="button" color={fg[tone]} numberOfLines={1}>
              {label}
            </AppText>
          </>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    // md, not lg: a pill already reads as roomy, and the extra 16dp of text
    // room is what keeps two-word labels on one line in a half-width button.
    paddingHorizontal: spacing.md,
  },
  ghostBorder: {
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
