import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { Icon, IconSet } from './Icon';
import { PressableScale } from './PressableScale';
import { colors } from '../theme/theme';

interface IconButtonProps {
  icon: string;
  set?: IconSet;
  onPress?: () => void;
  /** Count bubble (hidden at 0). Takes precedence over `dot`. */
  badge?: number;
  /** Small accent dot (e.g. "filters active"). */
  dot?: boolean;
  /** Dark fill for the primary action in a header. */
  tone?: 'surface' | 'ink';
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Circular 44pt header action (filters, bell, history…) with an optional badge. */
export function IconButton({
  icon,
  set,
  onPress,
  badge,
  dot,
  tone = 'surface',
  size = 44,
  disabled,
  style,
}: IconButtonProps) {
  const dark = tone === 'ink';
  const showBadge = badge != null && badge > 0;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      toScale={0.9}
      style={[
        styles.btn,
        { width: size, height: size, borderRadius: size / 2 },
        { backgroundColor: dark ? colors.accent : colors.surface },
        style,
      ]}
    >
      <Icon name={icon} set={set} size={Math.round(size / 2)} color={dark ? colors.accentInk : colors.ink} />
      {showBadge ? (
        <View style={styles.badge}>
          <AppText variant="navCounter" color={colors.accentInk} style={styles.badgeText}>
            {badge > 99 ? '99+' : badge}
          </AppText>
        </View>
      ) : dot ? (
        <View style={styles.dot} />
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.canvas,
  },
  badgeText: { fontSize: 9, lineHeight: 11 },
  dot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
});
