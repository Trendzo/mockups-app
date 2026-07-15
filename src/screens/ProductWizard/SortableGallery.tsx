import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { AppImage, AppText, Icon, PressableScale } from '../../components';
import { colors, radii, spacing } from '../../theme/theme';
import { Haptics } from '../../utils/haptics';

interface Props {
  /** Ordered gallery URLs - first is the primary. */
  urls: string[];
  /** Fires on drop with the new order. */
  onReorder: (urls: string[]) => void;
  /** Delete the given URL. */
  onRemove: (url: string) => void;
  /** Notify the parent it should freeze its ScrollView while dragging. */
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

const GAP = spacing.sm;
const SPRING = { damping: 20, stiffness: 200, mass: 0.6 };

/** Balanced column count so a full grid fills the row (4 → 2×2, else up to 3). */
function columnsFor(count: number): number {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  if (count === 4) return 2;
  return 3;
}

function moveIndex(
  positions: Record<string, number>,
  from: number,
  to: number,
): Record<string, number> {
  'worklet';
  const next: Record<string, number> = {};
  for (const id in positions) {
    const p = positions[id];
    if (p === from) next[id] = to;
    else if (from < to && p > from && p <= to) next[id] = p - 1;
    else if (from > to && p < from && p >= to) next[id] = p + 1;
    else next[id] = p;
  }
  return next;
}

/**
 * Drag-to-reorder image grid. Long-press lifts a tile; the tile at slot 0 is the
 * primary (badge follows it live). Columns adapt to the image count so the grid
 * fills the row width. A corner ✕ deletes. Built on gesture-handler + reanimated
 * (same approach as SortableMockupGrid).
 */
export function SortableGallery({ urls, onReorder, onRemove, onDragStart, onDragEnd }: Props) {
  const [width, setWidth] = useState(0);
  const cols = columnsFor(urls.length);

  const positions = useSharedValue<Record<string, number>>(
    Object.fromEntries(urls.map((u, i) => [u, i])),
  );
  const activeId = useSharedValue<string | null>(null);
  const activeX = useSharedValue(0);
  const activeY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // Keep the slot map in sync whenever the set/order of URLs changes (add,
  // remove, or a committed reorder). Identity mapping matches the new order.
  useEffect(() => {
    positions.value = Object.fromEntries(urls.map((u, i) => [u, i]));
  }, [urls, positions]);

  const colW = width > 0 ? (width - GAP * (cols - 1)) / cols : 0;
  const cellH = colW; // square
  const rowH = cellH + GAP;
  const stepX = colW + GAP;
  const rows = Math.ceil(urls.length / cols);
  const containerH = rows > 0 ? rows * rowH - GAP : 0;

  const commitOrder = (pos: Record<string, number>) => {
    const ordered = [...urls].sort((a, b) => pos[a] - pos[b]);
    onReorder(ordered);
  };

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={{ height: containerH }} onLayout={onLayout}>
      {width > 0 &&
        urls.map((url) => (
          <Cell
            key={url}
            url={url}
            cols={cols}
            colW={colW}
            cellH={cellH}
            rowH={rowH}
            stepX={stepX}
            rowCount={rows}
            itemCount={urls.length}
            positions={positions}
            activeId={activeId}
            activeX={activeX}
            activeY={activeY}
            startX={startX}
            startY={startY}
            commitOrder={commitOrder}
            onRemove={onRemove}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
    </View>
  );
}

interface CellProps {
  url: string;
  cols: number;
  colW: number;
  cellH: number;
  rowH: number;
  stepX: number;
  rowCount: number;
  itemCount: number;
  positions: SharedValue<Record<string, number>>;
  activeId: SharedValue<string | null>;
  activeX: SharedValue<number>;
  activeY: SharedValue<number>;
  startX: SharedValue<number>;
  startY: SharedValue<number>;
  commitOrder: (pos: Record<string, number>) => void;
  onRemove: (url: string) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

function Cell({
  url,
  cols,
  colW,
  cellH,
  rowH,
  stepX,
  rowCount,
  itemCount,
  positions,
  activeId,
  activeX,
  activeY,
  startX,
  startY,
  commitOrder,
  onRemove,
  onDragStart,
  onDragEnd,
}: CellProps) {
  const id = url;

  const pan = Gesture.Pan()
    .activateAfterLongPress(200)
    .onStart(() => {
      const idx = positions.value[id];
      startX.value = (idx % cols) * stepX;
      startY.value = Math.floor(idx / cols) * rowH;
      activeX.value = startX.value;
      activeY.value = startY.value;
      activeId.value = id;
      runOnJS(Haptics.press)();
      if (onDragStart) runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      activeX.value = startX.value + e.translationX;
      activeY.value = startY.value + e.translationY;
      let col = Math.round(activeX.value / stepX);
      let row = Math.round(activeY.value / rowH);
      if (col < 0) col = 0;
      if (col > cols - 1) col = cols - 1;
      if (row < 0) row = 0;
      if (row > rowCount - 1) row = rowCount - 1;
      let newIndex = row * cols + col;
      if (newIndex > itemCount - 1) newIndex = itemCount - 1;
      const curIndex = positions.value[id];
      if (newIndex !== curIndex) {
        positions.value = moveIndex(positions.value, curIndex, newIndex);
      }
    })
    .onEnd(() => {
      activeId.value = null;
      runOnJS(commitOrder)(positions.value);
      if (onDragEnd) runOnJS(onDragEnd)();
    });

  const animStyle = useAnimatedStyle(() => {
    const isActive = activeId.value === id;
    if (isActive) {
      return {
        zIndex: 100,
        transform: [
          { translateX: activeX.value },
          { translateY: activeY.value },
          { scale: withSpring(1.06, SPRING) },
        ],
      };
    }
    const idx = positions.value[id];
    return {
      zIndex: 0,
      transform: [
        { translateX: withSpring((idx % cols) * stepX, SPRING) },
        { translateY: withSpring(Math.floor(idx / cols) * rowH, SPRING) },
        { scale: withSpring(1, SPRING) },
      ],
    };
  });

  // PRIMARY badge follows whatever tile currently sits in slot 0.
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: positions.value[id] === 0 ? 1 : 0,
  }));

  return (
    <Animated.View style={[styles.cell, { width: colW, height: cellH }, animStyle]}>
      <GestureDetector gesture={pan}>
        <Animated.View style={StyleSheet.absoluteFill}>
          <AppImage
            uri={url}
            radius={radii.card}
            resizeMode="contain"
            containerStyle={styles.image}
          />
          <Animated.View style={[styles.primaryBadge, badgeStyle]} pointerEvents="none">
            <AppText variant="navCounter" color={colors.accentInk}>
              PRIMARY
            </AppText>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
      <PressableScale style={styles.remove} toScale={0.9} onPress={() => onRemove(url)}>
        <Icon name="close" size={14} color={colors.surface} />
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cell: { position: 'absolute', left: 0, top: 0 },
  image: { width: '100%', height: '100%' },
  primaryBadge: {
    position: 'absolute',
    left: spacing.sm,
    top: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
