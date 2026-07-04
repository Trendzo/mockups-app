import React from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { colors } from '../theme/theme';

interface BackButtonProps {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Circular top-left back button (Android has no swipe-back gesture). */
export function BackButton({ onPress, style }: BackButtonProps) {
  return (
    <PressableScale onPress={onPress} toScale={0.9} style={[styles.btn, style]}>
      <Icon name="chevron-back" size={22} color={colors.ink} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
