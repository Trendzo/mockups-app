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
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
 * Standard bottom sheet. The whole thing **fades** in (Modal `fade`) — the
 * sheet deliberately does NOT slide up: see the note at the render site for why
 * a reanimated `entering` animation inside a Modal breaks presses on Fabric,
 * and `Modal animationType="slide"` sweeps the tinted scrim up with it.
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
      {/* No reanimated `entering` slide here: on the New Architecture, a layout
          animation on a view inside a Modal cancels in-flight presses — quick
          taps land, but real finger presses (~100ms) die mid-gesture, making
          every sheet's rows and close button feel dead (reproduced on a
          foldable). The Modal's fade covers the reveal instead. */}
      <View>{children}</View>
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
      {/* A Modal is its own window, OUTSIDE the app-root GestureHandlerRootView,
          so gesture-handler's touch pipeline isn't installed for it - on
          foldables / large screens / the New Architecture this makes touchables
          inside the sheet (dropdown rows, colour spectrum) stop responding.
          Wrapping the modal content in its own GestureHandlerRootView is the
          documented fix. It also needs its own SafeAreaProvider: the app-level
          one measures the activity, whose insets don't describe this dialog. */}
      <GestureHandlerRootView style={styles.root}>
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
      </GestureHandlerRootView>
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
  // Pad by the REAL bottom inset. This used to be capped at spacing.md to avoid
  // a tall white strip under the content on 3-button nav bars, but the cap made
  // sheet content sit behind ~48dp gesture/nav bars (last option row was half
  // hidden and untappable on Samsung foldables). Full clearance beats a hidden
  // row; the strip is just the panel's own background.
  const bottom = insets.bottom + spacing.sm;
  return <View style={[style, { paddingBottom: bottom }]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
});
