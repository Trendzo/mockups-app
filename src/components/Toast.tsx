import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AppText } from './AppText';
import { colors, radii, spacing } from '../theme/theme';
import { Haptics } from '../utils/haptics';

type ToastKind = 'success' | 'error' | 'info';

interface ToastContextValue {
  show: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

export const useToast = () => useContext(ToastContext);

const kindColor: Record<ToastKind, string> = {
  success: colors.success,
  error: colors.danger,
  info: colors.ink,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(
    null,
  );
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast({ message, kind });
      if (kind === 'success') Haptics.success();
      else if (kind === 'error') Haptics.error();
      opacity.value = withTiming(1, { duration: 200 });
      translateY.value = withTiming(0, { duration: 220 });
      hideTimer.current = setTimeout(() => {
        opacity.value = withTiming(0, { duration: 220 });
        translateY.value = withTiming(20, { duration: 220 });
      }, 2200);
    },
    [opacity, translateY],
  );

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.wrap,
          { bottom: insets.bottom + 90 },
          animStyle,
        ]}
      >
        {toast && (
          <View style={styles.toast}>
            <View
              style={[styles.dot, { backgroundColor: kindColor[toast.kind] }]}
            />
            <AppText
              variant="bodyMedium"
              color={colors.surface}
              style={styles.message}
            >
              {toast.message}
            </AppText>
          </View>
        )}
      </Animated.View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 2,
    maxWidth: '100%',
  },
  message: { flexShrink: 1, textAlign: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
