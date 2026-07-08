import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppImage } from './AppImage';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { Skeleton } from './SkeletonCard';
import { colors, radii, spacing } from '../theme/theme';
import { prettyView } from '../types/enums';

export interface MockupItem {
  url: string;
  name: string;
}

interface MockupGridProps {
  items: MockupItem[];
  onPressItem?: (index: number) => void;
  loading?: boolean;
  skeletonCount?: number;
}

/** 2-column grid of generated mockups, each labelled with its view name (§5.6). */
export function MockupGrid({
  items,
  onPressItem,
  loading = false,
  skeletonCount = 4,
}: MockupGridProps) {
  if (loading) {
    return (
      <View style={styles.grid}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <View key={i} style={styles.cell}>
            <Skeleton height={200} radius={radii.card} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {items.map((item, i) => (
        <View key={`${item.url}-${i}`} style={styles.cell}>
          <PressableScale onPress={() => onPressItem?.(i)} toScale={0.98}>
            <AppImage
              uri={item.url}
              radius={radii.card}
              containerStyle={styles.image}
              resizeMode="cover"
            />
            <View style={styles.labelPill}>
              <AppText
                variant="meta"
                color={colors.ink}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {prettyView(item.name)}
              </AppText>
            </View>
          </PressableScale>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.cardGap,
  },
  cell: {
    width: '47.6%',
    flexGrow: 1,
  },
  image: {
    height: 200,
    width: '100%',
  },
  labelPill: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    maxWidth: '82%',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
});
