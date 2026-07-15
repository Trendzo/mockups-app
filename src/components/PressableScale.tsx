import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Haptics } from '../utils/haptics';

interface PressableScaleProps extends PressableProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  toScale?: number;
  haptic?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Press-in scale (0.97) + spring on release — applied to all cards/buttons (§6).
 * Uses React Native's own Animated (not reanimated) for the press feedback: the
 * reanimated-wrapped Pressable can drop the first tap on the New Architecture,
 * which made buttons feel like they needed multiple presses. A generous hitSlop
 * + pressRetentionOffset also make small buttons far easier to hit.
 */
export function PressableScale({
  children,
  style,
  toScale = 0.97,
  haptic = true,
  hitSlop = 8,
  pressRetentionOffset = 24,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  ...rest
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const springTo = (toValue: number) =>
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      stiffness: 220,
      damping: 18,
      mass: 0.7,
    }).start();

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      hitSlop={hitSlop}
      pressRetentionOffset={pressRetentionOffset}
      onPressIn={(e) => {
        springTo(toScale);
        if (haptic) Haptics.tap();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        springTo(1);
        onPressOut?.(e);
      }}
      onPress={onPress}
      style={[
        { transform: [{ scale }] } as StyleProp<ViewStyle>,
        style,
        disabled ? styles.disabled : null,
      ]}
    >
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.5 },
});
