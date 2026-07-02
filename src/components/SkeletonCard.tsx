import React, { useEffect } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, radii } from '../theme/theme';

interface SkeletonProps {
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Shimmering placeholder — used for every load, never a blank flash (§6). */
export function Skeleton({ height = 230, radius = radii.card, style }: SkeletonProps) {
  const progress = useSharedValue(0.4);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [progress]);

  const animStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Animated.View
      style={[
        styles.base,
        { height, borderRadius: radius },
        animStyle,
        style,
      ]}
    />
  );
}

export function SkeletonCard({ height }: { height?: number }) {
  return <Skeleton height={height} />;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.cardGray,
    width: '100%',
  },
});
