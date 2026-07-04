import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { colors } from '../theme/theme';

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
 * sheet **slides up** (Reanimated) — so the black overlay never sweeps up from
 * the bottom the way `Modal animationType="slide"` does with a tinted backdrop.
 *
 * Every bottom sheet in the app should use this; pass your existing sheet
 * surface as `children` so its styling is preserved.
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
      onRequestClose={onClose}
    >
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
});
