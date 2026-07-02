import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { colors, type as typeScale } from '../theme/theme';

export interface HeadlineLine {
  text: string;
  muted?: boolean; // render in --ink-muted instead of --ink
}

interface HeroHeadlineProps {
  lines: HeadlineLine[];
  style?: StyleProp<ViewStyle>;
  /** Optional size override for tighter screens. */
  fontSize?: number;
  align?: 'left' | 'center';
}

/**
 * The signature stacked editorial headline (§2.4). Lines sit tight with no gap;
 * some ink, some muted — e.g. "Exploring / Minds / Inspiring / Change".
 */
export function HeroHeadline({
  lines,
  style,
  fontSize,
  align = 'left',
}: HeroHeadlineProps) {
  // Keep lineHeight >= fontSize so glyphs are never vertically clipped in RN.
  const sizeOverride = fontSize
    ? { fontSize, lineHeight: Math.round(fontSize * 1.06) }
    : null;
  const alignStyle = { textAlign: align } as const;
  return (
    <View style={[align === 'center' ? styles.center : styles.wrap, style]}>
      {lines.map((line, i) => (
        <AppText
          key={`${line.text}-${i}`}
          variant="display"
          color={line.muted ? colors.inkMuted : colors.ink}
          style={[typeScale.display, sizeOverride, alignStyle]}
        >
          {line.text}
        </AppText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  center: { alignSelf: 'stretch', alignItems: 'center' },
});
