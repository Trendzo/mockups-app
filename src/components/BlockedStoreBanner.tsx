import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Banner } from './Banner';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import type { GateBanner, GateTarget, StoreGate } from '../navigation/storeGate';
import { colors, radii, spacing } from '../theme/theme';

const TONE = {
  warning: { fg: '#B8860B', bg: '#FBF3DC', icon: 'warning' },
  danger: { fg: colors.danger, bg: '#FBE7E8', icon: 'alert-circle' },
} as const;

interface Props {
  gate: StoreGate;
  /** Open one of the gate's target screens (navigation.navigate(target)). */
  onOpen: (target: GateTarget) => void;
  /**
   * `card`  full banner with the message and a CTA (Home).
   * `strip` one-line opaque bar for floating over the other tabs.
   */
  variant?: 'card' | 'strip';
}

/**
 * Why the store is restricted and the way out: paused (resume), suspended / terminated
 * (appeal), closed (reopen) or a KYC pause (resubmit). Mirrors the web portal's GateNotice.
 * Renders nothing unless the app is in `restricted` mode, so it is safe to drop anywhere.
 */
export function BlockedStoreBanner({ gate, onOpen, variant = 'card' }: Props) {
  const b: GateBanner | null = gate.mode === 'restricted' ? gate.banner : null;
  if (!b) return null;

  if (variant === 'strip') {
    const t = TONE[b.tone];
    return (
      <PressableScale
        onPress={() => onOpen(b.cta.target)}
        toScale={0.98}
        haptic={false}
        accessibilityRole="button"
        accessibilityLabel={`${b.title}. ${b.cta.label}`}
        style={[styles.strip, { backgroundColor: t.bg }]}
      >
        <Icon name={t.icon} size={18} color={t.fg} />
        <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1} style={styles.stripTitle}>
          {b.title}
        </AppText>
        <AppText variant="meta" color={t.fg} numberOfLines={1}>
          {b.cta.label}
        </AppText>
        <Icon name="chevron-forward" size={16} color={t.fg} />
      </PressableScale>
    );
  }

  return (
    <View>
      <Banner
        tone={b.tone}
        title={b.title}
        message={b.message}
        actionLabel={b.cta.label}
        onAction={() => onOpen(b.cta.target)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  stripTitle: { flex: 1 },
});
