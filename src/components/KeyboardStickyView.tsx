import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, StyleProp, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '../utils/useKeyboardHeight';

interface KeyboardStickyViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Extra bottom padding added on top of the keyboard / safe-area offset. */
  minBottom?: number;
}

/**
 * How far the open keyboard overlaps this bar — Android only. With
 * `adjustResize` the window shrinks and the bar already sits above the keyboard
 * (overlap 0); on edge-to-edge windows (Android 15+ with targetSdk 35+) the
 * window doesn't resize and the keyboard would cover the bar. Measuring the
 * real overlap is correct in both cases, so the bar is never covered nor
 * lifted twice.
 */
function useAndroidKeyboardOverlap(ref: React.RefObject<View | null>): number | null {
  const [overlap, setOverlap] = useState<number | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const keyboardTop = e.endCoordinates?.screenY;
      if (keyboardTop == null) return;
      ref.current?.measureInWindow((_x, y, _w, h) => {
        setOverlap(Math.max(0, y + h - keyboardTop));
      });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setOverlap(null));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [ref]);
  return overlap;
}

/**
 * A bottom bar (footer button, chat composer, …) that stays pinned to the
 * bottom and rises above the keyboard when it opens.
 *
 * iOS has no window resize, so we lift by the exact keyboard height (animated
 * with the keyboard). Android lifts by whatever the keyboard actually overlaps
 * (see above). Put a flex:1 ScrollView above this in the same column and it
 * shrinks to fit above the keyboard automatically.
 */
export function KeyboardStickyView({ children, style, minBottom = 0 }: KeyboardStickyViewProps) {
  const insets = useSafeAreaInsets();
  const ref = useRef<View>(null);
  const keyboardHeight = useKeyboardHeight({ animate: true });
  const androidOverlap = useAndroidKeyboardOverlap(ref);
  const lift =
    Platform.OS === 'ios'
      ? keyboardHeight > 0
        ? keyboardHeight
        : insets.bottom
      : androidOverlap ?? insets.bottom;
  return (
    <View ref={ref} style={[style, { paddingBottom: lift + minBottom }]}>
      {children}
    </View>
  );
}
