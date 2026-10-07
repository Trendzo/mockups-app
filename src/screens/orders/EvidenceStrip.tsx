import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppImage, AppText, ImageViewer, PressableScale } from '../../components';
import { colors, radii, spacing } from '../../theme/theme';

/**
 * A labelled row of photo thumbnails (evidence, proof of delivery, return photos).
 * Tap one to open the full-screen pinch-zoom viewer. Renders nothing when empty.
 */
export function EvidenceStrip({ title, urls }: { title?: string; urls?: string[] | null }) {
  const [open, setOpen] = useState<number | null>(null);
  const list = (urls ?? []).filter(Boolean);
  if (!list.length) return null;
  return (
    <View style={styles.wrap}>
      {title ? (
        <AppText variant="sectionLabel" color={colors.meta}>
          {title}
        </AppText>
      ) : null}
      <View style={styles.row}>
        {list.map((u, i) => (
          <PressableScale key={`${u}-${i}`} onPress={() => setOpen(i)} toScale={0.95} haptic={false}>
            <AppImage uri={u} radius={radii.sm} containerStyle={styles.thumb} />
          </PressableScale>
        ))}
      </View>
      <ImageViewer
        visible={open !== null}
        images={list.map((url) => ({ url }))}
        initialIndex={open ?? 0}
        onClose={() => setOpen(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumb: { width: 64, height: 64, borderRadius: radii.sm, overflow: 'hidden' },
});
