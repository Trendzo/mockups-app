import React from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../theme/theme';

/** The home screen's signature side-by-side pair (one gray, one yellow). */
export function TwoCardGrid({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children).slice(0, 2);
  return (
    <View style={styles.row}>
      {items.map((child, i) => (
        <View key={i} style={styles.col}>
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.cardGap,
  },
  col: { flex: 1 },
});
