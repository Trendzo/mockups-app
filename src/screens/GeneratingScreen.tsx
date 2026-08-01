import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
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
import { getSubmission } from '../api/catalog';
import { isGenerationFailure, isUnreachable } from '../api/errors';
import { useSession } from '../store/session';
import { useGenerationRecovery } from '../store/generationRecovery';
import { Haptics } from '../utils/haptics';
import { colors, spacing } from '../theme/theme';
import { ApiError, CreateSubmissionInput, Submission } from '../types/api';
import { SubmissionStatus } from '../types/enums';

const STATUS_MESSAGES = [
  'Reading your garment...',
  'Printing the design...',
  'Setting the studio light...',
  'Rendering the views...',
  'Almost there - polishing pixels...',
];

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 8 * 60 * 1000;

const ACTIVE_STATUSES = new Set<SubmissionStatus>([
  SubmissionStatus.Submitted,
  SubmissionStatus.Processing,
  SubmissionStatus.Regenerating,
]);

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const randomHex32 = () =>
  Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, '0'),
  ).join('');

const newSubmissionId = () => `aic_${randomHex32()}`;

const withSubmissionId = (request: CreateSubmissionInput): CreateSubmissionInput =>
  request.clientRequestId
    ? request
    : { ...request, clientRequestId: newSubmissionId() };

/** Durable generation screen: recover existing server work before retrying. */
export function GeneratingScreen({ navigation, route }: ScreenProps<'Generating'>) {
  const input = route.params;
  const { mutate, isError, error: mutationError } = useCreateSubmission();
  const upsert = useSession((s) => s.upsert);
  const activeRecovery = useGenerationRecovery((s) => s.active);
  const beginRecovery = useGenerationRecovery((s) => s.begin);
  const clearRecovery = useGenerationRecovery((s) => s.clear);
  const cancelled = useRef(false);
  const [phase, setPhase] = useState<'reconciling' | 'generating' | 'polling' | 'failed'>(
    activeRecovery ? 'reconciling' : 'generating',
  );
  const [localError, setLocalError] = useState<ApiError | null>(null);

  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(
      withTiming(1, { duration: 1000, easing: Easing.linear }),
      -1,
    );
  }, [spin]);

  const finish = React.useCallback(
    (submission: Submission) => {
      if (cancelled.current) return;
      Haptics.success();
      clearRecovery();
      upsert(submission, Date.now());
      navigation.replace('ReviewResults', { submission });
    },
    [clearRecovery, navigation, upsert],
  );

  const fail = React.useCallback((error: ApiError) => {
    if (cancelled.current) return;
    Haptics.error();
    setLocalError(error);
    setPhase('failed');
  }, []);

  const poll = React.useCallback(
    async (id: string, startedAt: number) => {
      setPhase('polling');
      while (!cancelled.current) {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          fail({
            error:
              'This generation is still processing longer than expected. Reopen the app later or try again.',
          });
          return;
        }

        try {
          const submission = await getSubmission(id);
          if (submission.status === SubmissionStatus.ReadyForReview) {
            finish(submission);
            return;
          }
          if (submission.status === SubmissionStatus.Failed) {
            fail({
              error:
                submission.errorMessage ??
                'Image generation failed. Your photo is safe - try again.',
              status: 502,
            });
            return;
          }
          if (!ACTIVE_STATUSES.has(submission.status)) {
            clearRecovery();
            fail({ error: 'This generation is no longer available for review.' });
            return;
          }
        } catch {
          fail({
            error:
              "Can't refresh generation status. Check your connection and try again.",
          });
          return;
        }

        await delay(POLL_INTERVAL_MS);
      }
    },
    [clearRecovery, fail, finish],
  );

  const startFresh = React.useCallback(
    (request: CreateSubmissionInput) => {
      const requestWithId = withSubmissionId(request);
      cancelled.current = false;
      setLocalError(null);
      setPhase('generating');
      beginRecovery(requestWithId.clientRequestId!, requestWithId);
      mutate(requestWithId, {
        onSuccess: finish,
        onError: (e) => fail(e),
      });
    },
    [beginRecovery, fail, finish, mutate],
  );

  const start = React.useCallback(
    async (forceNew = false) => {
      cancelled.current = false;
      setLocalError(null);
      const recovery = useGenerationRecovery.getState().active;

      if (recovery && !forceNew) {
        setPhase('reconciling');
        try {
          const recovered = await getSubmission(recovery.submissionId);
          if (cancelled.current) return;
          if (recovered.status === SubmissionStatus.ReadyForReview) {
            finish(recovered);
            return;
          }
          if (recovered.status === SubmissionStatus.Failed) {
            fail({
              error:
                recovered.errorMessage ??
                'Image generation failed. Your photo is safe - try again.',
              status: 502,
            });
            return;
          }
          if (ACTIVE_STATUSES.has(recovered.status)) {
            poll(recovered.id, recovery.startedAt);
            return;
          }
          clearRecovery();
          fail({ error: 'This generation is no longer available for review.' });
          return;
        } catch (e: any) {
          if (e?.response?.status === 404) {
            startFresh(recovery.input);
            return;
          }
          fail({
            error:
              "Can't refresh generation status. Check your connection and try again.",
          });
          return;
        }
      }

      startFresh(input);
    },
    [clearRecovery, fail, finish, input, poll, startFresh],
  );

  useEffect(() => {
    start();
    return () => {
      cancelled.current = true;
    };
  }, [start]);

  const confirmCancel = () => {
    Alert.alert(
      'Discard generation?',
      'If you go back now, all generation will be lost.',
      [
        { text: 'Keep generating', style: 'cancel' },
        {
          text: 'Go back & discard',
          style: 'destructive',
          onPress: () => {
            cancelled.current = true;
            clearRecovery();
            navigation.goBack();
          },
        },
      ],
    );
  };

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  const failed = phase === 'failed' || isError;
  const error = localError ?? mutationError;
  const statusMessages =
    phase === 'reconciling'
      ? ['Checking your last generation...', 'Looking for saved progress...']
      : phase === 'polling'
      ? ['Generation is still running...', 'Checking for finished mockups...']
      : STATUS_MESSAGES;

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.center}>
        {!failed ? (
          <>
            <Animated.View style={[styles.ring, spinStyle]} />
            <StatusTicker
              messages={statusMessages}
              style={styles.statusText}
              color={colors.ink}
            />
            <AppText variant="meta" color={colors.meta} style={styles.sub}>
              {phase === 'polling'
                ? 'You can keep this open while we refresh the saved job.'
                : 'This usually takes a moment. Keep the app open.'}
            </AppText>
          </>
        ) : (
          <View style={styles.errorBlock}>
            <Icon name="alert-circle" size={56} color={colors.danger} />
            <AppText variant="cardTitle" color={colors.ink} style={styles.errorTitle}>
              {error && isGenerationFailure(error)
                ? 'Generation hit a snag'
                : error && isUnreachable(error)
                ? "Can't reach the server"
                : 'Something went wrong'}
            </AppText>
            <AppText variant="body" color={colors.meta} style={styles.errorMsg}>
              {error?.error ?? 'Please try again.'}
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
            <PrimaryButton
              label="Try again"
              tone="accent"
              onPress={() => {
                clearRecovery();
                start(true);
              }}
            />
            <PrimaryButton
              label="Back"
              tone="surface"
              onPress={() => {
                clearRecovery();
                navigation.popToTop();
              }}
            />
          </>
        ) : (
          <PrimaryButton label="Cancel" tone="ghost" onPress={confirmCancel} />
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
