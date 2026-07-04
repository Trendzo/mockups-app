import React from 'react';
import { Platform, StyleProp, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '../utils/useKeyboardHeight';

interface KeyboardStickyViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Extra bottom padding added on top of the keyboard / safe-area offset. */
  minBottom?: number;
}

/**
 * A bottom bar (footer button, chat composer, …) that stays pinned to the
 * bottom and rises above the keyboard when it opens.
 *
 * iOS has no window resize, so we lift by the exact keyboard height. Android
 * uses `adjustResize` (manifest) which already raises the bar, so we only keep
 * the safe-area inset there. Put a flex:1 ScrollView above this in the same
 * column and it shrinks to fit above the keyboard automatically.
 */
export function KeyboardStickyView({ children, style, minBottom = 0 }: KeyboardStickyViewProps) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const iosKeyboard = Platform.OS === 'ios' ? keyboardHeight : 0;
  const paddingBottom = (iosKeyboard > 0 ? iosKeyboard : insets.bottom) + minBottom;
  return <View style={[style, { paddingBottom }]}>{children}</View>;
}
