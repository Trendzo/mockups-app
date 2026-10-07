import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Modal, StyleSheet, View } from 'react-native';
import { Camera, useCameraDevice, useCodeScanner, type Code } from 'react-native-vision-camera';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { PrimaryButton } from './PrimaryButton';
import { ensureCameraPermission, openAppSettings, PermissionOutcome } from '../utils/permissions';
import { Haptics } from '../utils/haptics';
import { colors, radii, spacing } from '../theme/theme';

const { width: SCREEN_W } = Dimensions.get('window');

/**
 * Full-screen camera that reads one product code (Trendzo QR, EAN/UPC barcode
 * or Code-128 SKU label) and hands it back. Used by the billing counter's
 * "scan to add" — unlike the Scan screen it never talks to a web register.
 */
export function CodeScannerModal({
  visible,
  onClose,
  onCode,
  hint = 'Point at a product QR or barcode',
}: {
  visible: boolean;
  onClose: () => void;
  onCode: (value: string) => void;
  hint?: string;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* Same reason as BottomSheet: a Modal is its own window, outside the
          app-root gesture + safe-area providers. */}
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          {visible ? <ScannerBody onClose={onClose} onCode={onCode} hint={hint} /> : null}
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}

function ScannerBody({
  onClose,
  onCode,
  hint,
}: {
  onClose: () => void;
  onCode: (value: string) => void;
  hint: string;
}) {
  const insets = useSafeAreaInsets();
  const device = useCameraDevice('back');
  const [permission, setPermission] = useState<PermissionOutcome | null>(null);
  // The scanner fires many frames per second; hand back exactly one code.
  const doneRef = useRef(false);

  useEffect(() => {
    (async () => setPermission(await ensureCameraPermission()))();
  }, []);

  const scanner = useCodeScanner({
    codeTypes: ['qr', 'ean-13', 'ean-8', 'upc-a', 'upc-e', 'code-128', 'code-39'],
    onCodeScanned: (codes: Code[]) => {
      const value = codes[0]?.value;
      if (!value || doneRef.current) return;
      doneRef.current = true;
      Haptics.select();
      onCode(value);
    },
  });

  const live = permission === 'granted' && device != null;

  return (
    <View style={styles.root}>
      {live ? (
        <Camera style={StyleSheet.absoluteFill} device={device} isActive codeScanner={scanner} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallback]}>
          <AppText variant="body" color={colors.surface} style={styles.center}>
            {permission === 'blocked'
              ? 'Camera access is off. Enable it in Settings to scan.'
              : permission && device == null
                ? 'No camera available on this device.'
                : 'Requesting camera…'}
          </AppText>
          {permission === 'blocked' ? (
            <PrimaryButton label="Open Settings" tone="surface" fullWidth={false} onPress={openAppSettings} />
          ) : null}
        </View>
      )}

      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <PressableScale onPress={onClose} style={styles.close} toScale={0.9}>
          <Icon name="close" size={22} color={colors.ink} />
        </PressableScale>
      </View>

      {live ? (
        <View pointerEvents="none" style={styles.reticleWrap}>
          <View style={styles.reticle} />
          <AppText variant="bodyMedium" color={colors.surface} style={styles.hint}>
            {hint}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  fallback: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  center: { textAlign: 'center' },
  top: { position: 'absolute', left: spacing.screenH, right: spacing.screenH, top: 0 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticle: {
    width: SCREEN_W * 0.7,
    height: SCREEN_W * 0.45,
    borderRadius: radii.card,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  hint: { marginTop: spacing.md, textAlign: 'center' },
});
