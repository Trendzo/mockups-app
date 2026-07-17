import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { colors, spacing } from '../theme/theme';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Wrap the sheet in a KeyboardAvoidingView (for sheets containing inputs). */
  avoidKeyboard?: boolean;
  /** Tapping the scrim above the sheet dismisses it (default true). */
  dismissable?: boolean;
}

/**
 * Standard bottom sheet. The scrim **fades** in (Modal `fade`) while only the
 * sheet **slides up** (Reanimated) - so the black overlay never sweeps up from
 * the bottom the way `Modal animationType="slide"` does with a tinted backdrop.
 *
 * Every bottom sheet in the app should use this; wrap your content in
 * `SheetSurface` so the panel gets the right bottom inset (see below).
 *
 * Android note: `navigationBarTranslucent` is what lets the sheet reach the
 * real bottom edge. Without it RN takes its `disableEdgeToEdge()` branch, which
 * pads the dialog's content up by the navigation bar - stranding the sheet AND
 * the scrim above it with a gap no JS can paint into. It's only honoured
 * alongside `statusBarTranslucent`, and is a no-op on iOS.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  avoidKeyboard = false,
  dismissable = true,
}: BottomSheetProps) {
  const body = (
    <>
      {/* Tap area above the sheet dismisses; taps on the sheet don't reach it. */}
      <Pressable style={styles.dismiss} onPress={dismissable ? onClose : undefined} />
      <Animated.View entering={SlideInDown.duration(240)}>{children}</Animated.View>
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* A Modal is its own window, so it needs its own provider: the app-level
          one measures the activity, whose insets don't describe this dialog. */}
      <SafeAreaProvider>
        {avoidKeyboard ? (
          <KeyboardAvoidingView
            style={styles.scrim}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {body}
          </KeyboardAvoidingView>
        ) : (
          <View style={styles.scrim}>{body}</View>
        )}
      </SafeAreaProvider>
    </Modal>
  );
}

/**
 * The sheet panel. Owns the bottom safe-area padding so content clears the
 * home indicator / navigation bar once the sheet itself runs edge-to-edge.
 *
 * This has to live inside the sheet: a caller calling `useSafeAreaInsets()` in
 * its own body resolves the *activity's* provider, which reads 0 whenever the
 * activity isn't edge-to-edge (e.g. Android below 15) - so it can't describe
 * the dialog's window. Rendering here reads BottomSheet's nested provider.
 *
 * Pass the panel's own styling as `style`; only paddingBottom is overridden.
 */
export function SheetSurface({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return <View style={[style, { paddingBottom: insets.bottom + spacing.lg }]}>{children}</View>;
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
});
