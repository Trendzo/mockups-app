import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import { launchImageLibrary } from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  AppText,
  Icon,
  PressableScale,
  PrimaryButton,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { colors, spacing } from '../theme/theme';
import { Haptics } from '../utils/haptics';
import { useCaptureDraft } from '../store/captureDraft';
import { takeCameraSink } from './ProductWizard/cameraSink';
import { ensureCameraPermission, openAppSettings } from '../utils/permissions';

// vision-camera exposes `zoom` as a Reanimated-animatable prop.
const ReanimatedCamera = Animated.createAnimatedComponent(Camera);

const SLOT_PROMPT: Record<string, string> = {
  front: 'Shoot the FRONT',
  back: 'Shoot the BACK',
  pattern: 'Pattern close-up',
  logo: 'Logo close-up',
  tag: 'Brand tag / label',
};

/** Capture / Upload apparel (§5.2). Full-screen preview, yellow shutter, library pick. */
export function CaptureScreen({ navigation, route }: ScreenProps<'Capture'>) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const camera = useRef<Camera>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const { hasPermission } = useCameraPermission();
  const [permission, setPermission] = useState<'granted' | 'denied' | 'blocked'>(
    hasPermission ? 'granted' : 'denied',
  );
  const [position, setPosition] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [grid, setGrid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [zoomLabel, setZoomLabel] = useState('1.0');

  const reportZoom = useCallback((z: number) => {
    console.log('[Capture] zoom →', z.toFixed(2));
    setZoomLabel(z.toFixed(1));
  }, []);

  const device = useCameraDevice(position);
  const flashOpacity = useSharedValue(0);

  // --- Pinch to zoom (vision-camera `zoom` is a Reanimated-animatable prop) ---
  const minZoom = device?.minZoom ?? 1;
  const maxZoom = Math.min(device?.maxZoom ?? 1, 8);
  const zoom = useSharedValue(device?.neutralZoom ?? 1);
  const zoomStart = useSharedValue(1);

  // Reset zoom ONLY when the actual camera changes (front↔back). Depending on the
  // `device` object was resetting zoom on every re-render (useCameraDevice can
  // return a new reference), which snapped the pinch-zoom straight back to 1×.
  useEffect(() => {
    zoom.value = device?.neutralZoom ?? 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.id]);

  // The front camera has no flash — make sure it's off there.
  useEffect(() => {
    if (position === 'front') setFlash('off');
  }, [position]);

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      zoomStart.value = zoom.value;
    })
    .onUpdate((e) => {
      const next = zoomStart.value * e.scale;
      const clamped = Math.min(Math.max(next, minZoom), maxZoom);
      zoom.value = clamped;
      runOnJS(reportZoom)(clamped);
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const reset = device?.neutralZoom ?? minZoom;
      zoom.value = reset;
      runOnJS(reportZoom)(reset);
    });
  const zoomGesture = Gesture.Simultaneous(pinch, doubleTap);
  const cameraAnimatedProps = useAnimatedProps(
    () => ({ zoom: zoom.value }),
    [zoom],
  );

  useEffect(() => {
    (async () => {
      const outcome = await ensureCameraPermission();
      setPermission(outcome);
    })();
  }, []);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));

  const slot = route.params.slot;
  const setPhoto = useCaptureDraft((s) => s.setPhoto);

  const acceptPhoto = useCallback(
    (uri: string) => {
      // sink 'custom' → deliver to whoever registered the camera sink (e.g. a
      // variant card) instead of the mockup capture draft.
      if (route.params.sink === 'custom') {
        takeCameraSink()?.(uri);
      } else {
        setPhoto(slot, { uri });
      }
      navigation.goBack();
    },
    [navigation, setPhoto, slot, route.params.sink],
  );

  const onShutter = useCallback(async () => {
    if (!camera.current || busy) return;
    if (!cameraReady) {
      toast.show('Camera is still starting…', 'info');
      return;
    }
    setBusy(true);
    Haptics.shutter();
    // Chain the flash in/out with withSequence — nesting a withTiming inside a
    // completion callback re-enters the value setter and blows the stack.
    flashOpacity.value = withSequence(
      withTiming(0.9, { duration: 60 }),
      withTiming(0, { duration: 220 }),
    );
    try {
      const photo = await camera.current.takePhoto({ flash });
      const uri = photo.path.startsWith('file://')
        ? photo.path
        : `file://${photo.path}`;
      acceptPhoto(uri);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[Capture] takePhoto failed:', msg);
      toast.show(`Capture failed: ${msg}`, 'error');
    } finally {
      setBusy(false);
    }
  }, [busy, cameraReady, flash, flashOpacity, acceptPhoto, toast]);

  const onPickLibrary = useCallback(async () => {
    const res = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.9,
      maxWidth: 2048,
      maxHeight: 2048,
    });
    if (res.errorCode) {
      toast.show(res.errorMessage ?? 'Could not open library', 'error');
      return;
    }
    const asset = res.assets?.[0];
    if (asset?.uri) acceptPhoto(asset.uri);
  }, [acceptPhoto, toast]);

  const showCamera = permission === 'granted' && device != null;

  return (
    <View style={styles.root}>
      {showCamera ? (
        <GestureDetector gesture={zoomGesture}>
          <ReanimatedCamera
            ref={camera}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive
            photo
            animatedProps={cameraAnimatedProps}
            onInitialized={() => setCameraReady(true)}
            onError={(e) => {
              console.warn('[Camera] error:', e.message);
              toast.show(`Camera error: ${e.message}`, 'error');
            }}
          />
        </GestureDetector>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallback]}>
          <AppText variant="body" color={colors.surface} style={styles.center}>
            {permission === 'blocked'
              ? 'Camera access is off. Enable it in Settings, or upload from your library.'
              : device == null
              ? 'No camera available on this device. Upload from your library instead.'
              : 'Requesting camera…'}
          </AppText>
          {permission === 'blocked' && (
            <PrimaryButton
              label="Open Settings"
              tone="surface"
              fullWidth={false}
              onPress={openAppSettings}
              style={styles.settingsBtn}
            />
          )}
        </View>
      )}

      {/* Rule-of-thirds grid overlay */}
      {grid && showCamera && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={[styles.gridLine, styles.gridV1]} />
          <View style={[styles.gridLine, styles.gridV2]} />
          <View style={[styles.gridLine, styles.gridH1]} />
          <View style={[styles.gridLine, styles.gridH2]} />
        </View>
      )}

      {/* Flash animation overlay */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.flash, flashStyle]}
      />

      {/* Top controls */}
      <View style={[styles.topRow, { top: insets.top + 8 }]}>
        <PressableScale onPress={() => navigation.goBack()} style={styles.pill}>
          <Icon name="close" size={22} color={colors.surface} />
        </PressableScale>
        <View style={styles.topRight}>
          <PressableScale
            onPress={() => setGrid((g) => !g)}
            style={[styles.pill, grid && styles.pillActive]}
          >
            <Icon
              name="grid"
              size={20}
              color={grid ? colors.accentInk : colors.surface}
            />
          </PressableScale>
          {/* Flash only on the back camera — the front camera has no flash. */}
          {position === 'back' ? (
            <PressableScale
              onPress={() => setFlash((f) => (f === 'off' ? 'on' : 'off'))}
              style={[styles.pill, flash === 'on' && styles.pillActive]}
            >
              <Icon
                name={flash === 'on' ? 'flash' : 'flash-off'}
                size={20}
                color={flash === 'on' ? colors.accentInk : colors.surface}
              />
            </PressableScale>
          ) : null}
        </View>
      </View>

      {/* Which photo to capture */}
      <View pointerEvents="none" style={[styles.sidePill, { top: insets.top + 56 }]}>
        <AppText variant="sectionLabel" color={colors.accentInk}>
          {SLOT_PROMPT[slot] ?? 'Shoot the photo'}
        </AppText>
      </View>

      {/* Zoom hint */}
      {showCamera && (
        <View pointerEvents="none" style={[styles.hint, { bottom: insets.bottom + 120 }]}>
          <AppText variant="meta" color={colors.surface}>
            {zoomLabel}× · pinch to zoom · double-tap to reset
          </AppText>
        </View>
      )}

      {/* Bottom controls: library, shutter, flip */}
      <View style={[styles.bottomRow, { bottom: insets.bottom + 24 }]}>
        <PressableScale onPress={onPickLibrary} style={styles.sideBtn}>
          <Icon name="images" size={26} color={colors.surface} />
        </PressableScale>

        <PressableScale onPress={onShutter} haptic={false} disabled={!showCamera}>
          <View style={styles.shutterOuter}>
            <View style={styles.shutterInner} />
          </View>
        </PressableScale>

        <PressableScale
          onPress={() => setPosition((p) => (p === 'back' ? 'front' : 'back'))}
          style={styles.sideBtn}
        >
          <Icon name="camera-reverse" size={26} color={colors.surface} />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  center: { textAlign: 'center' },
  settingsBtn: { marginTop: spacing.md },
  flash: { backgroundColor: '#fff' },
  topRow: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topRight: { flexDirection: 'row', gap: spacing.sm },
  sidePill: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  hint: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: colors.scrim,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  pill: {
    backgroundColor: colors.scrim,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 40,
    alignItems: 'center',
  },
  pillActive: { backgroundColor: colors.accent },
  bottomRow: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
  },
  gridLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.35)' },
  gridV1: { left: '33.33%', top: 0, bottom: 0, width: 1 },
  gridV2: { left: '66.66%', top: 0, bottom: 0, width: 1 },
  gridH1: { top: '33.33%', left: 0, right: 0, height: 1 },
  gridH2: { top: '66.66%', left: 0, right: 0, height: 1 },
});
