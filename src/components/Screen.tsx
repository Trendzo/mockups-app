import React from 'react';
import {
  StatusBar,
  StyleSheet,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme/theme';

interface ScreenProps {
  children: React.ReactNode;
  /** Apply the default 24pt horizontal padding. */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  edges?: readonly Edge[];
  background?: string;
  statusBarStyle?: 'dark-content' | 'light-content';
}

/** Canvas wrapper: warm-gray background, safe-area, standard horizontal rhythm. */
export function Screen({
  children,
  padded = true,
  style,
  edges = ['top', 'bottom'],
  background = colors.canvas,
  statusBarStyle = 'dark-content',
}: ScreenProps) {
  return (
    <SafeAreaView
      edges={edges}
      style={[styles.safe, { backgroundColor: background }]}
    >
      <StatusBar
        barStyle={statusBarStyle}
        backgroundColor="transparent"
        translucent
      />
      <View
        style={[
          styles.inner,
          padded && { paddingHorizontal: spacing.screenH },
          style,
        ]}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  inner: { flex: 1 },
});
