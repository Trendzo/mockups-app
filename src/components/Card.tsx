import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { PressableScale } from './PressableScale';
import { AppText } from './AppText';
import { colors, radii, spacing } from '../theme/theme';

export type CardTone = 'gray' | 'yellow' | 'surface';

interface CardProps {
  /** Two-line title: line 1 ink, line 2 muted (§2.4). */
  titleTop: string;
  titleBottom?: string;
  meta?: string;
  tone?: CardTone;
  onPress?: () => void;
  /** Centered graphic/thumbnail area. */
  graphic?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  height?: number;
}

const toneBg: Record<CardTone, string> = {
  gray: colors.cardGray,
  yellow: colors.accent, // now black — the primary/dark card
  surface: colors.surface,
};

/**
 * Signature card (§2.4): bold 2-line title top-left → centered graphic →
 * tiny meta bottom-left. Rounded 18, press-scale via PressableScale.
 */
export function Card({
  titleTop,
  titleBottom,
  meta,
  tone = 'gray',
  onPress,
  graphic,
  style,
  height = 230,
}: CardProps) {
  const onDark = tone === 'yellow';
  const titleColor = onDark ? colors.surface : colors.ink;
  const bottomColor = onDark ? colors.onDarkMuted : colors.inkMuted;
  const metaColor = onDark ? colors.onDarkMuted : colors.meta;

  return (
    <PressableScale
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: toneBg[tone], height },
        style,
      ]}
    >
      {/* Graphic sits at the true center of the card, behind the text. */}
      {graphic ? (
        <View pointerEvents="none" style={styles.graphic}>
          {graphic}
        </View>
      ) : null}

      <View style={styles.titleBlock}>
        <AppText variant="cardTitle" color={titleColor} numberOfLines={1}>
          {titleTop}
        </AppText>
        {titleBottom ? (
          <AppText variant="cardTitle" color={bottomColor} numberOfLines={1}>
            {titleBottom}
          </AppText>
        ) : null}
      </View>

      {meta ? (
        <AppText variant="meta" color={metaColor} numberOfLines={1}>
          {meta}
        </AppText>
      ) : (
        <View style={styles.metaSpacer} />
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    padding: spacing.cardPad,
    justifyContent: 'space-between',
  },
  titleBlock: {},
  graphic: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaSpacer: { height: 16 },
});
