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
import { prettyView } from '../types/enums';

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
  const listRef = useRef<FlatList<ViewerImage>>(null);

  const onViewRef = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      const first = viewableItems[0];
      if (first?.index != null) setIndex(first.index);
    },
  );
  const viewConfigRef = useRef({ viewAreaCoveragePercentThreshold: 60 });

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ViewerImage>) => <ZoomableImage uri={item.url} />,
    [],
  );

  const current = images[index];

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

        {/* Top bar: close + view name + counter */}
        <View style={[styles.topBar, { top: insets.top + 8 }]}>
          <PressableScale onPress={onClose} style={styles.closeBtn}>
            <Icon name="close" size={26} color={colors.surface} />
          </PressableScale>
          <AppText variant="bodyMedium" color={colors.surface}>
            {current?.name ? prettyView(current.name) : ''}
            {'  '}
            {index + 1}/{images.length}
          </AppText>
          <View style={styles.closeBtn} />
        </View>

        {/* Bottom actions */}
        <View style={[styles.actions, { bottom: insets.bottom + 16 }]}>
          {onSave && (
            <PressableScale onPress={() => onSave(index)} style={styles.actionBtn}>
              <AppText variant="button" color={colors.ink}>
                Save
              </AppText>
            </PressableScale>
          )}
          {onShare && (
            <PressableScale onPress={() => onShare(index)} style={styles.actionBtnOutline}>
              <AppText variant="button" color={colors.surface}>
                Share
              </AppText>
            </PressableScale>
          )}
        </View>
      </View>
    </Modal>
  );
}

const AFastImage = Animated.createAnimatedComponent(FastImage);

function ZoomableImage({ uri }: { uri: string }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, savedScale.value * e.scale);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .minPointers(2)
    .onUpdate((e) => {
      translateX.value = savedX.value + e.translationX;
      translateY.value = savedY.value + e.translationY;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomed = scale.value > 1;
      scale.value = withTiming(zoomed ? 1 : 2.5);
      savedScale.value = zoomed ? 1 : 2.5;
      if (zoomed) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

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
        <AFastImage
          source={{ uri }}
          resizeMode={FastImage.resizeMode.contain}
          style={[styles.image, animStyle]}
        />
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
  image: { width: SCREEN_W, height: SCREEN_H * 0.8 },
  topBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: { width: 32, alignItems: 'center' },
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
  actionBtnOutline: {
    borderColor: colors.surface,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
  },
});
