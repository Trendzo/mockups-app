import React, { useEffect, useState } from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { AppText, BottomSheet, Field, PrimaryButton } from '../../components';
import { colors, radii, spacing } from '../../theme/theme';

// ---- HSL <-> hex helpers ----
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp >= 0 && hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = l - c / 2;
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return { h: 0, s: 0.85, l: 0.5 };
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let hue = 0, s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { h: hue, s, l };
}

const HUE_STOPS = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'];

/** A tappable/draggable gradient bar → returns a 0..1 position. */
function Spectrum({
  gradient,
  value,
  onChange,
}: {
  gradient: string[];
  value: number;
  onChange: (v: number) => void;
}) {
  const [w, setW] = useState(1);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width || 1);
  const handle = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    onChange(Math.max(0, Math.min(1, x / w)));
  };
  return (
    <View
      onLayout={onLayout}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={handle}
      onResponderMove={handle}
      style={styles.bar}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={[styles.thumb, { left: value * w - 11 }]} />
    </View>
  );
}

export function ColorPickerSheet({
  visible,
  initialHex,
  onClose,
  onPick,
}: {
  visible: boolean;
  initialHex?: string | null;
  onClose: () => void;
  onPick: (hex: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [h, setH] = useState(0);
  const [s, setS] = useState(0.85);
  const [l, setL] = useState(0.5);
  const [hexText, setHexText] = useState('');

  // Seed from the passed-in color each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    const seed = initialHex && /^#?[0-9a-fA-F]{6}$/.test(initialHex) ? initialHex : '#E5484D';
    const hsl = hexToHsl(seed);
    setH(hsl.h); setS(hsl.s); setL(hsl.l);
    setHexText(seed.startsWith('#') ? seed.toUpperCase() : `#${seed.toUpperCase()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const hex = hslToHex(h, s, l);

  const setFromSliders = (next: { h?: number; s?: number; l?: number }) => {
    const nh = next.h ?? h, ns = next.s ?? s, nl = next.l ?? l;
    setH(nh); setS(ns); setL(nl);
    setHexText(hslToHex(nh, ns, nl));
  };

  const onHexChange = (t: string) => {
    const v = t.startsWith('#') ? t : `#${t}`;
    setHexText(v.toUpperCase());
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      const hsl = hexToHsl(v);
      setH(hsl.h); setS(hsl.s); setL(hsl.l);
    }
  };

  const hueColor = hslToHex(h, 1, 0.5);

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.headRow}>
          <AppText variant="cardTitle" color={colors.ink} style={styles.title}>
            Pick any color
          </AppText>
          <View style={[styles.preview, { backgroundColor: hex }]} />
        </View>

        <AppText variant="sectionLabel" color={colors.meta}>Hue</AppText>
        <Spectrum gradient={HUE_STOPS} value={h / 360} onChange={(v) => setFromSliders({ h: v * 360 })} />

        <AppText variant="sectionLabel" color={colors.meta}>Shade</AppText>
        <Spectrum
          gradient={['#000000', hueColor, '#FFFFFF']}
          value={l}
          onChange={(v) => setFromSliders({ l: Math.max(0.04, Math.min(0.96, v)) })}
        />

        <AppText variant="sectionLabel" color={colors.meta}>Saturation</AppText>
        <Spectrum
          gradient={[hslToHex(h, 0, l), hslToHex(h, 1, l)]}
          value={s}
          onChange={(v) => setFromSliders({ s: v })}
        />

        <Field
          label="Hex"
          value={hexText}
          onChangeText={onHexChange}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          placeholder="#RRGGBB"
        />

        <PrimaryButton label="Use this color" tone="accent" onPress={() => onPick(hex)} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, lineHeight: 24 },
  preview: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  bar: {
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.hairline,
    justifyContent: 'center',
  },
  thumb: {
    position: 'absolute',
    top: -2,
    width: 22,
    height: 30,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: 'transparent',
  },
});
