import React, { useEffect, useState } from 'react';
import { StyleProp, TextStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AppText } from './AppText';
import { colors } from '../theme/theme';

interface StatusTickerProps {
  messages: string[];
  intervalMs?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

/** Cycles status copy with a fade/slide every ~1.8s (§5.5). */
export function StatusTicker({
  messages,
  intervalMs = 1800,
  color = colors.ink,
  style,
}: StatusTickerProps) {
  const [index, setIndex] = useState(0);
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (messages.length <= 1) return;
    const id = setInterval(() => {
      opacity.value = withTiming(0, { duration: 220 });
      translateY.value = withTiming(-8, { duration: 220 });
      setTimeout(() => {
        setIndex((i) => (i + 1) % messages.length);
        translateY.value = 8;
        opacity.value = withTiming(1, { duration: 260 });
        translateY.value = withTiming(0, { duration: 260 });
      }, 240);
    }, intervalMs);
    return () => clearInterval(id);
  }, [messages.length, intervalMs, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <AppText variant="bodyMedium" color={color} style={style}>
        {messages[index]}
      </AppText>
    </Animated.View>
  );
}
