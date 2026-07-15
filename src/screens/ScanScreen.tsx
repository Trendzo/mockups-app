import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCodeScanner,
  type Code,
} from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  AppImage,
  AppText,
  Chip,
  Icon,
  PressableScale,
  PrimaryButton,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { colors, radii, spacing } from '../theme/theme';
import { Haptics } from '../utils/haptics';
import { ensureCameraPermission, openAppSettings, PermissionOutcome } from '../utils/permissions';
import { listRegisters, pushScan, resolveScan } from '../api/pos';
import { PosLookupRow, RegisterInfo, TARGET_ALL } from '../types/pos';
import { useScanTarget } from '../store/scanTarget';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_W * 0.32;
const MENU_HEIGHT = 60; // height the action menu expands to below the card details

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

/** Round action button in the card's expanded menu. */
function MenuBtn({
  tone,
  icon,
  onPress,
}: {
  tone: 'add' | 'skip' | 'plain';
  icon: string;
  onPress: () => void;
}) {
  const bg = tone === 'add' ? colors.success : tone === 'skip' ? colors.danger : undefined;
  const fg = tone === 'plain' ? colors.ink : colors.accentInk;
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.menuBtn, tone === 'plain' ? styles.menuBtnPlain : { backgroundColor: bg }]}
    >
      <Icon name={icon} size={20} color={fg} />
    </PressableScale>
  );
}

/**
 * QR checkout scanner. The camera stays live; on a QR the product is resolved and a card slides
 * up. Swipe RIGHT to confirm → the pick is pushed to the chosen open web Register (which adds it
 * to its cart over SSE). Swipe LEFT to dismiss and keep scanning. No billing happens here.
 */
