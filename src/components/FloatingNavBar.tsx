import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Icon, IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { colors, spacing, type as typeScale } from '../theme/theme';

interface NavItem {
  label?: string;
  icon?: IconName; // render an icon instead of / before the label
  counter?: number; // superscript counter
  onPress?: () => void;
  muted?: boolean;
}

interface FloatingNavBarProps {
  onBack?: () => void;
  left?: NavItem;
  right?: NavItem;
  /** Center bold label + superscript counter. */
  center?: NavItem;
}

/** Chevron + centered bold label + superscript counters, floating above safe area (§2.3). */
export function FloatingNavBar({
  onBack,
  left,
  right,
  center,
}: FloatingNavBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 12 }]}
    >
      <View style={styles.bar}>
        {onBack ? (
          <PressableScale onPress={onBack} style={styles.chevron} haptic>
            <Icon name="chevron-back" size={24} color={colors.ink} />
          </PressableScale>
        ) : left ? (
          <NavLabel item={left} />
        ) : (
          <View style={styles.side} />
        )}

        {center ? (
          <PressableScale onPress={center.onPress} haptic={!!center.onPress}>
            <NavLabel item={center} bold />
          </PressableScale>
        ) : (
          <View />
        )}

        {right ? <NavLabel item={right} /> : <View style={styles.side} />}
      </View>
    </View>
  );
}

function NavLabel({ item, bold }: { item: NavItem; bold?: boolean }) {
  const tint = item.muted ? colors.inkMuted : colors.ink;
  return (
    <PressableScale
      onPress={item.onPress}
      haptic={!!item.onPress}
      style={styles.labelRow}
    >
      {item.icon ? (
        <Icon
          name={item.icon}
          size={22}
          color={tint}
          style={item.label ? styles.iconSpacing : undefined}
        />
      ) : null}
      {item.label ? (
        <AppText variant={bold ? 'navLabel' : 'meta'} color={tint}>
          {item.label}
        </AppText>
      ) : null}
      {item.counter != null && (
        <AppText variant="navCounter" color={tint} style={styles.counter}>
          {item.counter}
        </AppText>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 2,
    minWidth: '82%',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  chevron: {
    width: 28,
    alignItems: 'flex-start',
  },
  side: { width: 40 },
  labelRow: { flexDirection: 'row', alignItems: 'center' },
  iconSpacing: { marginRight: 6 },
  counter: {
    marginLeft: 2,
    marginTop: -2,
    lineHeight: typeScale.navCounter.lineHeight,
  },
});
