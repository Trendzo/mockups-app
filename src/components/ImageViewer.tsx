import React, { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  View,
  ListRenderItemInfo,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FastImage from '@d11/react-native-fast-image';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { colors, spacing } from '../theme/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export interface ViewerImage {
  url: string;
  name?: string;
}

interface ImageViewerProps {
  visible: boolean;
  images: ViewerImage[];
  initialIndex?: number;
  onClose: () => void;
  onSave?: (index: number) => void;
  onShare?: (index: number) => void;
}

/** Full-screen viewer: pinch-zoom + swipe between mockups (§5.6). */
export function ImageViewer({
  visible,
  images,
  initialIndex = 0,
  onClose,
  onSave,
  onShare,
}: ImageViewerProps) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);
  // Disable horizontal paging while an image is zoomed, so a one-finger drag
  // pans the image instead of swiping to the next one.
  const [zoomed, setZoomed] = useState(false);
  const listRef = useRef<FlatList<ViewerImage>>(null);

  const onViewRef = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      const first = viewableItems[0];
      if (first?.index != null) {
        setIndex(first.index);
        setZoomed(false);
      }
    },
  );
  const viewConfigRef = useRef({ viewAreaCoveragePercentThreshold: 60 });

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ViewerImage>) => (
      <ZoomableImage uri={item.url} onZoomChange={setZoomed} />
    ),
    [],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(it, i) => `${it.url}-${i}`}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({
            length: SCREEN_W,
            offset: SCREEN_W * i,
            index: i,
          })}
          onViewableItemsChanged={onViewRef.current}
          viewabilityConfig={viewConfigRef.current}
        />

        {/* Top bar: close + counter + share - each on a dark scrim so they stay
            readable over light images. */}
        <View style={[styles.topBar, { top: insets.top + 8 }]}>
          <PressableScale onPress={onClose} style={styles.iconBtn}>
            <Icon name="close" size={24} color={colors.surface} />
          </PressableScale>
          <View style={styles.counterPill}>
            <AppText variant="meta" color={colors.surface} numberOfLines={1}>
              {index + 1}/{images.length}
            </AppText>
          </View>
          {/* Share - top-right, icon only. */}
          {onShare ? (
            <PressableScale onPress={() => onShare(index)} style={styles.iconBtn}>
              <Icon name="share-outline" size={22} color={colors.surface} />
            </PressableScale>
          ) : (
            <View style={styles.iconBtn} />
          )}
        </View>

        {/* Bottom actions */}
        {onSave ? (
          <View style={[styles.actions, { bottom: insets.bottom + 16 }]}>
            <PressableScale onPress={() => onSave(index)} style={styles.actionBtn}>
              <AppText variant="button" color={colors.ink}>
                Save
              </AppText>
            </PressableScale>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

function clampWorklet(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

function ZoomableImage({
  uri,
  onZoomChange,
}: {
  uri: string;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  // Local mirror drives `pan.enabled` (recreated on change) and the parent's
  // paging lock.
  const [zoomed, setZoomed] = useState(false);

  const applyZoom = useCallback(
    (z: boolean) => {
      setZoomed(z);
      onZoomChange(z);
    },
    [onZoomChange],
  );

  // Keep the image from being dragged past its own edges, springing it back
  // to the nearest in-bounds position.
  const clampTranslation = () => {
    'worklet';
    const maxX = (SCREEN_W * (scale.value - 1)) / 2;
    const maxY = (SCREEN_H * (scale.value - 1)) / 2;
    const cx = clampWorklet(translateX.value, -maxX, maxX);
    const cy = clampWorklet(translateY.value, -maxY, maxY);
    translateX.value = withTiming(cx);
    translateY.value = withTiming(cy);
    savedX.value = cx;
    savedY.value = cy;
  };

  const resetToFit = () => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedX.value = 0;
    savedY.value = 0;
    runOnJS(applyZoom)(false);
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = clampWorklet(savedScale.value * e.scale, 1, MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        resetToFit();
      } else {
        savedScale.value = scale.value;
        clampTranslation();
        runOnJS(applyZoom)(true);
      }
    });

  // One-finger pan, only active while zoomed (otherwise the FlatList pages).
  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onUpdate((e) => {
      translateX.value = savedX.value + e.translationX;
      translateY.value = savedY.value + e.translationY;
    })
    .onEnd(clampTranslation);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(260)
    .onEnd(() => {
      if (scale.value > 1) {
        resetToFit();
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
        runOnJS(applyZoom)(true);
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  // The transform lives on a plain Animated.View wrapper - NOT on FastImage
  // itself. FastImage's native view does not reliably pick up Reanimated
  // transform updates, so animating it directly leaves the pinch/zoom visually
  // dead. Wrapping in an Animated.View (as the sortable grid does) is the
  // pattern that actually moves on both Android and iOS.
  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <View style={styles.page}>
        <Animated.View style={[styles.imageWrap, animStyle]}>
          <FastImage
            source={{ uri }}
            resizeMode={FastImage.resizeMode.contain}
            style={styles.image}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000' },
  page: {
    width: SCREEN_W,
    height: SCREEN_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: { width: SCREEN_W, height: SCREEN_H },
  image: { width: '100%', height: '100%' },
  topBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counterPill: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    height: 28,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
  },
  actionBtn: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
  },
});
