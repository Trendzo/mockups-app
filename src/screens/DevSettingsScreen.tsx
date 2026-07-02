import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import {
  AppText,
  Chip,
  Field,
  PrimaryButton,
  Screen,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useSettings } from '../store/settings';
import { getHealth } from '../api/health';
import { normalizeError } from '../api/errors';
import { platformDefaultBaseUrl } from '../config/env';
import { colors, radii, spacing } from '../theme/theme';

const PRESETS = [
  { label: 'iOS sim', url: 'http://localhost:5055' },
  { label: 'Android emu', url: 'http://10.0.2.2:5055' },
];

/** Dev settings (§7/§8.5): editable base URL, MOCK mode, reachability check. */
export function DevSettingsScreen({ navigation }: ScreenProps<'DevSettings'>) {
  const toast = useToast();
  const baseUrl = useSettings((s) => s.baseUrl);
  const mock = useSettings((s) => s.mock);
  const setBaseUrl = useSettings((s) => s.setBaseUrl);
  const resetBaseUrl = useSettings((s) => s.resetBaseUrl);
  const setMock = useSettings((s) => s.setMock);

  const [draft, setDraft] = useState(baseUrl);
  const [checking, setChecking] = useState(false);

  const save = () => {
    setBaseUrl(draft);
    toast.show('Base URL saved', 'success');
  };

  const check = async () => {
    setBaseUrl(draft);
    setChecking(true);
    try {
      const res = await getHealth();
      toast.show(res.ok ? 'Server reachable ✓' : 'Unexpected response', res.ok ? 'success' : 'error');
    } catch (e) {
      toast.show(normalizeError(e).error, 'error');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.headerRow}>
          <View>
            <AppText variant="sectionLabel" color={colors.meta}>
              Developer
            </AppText>
            <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
              Dev Settings
            </AppText>
          </View>
        </View>

        {/* MOCK toggle */}
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <AppText variant="bodyMedium" color={colors.ink}>
                Mock mode
              </AppText>
              <AppText variant="meta" color={colors.meta}>
                Exercise the whole UI with placeholder data — no backend needed.
              </AppText>
            </View>
            <Switch
              value={mock}
              onValueChange={setMock}
              trackColor={{ true: colors.accent, false: colors.cardGray }}
              thumbColor={colors.surface}
            />
          </View>
        </View>

        {/* Base URL */}
        <Field
          label="API base URL"
          value={draft}
          onChangeText={setDraft}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://localhost:5055"
        />

        <View style={styles.chips}>
          {PRESETS.map((p) => (
            <Chip
              key={p.url}
              label={p.label}
              selected={draft === p.url}
              onPress={() => setDraft(p.url)}
            />
          ))}
          <Chip
            label="Reset default"
            onPress={() => {
              resetBaseUrl();
              setDraft(platformDefaultBaseUrl());
            }}
          />
        </View>

        <AppText variant="meta" color={colors.meta} style={styles.hint}>
          {Platform.OS === 'android'
            ? 'Android emulator: use 10.0.2.2. Physical device: your dev machine LAN IP, and set the backend PUBLIC_BASE_URL to the same IP.'
            : 'iOS simulator: localhost works. Physical device: your dev machine LAN IP, and set the backend PUBLIC_BASE_URL to the same IP.'}
        </AppText>

        <View style={styles.actions}>
          <PrimaryButton label="Save" tone="accent" onPress={save} />
          <PrimaryButton
            label="Test connection"
            tone="surface"
            loading={checking}
            onPress={check}
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label="Close"
          tone="ghost"
          onPress={() => navigation.goBack()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  h1: { fontSize: 24, lineHeight: 28 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hint: {},
  actions: { gap: spacing.sm },
  footer: { paddingVertical: spacing.md },
});
