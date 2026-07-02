import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { spring } from '../theme/theme';
import { Haptics } from '../utils/haptics';

interface PressableScaleProps extends PressableProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  toScale?: number;
  haptic?: boolean;
}

/** Press-in scale (0.97) + spring on release — applied to all cards/buttons (§6). */
export function PressableScale({
  children,
  style,
  toScale = 0.97,
  haptic = true,
  onPressIn,
  onPress,
  disabled,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        scale.value = withSpring(toScale, spring);
        if (haptic) Haptics.tap();
        onPressIn?.(e);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, spring);
      }}
      onPress={onPress}
      style={[animStyle, style, disabled && { opacity: 0.5 }]}
    >
      {children}
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
