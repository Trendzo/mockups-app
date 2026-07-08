import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { AppImage } from './AppImage';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { colors, radii, spacing } from '../theme/theme';
import { Haptics } from '../utils/haptics';

export interface SortableMockupItem {
  id: string;
  url: string;
  name: string;
}

interface Props {
  /** Stable list (original order + id set). Order is managed internally. */
  items: SortableMockupItem[];
  /** id -> chosen. Controlled by the parent. */
  selected: Record<string, boolean>;
  onToggleSelect: (id: string) => void;
  /** Fires on every drop with the new id order. */
  onReorder: (orderedIds: string[]) => void;
  /** Zoom button tapped for an item. */
  onZoom: (id: string) => void;
  /** Lift/drop hooks so the parent can freeze its ScrollView while dragging. */
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

const COLS = 2;
const GAP = spacing.cardGap; // 14
const CELL_H = 200;
const ROW_H = CELL_H + GAP;
const SPRING = { damping: 20, stiffness: 200, mass: 0.6 };

/** Move index `from` -> `to` in an {id:index} map, shifting the rest. */
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
 * Selectable + drag-to-reorder 2-column grid of generated mockups (§5.6).
 * Tap toggles selection, long-press lifts an item to drag, the ⤢ button zooms.
 * Built on gesture-handler + reanimated — no extra dependency.
 */
export function SortableMockupGrid({
  items,
  selected,
  onToggleSelect,
  onReorder,
  onZoom,
  onDragStart,
  onDragEnd,
}: Props) {
  const [width, setWidth] = useState(0);

  // {id: slotIndex}. Initialised once from the incoming order (items is stable).
  const positions = useSharedValue<Record<string, number>>(
    Object.fromEntries(items.map((it, i) => [it.id, i])),
  );
  const activeId = useSharedValue<string | null>(null);
  const activeX = useSharedValue(0);
  const activeY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const rows = Math.ceil(items.length / COLS);
  const colW = width > 0 ? (width - GAP) / COLS : 0;
  const containerH = rows * ROW_H - GAP;

  const commitOrder = (pos: Record<string, number>) => {
    const ordered = [...items]
      .sort((a, b) => pos[a.id] - pos[b.id])
      .map((it) => it.id);
    onReorder(ordered);
  };

  const onLayout = (e: LayoutChangeEvent) =>
    setWidth(e.nativeEvent.layout.width);

  return (
    <View style={{ height: containerH }} onLayout={onLayout}>
      {width > 0 &&
        items.map((item) => (
          <Cell
            key={item.id}
            item={item}
            colW={colW}
            rowCount={rows}
            itemCount={items.length}
            selected={!!selected[item.id]}
            positions={positions}
            activeId={activeId}
            activeX={activeX}
            activeY={activeY}
            startX={startX}
            startY={startY}
            onToggleSelect={onToggleSelect}
            onZoom={onZoom}
            commitOrder={commitOrder}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
    </View>
  );
}

interface CellProps {
  item: SortableMockupItem;
  colW: number;
  rowCount: number;
  itemCount: number;
  selected: boolean;
  positions: SharedValue<Record<string, number>>;
  activeId: SharedValue<string | null>;
  activeX: SharedValue<number>;
  activeY: SharedValue<number>;
  startX: SharedValue<number>;
  startY: SharedValue<number>;
  onToggleSelect: (id: string) => void;
  onZoom: (id: string) => void;
  commitOrder: (pos: Record<string, number>) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

function Cell({
  item,
  colW,
  rowCount,
  itemCount,
  selected,
  positions,
  activeId,
  activeX,
  activeY,
  startX,
  startY,
  onToggleSelect,
  onZoom,
  commitOrder,
  onDragStart,
  onDragEnd,
}: CellProps) {
  const id = item.id;
  const step = colW + GAP;

  const pan = Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart(() => {
      const idx = positions.value[id];
      startX.value = (idx % COLS) * step;
      startY.value = Math.floor(idx / COLS) * ROW_H;
      activeX.value = startX.value;
      activeY.value = startY.value;
      activeId.value = id;
      runOnJS(Haptics.press)();
      if (onDragStart) runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      activeX.value = startX.value + e.translationX;
      activeY.value = startY.value + e.translationY;
      let col = Math.round(activeX.value / step);
      let row = Math.round(activeY.value / ROW_H);
      if (col < 0) col = 0;
      if (col > COLS - 1) col = COLS - 1;
      if (row < 0) row = 0;
      if (row > rowCount - 1) row = rowCount - 1;
      let newIndex = row * COLS + col;
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

  const tap = Gesture.Tap()
    .maxDuration(220)
    .onEnd(() => {
      runOnJS(onToggleSelect)(id);
      runOnJS(Haptics.select)();
    });

  const gesture = Gesture.Exclusive(pan, tap);

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
    const slotX = (idx % COLS) * step;
    const slotY = Math.floor(idx / COLS) * ROW_H;
    return {
      zIndex: 0,
      transform: [
        { translateX: withSpring(slotX, SPRING) },
        { translateY: withSpring(slotY, SPRING) },
        { scale: withSpring(1, SPRING) },
      ],
    };
  });

  return (
    <Animated.View style={[styles.cell, { width: colW, height: CELL_H }, animStyle]}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={StyleSheet.absoluteFill}>
          <AppImage
            uri={item.url}
            radius={radii.card}
            containerStyle={styles.image}
            resizeMode="cover"
          />
          {!selected && <View style={styles.dim} pointerEvents="none" />}
          <View
            style={[styles.border, selected && styles.borderOn]}
            pointerEvents="none"
          />
          <View
            style={[styles.check, selected ? styles.checkOn : styles.checkOff]}
            pointerEvents="none"
          >
            {selected && <Icon name="checkmark" size={16} color={colors.accentInk} />}
          </View>
        </Animated.View>
      </GestureDetector>
      <PressableScale style={styles.zoom} toScale={0.9} onPress={() => onZoom(id)}>
        <Icon name="expand" size={16} color={colors.ink} />
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cell: { position: 'absolute', left: 0, top: 0 },
  image: { width: '100%', height: '100%' },
  dim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(231,231,229,0.55)',
    borderRadius: radii.card,
  },
  border: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radii.card,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  borderOn: { borderColor: colors.accent },
  check: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent },
  checkOff: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  zoom: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
