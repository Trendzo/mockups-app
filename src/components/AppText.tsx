import React from 'react';
import { StyleProp, Text, TextProps, TextStyle } from 'react-native';
import { colors, type as typeScale } from '../theme/theme';

type Variant = keyof typeof typeScale;

interface AppTextProps extends TextProps {
  variant?: Variant;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
}

/** Typed text primitive - every text style flows through the §2.2 scale. */
export function AppText({
  variant = 'body',
  color = colors.ink,
  style,
  children,
  ...rest
}: AppTextProps) {
  return (
    <Text
      allowFontScaling
      {...rest}
      style={[typeScale[variant], { color }, style]}
    >
      {children}
    </Text>
  );
}
