import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { BackButton } from './BackButton';
import { colors, spacing } from '../theme/theme';

interface ScreenHeaderProps {
  title: string;
  /** Small uppercase line above the title (section / context). */
  overline?: string;
  /** Renders the circular back button on its own row above the title. */
  onBack?: () => void;
  /** Right-side accessories (icon buttons) — beside the back button, or beside
   *  the title on top-level tab screens without one. */
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Standard page header: optional back row, overline + bold title. Mirrors the
 * inline headers on Catalog / Earnings so new screens read the same.
 */
export function ScreenHeader({ title, overline, onBack, right, style }: ScreenHeaderProps) {
  // flex: 1 only when the title shares a ROW with the actions. In the stacked
  // (back-button) layout it must size to its text: flex: 1 there means a 0
  // basis, and outside a ScrollView the block measured 0pt tall — the title
  // then painted over whatever came next (chips, lists).
  const titleBlock = (
    <View style={onBack ? styles.titleStacked : styles.titleInline}>
      {overline ? (
        <AppText variant="sectionLabel" color={colors.meta} numberOfLines={1}>
          {overline}
        </AppText>
      ) : null}
      <AppText variant="cardTitle" color={colors.ink} style={styles.title} numberOfLines={2}>
        {title}
      </AppText>
    </View>
  );

  if (onBack) {
    return (
      <View style={[styles.wrap, style]}>
        <View style={styles.backRow}>
          <BackButton onPress={onBack} />
          {right ? <View style={styles.right}>{right}</View> : null}
        </View>
        {titleBlock}
      </View>
    );
  }

  return (
    <View style={[styles.inline, style]}>
      {titleBlock}
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, paddingTop: spacing.xs },
  backRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  titleInline: { flex: 1 },
  titleStacked: { alignSelf: 'stretch' },
  title: { fontSize: 24, lineHeight: 28 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
