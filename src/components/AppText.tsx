import React from 'react';
import { Platform, StyleProp, StyleSheet, Text, TextProps, TextStyle } from 'react-native';
import { colors, type as typeScale } from '../theme/theme';

type Variant = keyof typeof typeScale;

interface AppTextProps extends TextProps {
  variant?: Variant;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
}

/**
 * Inter's line box is 1.21 x fontSize (hhea/OS2-typo ascent 1984 + descent 494
 * over a 2048 upm, lineGap 0, USE_TYPO_METRICS set); its descenders reach
 * 0.241em below the baseline.
 *
 * Android needs that much room or it cuts them off: RN's CustomLineHeightSpan
 * computes `leading = lineHeight - (ascent + descent)` and, when that goes
 * negative, shrinks the descent to fit - clipping the tails of y/g/p/j and
 * capping the view height via `bottom = descent`. iOS has no such clamp: the
 * glyph simply overflows its line box and still paints, which is why a
 * too-tight lineHeight looks fine there and only breaks here.
 */
const ANDROID_MIN_LINE_RATIO = 1.21;

/**
 * Raise a too-tight lineHeight to Inter's minimum - Android only, and only
 * upwards, so designed values that already have room are left exactly as they
 * are (and iOS is untouched). Returns null when nothing needs fixing.
 */
function androidLineHeightFix(style: StyleProp<TextStyle>): TextStyle | null {
  if (Platform.OS !== 'android') return null;
  const { fontSize, lineHeight } = StyleSheet.flatten(style) ?? {};
  if (typeof fontSize !== 'number' || typeof lineHeight !== 'number') return null;
  const min = Math.ceil(fontSize * ANDROID_MIN_LINE_RATIO);
  return lineHeight < min ? { lineHeight: min } : null;
}

/** Typed text primitive - every text style flows through the §2.2 scale. */
export function AppText({
  variant = 'body',
  color = colors.ink,
  style,
  children,
  ...rest
}: AppTextProps) {
  // Applied last so it wins over both the variant and any caller override
  // (e.g. HeroHeadline's per-instance fontSize/lineHeight).
  const lineFix = React.useMemo(
    () => androidLineHeightFix([typeScale[variant], style]),
    [variant, style],
  );
  return (
    <Text
      allowFontScaling
      {...rest}
      style={[typeScale[variant], { color }, style, lineFix]}
    >
      {children}
    </Text>
  );
}