export function ScanScreen({ navigation }: ScreenProps<'Scan'>) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const device = useCameraDevice('back');
  const [permission, setPermission] = useState<PermissionOutcome>('denied');

  const target = useScanTarget((s) => s.target);
  const setTarget = useScanTarget((s) => s.setTarget);
  const [registers, setRegisters] = useState<RegisterInfo[]>([]);

  const [card, setCard] = useState<PosLookupRow | null>(null);
  const [resolving, setResolving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [pickerContentH, setPickerContentH] = useState(0);
  const menuProgress = useSharedValue(0); // 0 = details, 1 = action menu revealed
  const pickerProgress = useSharedValue(0); // 0 = picker collapsed, 1 = expanded

  // Refs mirror state so the (stable-identity) code-scanner callback reads current values.
  const cardRef = useRef<PosLookupRow | null>(null);
  const resolvingRef = useRef(false);
  const lastCodeRef = useRef('');
  const lastAtRef = useRef(0);

  const translateX = useSharedValue(0);

  // ── Camera permission ──
  useEffect(() => {
    (async () => setPermission(await ensureCameraPermission()))();
  }, []);

  // ── Connected registers (device picker) - refresh on mount + whenever the screen refocuses ──
  const refreshRegisters = useCallback(async () => {
    try {
      const list = await listRegisters();
      setRegisters(list);
      // If the remembered target vanished, fall back to "all".
      if (target !== TARGET_ALL && !list.some((r) => r.id === target)) {
        setTarget(TARGET_ALL);
      }
    } catch {
      /* best-effort - leave the last-known list */
    }
  }, [target, setTarget]);

  useEffect(() => {
    void refreshRegisters();
    const unsub = navigation.addListener('focus', () => void refreshRegisters());
    return unsub;
  }, [navigation, refreshRegisters]);

  // Swipe-up gesture reloads the register list (replaces the old refresh button).
  const triggerReload = useCallback(() => {
    Haptics.tap();
    toast.show('Refreshing…', 'info');
    void refreshRegisters();
  }, [refreshRegisters, toast]);

  // Smoothly expand/collapse the picker whenever it toggles (gear tap, or forced
  // open when nothing is connected).
  const pickerVisible = showPicker || registers.length === 0;
  useEffect(() => {
    pickerProgress.value = withTiming(pickerVisible ? 1 : 0, {
      duration: 260,
      easing: Easing.inOut(Easing.ease),
    });
  }, [pickerVisible, pickerProgress]);

  // ── Resolve a scanned code → confirm card ──
  const handleCode = useCallback(
    async (value: string) => {
      resolvingRef.current = true;
      setResolving(true);
      try {
        const row = await resolveScan(value);
        cardRef.current = row;
        setCard(row);
        translateX.value = 0;
        Haptics.select();
      } catch {
        toast.show('No product for that code', 'error');
      } finally {
        resolvingRef.current = false;
        setResolving(false);
      }
    },
    [toast, translateX],
  );

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes: Code[]) => {
      // Gate: ignore while a card is up or a resolve is in flight.
      if (cardRef.current || resolvingRef.current) return;
      const value = codes[0]?.value;
      if (!value) return;
      // Debounce identical frames (the scanner fires many per second).
      const now = Date.now();
      if (value === lastCodeRef.current && now - lastAtRef.current < 2500) return;
      lastCodeRef.current = value;
      lastAtRef.current = now;
      void handleCode(value);
    },
  });

  // ── Menu (tap-to-expand actions) ──
  const MENU_EASE = { duration: 240, easing: Easing.inOut(Easing.ease) };
  const openMenu = useCallback(() => {
    setMenuOpen(true);
    menuProgress.value = withTiming(1, MENU_EASE);
    Haptics.tap();
  }, [menuProgress]);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    menuProgress.value = withTiming(0, MENU_EASE);
  }, [menuProgress]);

  // ── Confirm / dismiss ──
  const clearCard = useCallback(() => {
    cardRef.current = null;
    setCard(null);
    translateX.value = 0;
    setMenuOpen(false);
    menuProgress.value = 0;
    setQty(1);
    // Let the same code be re-scanned immediately after a decision.
    lastCodeRef.current = '';
  }, [translateX, menuProgress]);

  const confirmPick = useCallback(
    async (row: PosLookupRow, units: number) => {
      try {
        const delivered = await pushScan(row.variantId, target, units);
        if (delivered > 0) {
          Haptics.success();
          toast.show(`Added · ${units} × ${row.name}`, 'success');
        } else {
          Haptics.warn();
          toast.show('No register connected', 'error');
        }
      } catch {
        Haptics.error();
        toast.show('Could not add item', 'error');
      }
    },
    [target, toast],
  );

  const onConfirm = useCallback(
    (units: number) => {
      const row = cardRef.current;
      clearCard();
      if (row) void confirmPick(row, units);
    },
    [clearCard, confirmPick],
  );

  const onDismiss = useCallback(() => {
    clearCard();
  }, [clearCard]);

  // Swipe (only while the menu is closed) and tap (opens the menu) share the card. Race() picks
  // whichever activates first - a drag → pan, a stationary press → tap - so they never clash.
  const pan = Gesture.Pan()
    .enabled(!menuOpen)
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE_THRESHOLD) {
        translateX.value = withTiming(SCREEN_W, { duration: 180 });
        runOnJS(onConfirm)(1);
      } else if (e.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-SCREEN_W, { duration: 180 });
        runOnJS(onDismiss)();
      } else {
        translateX.value = withSpring(0);
      }
    });
  // Tapping the product details toggles the menu (open when closed, collapse when open). Scoped
  // to the details row so it never clashes with the menu's own buttons.
  const detailsTap = Gesture.Tap()
    .maxDuration(250)
    .onEnd(() => {
      runOnJS(menuOpen ? closeMenu : openMenu)();
    });

  // Pull down (from the top) anywhere on the scan area → reload registers.
  const reloadPan = Gesture.Pan().onEnd((e) => {
    if (e.translationY > 50 && e.velocityY > 250) {
      runOnJS(triggerReload)();
    }
  });

  // Card slides straight (no rotation).
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  // Reveal layers behind the card: green (add) shows as the card is dragged right, red (skip)
  // as it's dragged left - filling the space the card vacates.
  const greenStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, translateX.value / SWIPE_THRESHOLD)),
  }));
  const redStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, -translateX.value / SWIPE_THRESHOLD)),
  }));
  // The card container's own background - always behind the (opaque) card, so it can only show in
  // the space the card vacates as it slides. Green right = add, red left = skip.
  const stackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      translateX.value,
      [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
      [colors.danger, 'rgba(0,0,0,0)', colors.success],
    ),
  }));
  // Action menu slides up from the card's bottom edge.
  const menuStyle = useAnimatedStyle(() => ({
    height: menuProgress.value * MENU_HEIGHT,
    opacity: menuProgress.value,
  }));
  // Register picker reveal (clip to an animated fraction of its measured height).
  const pickerAnimStyle = useAnimatedStyle(() => ({
    height: pickerProgress.value * pickerContentH,
    opacity: pickerProgress.value,
  }));

  const decQty = useCallback(() => setQty((n) => Math.max(1, n - 1)), []);
  const incQty = useCallback(() => setQty((n) => Math.min(99, n + 1)), []);

  const showCamera = permission === 'granted' && device != null;
  const connected = registers.length > 0;
  // The camera only runs when at least one register is connected - otherwise there's nowhere to
  // send a scan, so we stay on a black screen with the picker/banner shown.
  const cameraLive = showCamera && connected;
  const targetLabel =
    target === TARGET_ALL
      ? 'All registers'
      : registers.find((r) => r.id === target)?.label ?? 'Selected register';

  return (
    <View style={styles.root}>
      {cameraLive && (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive
          codeScanner={codeScanner}
        />
      )}
      {!showCamera && (
        <View style={[StyleSheet.absoluteFill, styles.fallback]}>
          <AppText variant="body" color={colors.surface} style={styles.center}>
            {permission === 'blocked'
              ? 'Camera access is off. Enable it in Settings to scan.'
              : device == null
              ? 'No camera available on this device.'
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

      {/* Overlay laid out as a column: top bar in-flow, reticle centered in the free space
          below it (so the two never overlap). box-none lets camera area stay untouched. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.topRow}>
            <PressableScale onPress={() => navigation.goBack()} style={styles.pill}>
              <Icon name="close" size={22} color={colors.surface} />
            </PressableScale>
            <View style={styles.sendToPill}>
              <Icon name="tv-outline" size={14} color={colors.accentInk} />
              <AppText variant="meta" color={colors.accentInk} numberOfLines={1} style={styles.sendToText}>
                {targetLabel}
              </AppText>
            </View>
            <PressableScale onPress={() => setShowPicker((v) => !v)} style={styles.pill}>
              <Icon name="settings-outline" size={20} color={colors.surface} />
            </PressableScale>
          </View>

          {/* Register picker - expands / collapses smoothly. */}
          <Animated.View style={[styles.pickerClip, pickerAnimStyle]}>
            <View
              style={styles.pickerInner}
              onLayout={(e) => setPickerContentH(e.nativeEvent.layout.height)}
            >
              <View style={styles.pickerHead}>
                <AppText variant="meta" color={colors.meta}>
                  Send scan to
                </AppText>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                <Chip
                  label="All registers"
                  selected={target === TARGET_ALL}
                  onPress={() => setTarget(TARGET_ALL)}
                />
                {registers.map((r) => (
                  <Chip
                    key={r.id}
                    label={r.label}
                    selected={target === r.id}
                    onPress={() => setTarget(r.id)}
                  />
                ))}
              </ScrollView>

              {!connected && (
                <View style={styles.banner}>
                  <AppText variant="bodyMedium" color={colors.ink} style={styles.center}>
                    Register billing - coming soon
                  </AppText>
                  <AppText variant="meta" color={colors.meta} style={styles.center}>
                    We're putting the finishing touches on in-app register &amp; billing. Hang tight!
                  </AppText>
                </View>
              )}
            </View>
          </Animated.View>
        </View>

        {/* Scan area - swipe up to refresh; reticle shows when the camera is live. */}
        {!card && (
          <GestureDetector gesture={reloadPan}>
            <View style={styles.scanArea}>
              {cameraLive && (
                <View pointerEvents="none" style={styles.reticleBox}>
                  <View style={styles.reticle} />
                  <AppText variant="meta" color={colors.surface} style={styles.reticleHint}>
                    {resolving ? 'Looking up…' : 'Point at a product QR'}
                  </AppText>
                </View>
              )}
              <AppText variant="meta" color={colors.surface} style={styles.swipeHintReload}>
                Swipe down to refresh
              </AppText>
            </View>
          </GestureDetector>
        )}
      </View>

      {/* Product confirm card */}
      {card && (
        <GestureDetector gesture={pan}>
          <Animated.View style={styles.cardWrap}>
            <Animated.View style={[styles.cardStack, stackStyle]}>
              {/* Behind the card: action icons revealed as it slides off. */}
              <Animated.View style={[styles.revealIcon, styles.revealIconLeft, greenStyle]}>
                <Icon name="checkmark" size={28} color={colors.accentInk} />
              </Animated.View>
              <Animated.View style={[styles.revealIcon, styles.revealIconRight, redStyle]}>
                <Icon name="close" size={28} color={colors.accentInk} />
              </Animated.View>

              <Animated.View style={[styles.card, cardStyle]}>
                <GestureDetector gesture={detailsTap}>
                  <View style={styles.cardContent}>
                    <AppImage uri={card.imageUrl} radius={radii.card} containerStyle={styles.cardImage} />
                    <View style={styles.cardInfo}>
                      <AppText variant="cardTitle" color={colors.ink} numberOfLines={2} style={styles.cardName}>
                        {card.name}
                      </AppText>
                      <AppText variant="meta" color={colors.meta} numberOfLines={1}>
                        {card.attributesLabel}
                        {card.sku ? ` · ${card.sku}` : ''}
                      </AppText>
                      <View style={styles.priceRow}>
                        <AppText variant="cardTitle" color={colors.ink}>
                          {rupees(card.pricePaise)}
                        </AppText>
                        {card.compareAtPaise != null && card.compareAtPaise > card.pricePaise && (
                          <AppText variant="meta" color={colors.inkMuted} style={styles.strike}>
                            {rupees(card.compareAtPaise)}
                          </AppText>
                        )}
                      </View>
                    </View>
                  </View>
                </GestureDetector>

                {/* Tap-to-expand action menu, slides up from the card's bottom edge. */}
                <Animated.View style={[styles.menu, menuStyle]}>
                  <View style={styles.menuRow}>
                    <MenuBtn tone="skip" icon="close" onPress={onDismiss} />
                    <MenuBtn tone="plain" icon="remove" onPress={decQty} />
                    <AppText variant="cardTitle" color={colors.ink} style={styles.qtyText}>
                      {qty}
                    </AppText>
                    <MenuBtn tone="plain" icon="add" onPress={incQty} />
                    <MenuBtn tone="add" icon="checkmark" onPress={() => onConfirm(qty)} />
                  </View>
                </Animated.View>
              </Animated.View>
            </Animated.View>
            {!menuOpen && (
              <AppText variant="meta" color={colors.surface} style={styles.swipeHint}>
                Swipe right to add · left to skip · tap for options
              </AppText>
            )}
          </Animated.View>
        </GestureDetector>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  center: { textAlign: 'center' },
  settingsBtn: { marginTop: spacing.sm },

  scanArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  reticleBox: {
    alignItems: 'center',
    // Nudge the focus square up so it sits above centre.
    transform: [{ translateY: -SCREEN_H * 0.06 }],
  },
  swipeHintReload: { position: 'absolute', top: spacing.lg, alignSelf: 'center', opacity: 0.9 },
  reticle: {
    width: SCREEN_W * 0.58,
    height: SCREEN_W * 0.58,
    borderRadius: radii.card,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  reticleHint: { marginTop: spacing.md, textAlign: 'center' },

  topBar: {
    paddingHorizontal: spacing.screenH,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radii.card,
    borderBottomRightRadius: radii.card,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pill: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerClip: { overflow: 'hidden' },
  // Absolute so it lays out at its natural height regardless of the clip height,
  // giving onLayout a real measurement to animate to.
  pickerInner: { position: 'absolute', left: 0, right: 0, top: 0 },
  pickerHead: { marginTop: spacing.md },
  sendToPill: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
  },
  sendToText: { flexShrink: 1, textAlign: 'center' },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.md },
  banner: {
    backgroundColor: colors.canvas,
    borderRadius: radii.sm,
    padding: spacing.md,
    gap: spacing.xs,
  },

  // Fills the screen and centres the card; the pan gesture lives here.
  cardWrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  // Container carries the reveal colour as its own background (always behind the card child);
  // the card is opaque and slides freely over it.
  cardStack: { position: 'relative', borderRadius: radii.card },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  cardContent: { alignItems: 'stretch' },
  menu: { overflow: 'hidden' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
  },
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtnPlain: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.hairline },
  qtyText: { minWidth: 28, textAlign: 'center' },
  cardImage: { width: '100%', height: SCREEN_W * 0.7 },
  cardInfo: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  cardName: { textAlign: 'center', fontSize: 20, lineHeight: 24 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  strike: { textDecorationLine: 'line-through' },
  swipeHint: { textAlign: 'center', marginTop: spacing.sm },

  // Action icon pinned to a card edge, revealed as the card slides off that side.
  revealIcon: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center' },
  revealIconLeft: { left: spacing.lg },
  revealIconRight: { right: spacing.lg },
});
