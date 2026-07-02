import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  AppText,
  Icon,
  PrimaryButton,
  Screen,
  StatusTicker,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useCreateSubmission } from '../api/hooks';
import { isGenerationFailure, isUnreachable } from '../api/errors';
import { useSession } from '../store/session';
import { Haptics } from '../utils/haptics';
import { colors, spacing } from '../theme/theme';

const STATUS_MESSAGES = [
  'Reading your garment…',
  'Printing the design…',
  'Setting the studio light…',
  'Rendering the views…',
  'Almost there — polishing pixels…',
];

/** GENERATING (§5.5): honest indeterminate progress (no polling endpoint) + cancel. */
export function GeneratingScreen({ navigation, route }: ScreenProps<'Generating'>) {
  const { apparel, apparelBack, design, mode, prompt, only } = route.params;
  const mutation = useCreateSubmission();
  const upsert = useSession((s) => s.upsert);
  const cancelled = useRef(false);

  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.linear }),
      -1,
    );
  }, [spin]);

  const start = React.useCallback(() => {
    cancelled.current = false;
    mutation.mutate(
      { apparel, apparelBack, design, mode, prompt, only },
      {
        onSuccess: (submission) => {
          if (cancelled.current) return;
          Haptics.success();
          upsert(submission, Date.now());
          navigation.replace('ReviewResults', { submission });
        },
        onError: () => {
          Haptics.error();
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apparel, apparelBack, design, mode, prompt, only]);

  useEffect(() => {
    start();
    return () => {
      cancelled.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  const failed = mutation.isError;
  const error = mutation.error;

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.center}>
        {!failed ? (
          <>
            <Animated.View style={[styles.ring, spinStyle]} />
            <StatusTicker
              messages={STATUS_MESSAGES}
              style={styles.statusText}
              color={colors.ink}
            />
            <AppText variant="meta" color={colors.meta} style={styles.sub}>
              This usually takes a moment. Keep the app open.
            </AppText>
          </>
        ) : (
          <View style={styles.errorBlock}>
            <Icon name="alert-circle" size={56} color={colors.danger} />
            <AppText variant="cardTitle" color={colors.ink} style={styles.errorTitle}>
              {isGenerationFailure(error!)
                ? 'Generation hit a snag'
                : isUnreachable(error!)
                ? "Can't reach the server"
                : 'Something went wrong'}
            </AppText>
            <AppText variant="body" color={colors.meta} style={styles.errorMsg}>
              {error?.error}
            </AppText>
            <AppText variant="meta" color={colors.meta} style={styles.errorMsg}>
              Your photo is safe.
            </AppText>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        {failed ? (
          <>
            <PrimaryButton label="Try again" tone="accent" onPress={start} />
            {isUnreachable(error!) && (
              <PrimaryButton
                label="Open Dev Settings"
                tone="ghost"
                onPress={() => navigation.navigate('DevSettings')}
              />
            )}
            <PrimaryButton
              label="Back"
              tone="surface"
              onPress={() => navigation.popToTop()}
            />
          </>
        ) : (
          <PrimaryButton
            label="Cancel"
            tone="ghost"
            onPress={() => {
              cancelled.current = true;
              navigation.goBack();
            }}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  ring: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: colors.hairline,
    borderTopColor: colors.ink,
    marginBottom: spacing.sm,
  },
  statusText: { fontSize: 18, textAlign: 'center' },
  sub: { textAlign: 'center' },
  errorBlock: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  errorTitle: { fontSize: 22, lineHeight: 26 },
  errorMsg: { textAlign: 'center' },
  footer: { gap: spacing.sm, paddingVertical: spacing.md },
});
