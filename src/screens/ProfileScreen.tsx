import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  BottomSheet,
  Icon,
  PressableScale,
  PrimaryButton,
  Screen,
  StatusChip,
  toneForStatus,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useAuth } from '../store/auth';
import { useKyc, useRetailerMe } from '../api/onboardingHooks';
import { CatalogExportKind, downloadCatalogCsv } from '../api/catalogueExport';
import { colors, radii, spacing } from '../theme/theme';

/** Profile (§account): view your retailer details, request changes, log out. */
export function ProfileScreen({ navigation }: ScreenProps<'Profile'>) {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const retailer = useAuth((s) => s.retailer);
  const logout = useAuth((s) => s.logout);
  const me = useRetailerMe(!!retailer);
  const kyc = useKyc(!!retailer);

  const profile = me.data?.retailer;
  const store = me.data?.store;

  // Prefer the fresh /retailer/me, fall back to the persisted auth snapshot.
  const legalName = profile?.legalName ?? retailer?.legalName ?? '—';
  const email = profile?.email ?? retailer?.email ?? '—';
  const phone = profile?.phone ?? retailer?.phone ?? '—';
  const gstin = profile?.gstin ?? retailer?.gstin ?? '—';
  const status = (profile?.status ?? retailer?.status ?? 'pending').toString();
  const initial = (legalName || email).trim().charAt(0).toUpperCase() || '?';

  const kycStatus = kyc.data?.status;
  const kycNeedsAction =
    kycStatus === 'pending' || kycStatus === 'overdue' || kycStatus === 'rejected';

  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<CatalogExportKind | null>(null);
  const [phase, setPhase] = useState<'idle' | 'downloading' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [doneMsg, setDoneMsg] = useState('');

  const closeExport = () => {
    setExportOpen(false);
    setExporting(null);
    setPhase('idle');
    setProgress(0);
  };

  const onExport = async (kind: CatalogExportKind) => {
    setExporting(kind);
    setProgress(0);
    setPhase('downloading');
    try {
      const { location, filename } = await downloadCatalogCsv(kind, {
        onProgress: setProgress,
      });
      setDoneMsg(location === 'downloads' ? 'Saved to Downloads' : 'Saved to Files');
      setPhase('done');
      toast.show(`Downloaded ${filename}`, 'success');
      setTimeout(closeExport, 1500);
    } catch (e: any) {
      setPhase('idle');
      setExporting(null);
      toast.show(e?.message ?? 'Could not export', 'error');
    }
  };

  const onLogout = () => {
    logout(); // the app gate swaps to the Login stack automatically
    toast.show('Logged out', 'info');
  };

  return (
    <Screen edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
            Profile
          </AppText>
        </View>

        {/* Identity */}
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <AppText variant="cardTitle" color={colors.accentInk} style={styles.avatarText}>
              {initial}
            </AppText>
          </View>
          <View style={styles.identityBody}>
            <AppText variant="cardTitle" color={colors.ink} numberOfLines={1} style={styles.name}>
              {legalName}
            </AppText>
            <StatusChip label={status.replace(/_/g, ' ')} tone={toneForStatus(status)} />
          </View>
        </View>

        {/* Details */}
        <View style={styles.card}>
          <InfoRow label="Business name" value={legalName} />
          <InfoRow label="Email" value={email} />
          <InfoRow label="Phone" value={phone} />
          <InfoRow label="GSTIN" value={gstin} />
          {store ? (
            <InfoRow label="Store" value={store.name ?? store.id} chip={store.status} />
          ) : null}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <ActionRow
            icon="create-outline"
            label="Request a change"
            hint="GST, bank, legal name & address need approval"
            onPress={() => navigation.navigate('ChangeRequest')}
          />
          <ActionRow
            icon="shield-checkmark-outline"
            label="Verification (KYC)"
            hint={kycNeedsAction ? 'Action needed' : 'View your documents'}
            tone={kycNeedsAction ? 'warning' : undefined}
            onPress={() => navigation.navigate('Kyc')}
          />
          <ActionRow
            icon="download-outline"
            label="Export catalog (CSV)"
            hint="Download your products or inventory"
            onPress={() => setExportOpen(true)}
          />
        </View>

        <PrimaryButton label="Log out" tone="ghost" onPress={onLogout} />
      </ScrollView>

      {/* Catalogue export chooser + download progress */}
      <BottomSheet
        visible={exportOpen}
        onClose={() => {
          if (phase === 'idle') setExportOpen(false);
        }}
        dismissable={phase === 'idle'}
      >
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
            Export catalog
          </AppText>

          {phase === 'idle' ? (
            <>
              <ExportRow
                icon="cube-outline"
                label="Inventory (CSV)"
                hint="Stock & pricing for reconciliation"
                onPress={() => onExport('inventory')}
              />
              <PrimaryButton
                label="Cancel"
                tone="surface"
                onPress={() => setExportOpen(false)}
              />
            </>
          ) : (
            <View style={styles.dlStatus}>
              {phase === 'done' ? (
                <View style={styles.dlDone}>
                  <Icon name="checkmark" size={30} color={colors.accentInk} />
                </View>
              ) : (
                <ActivityIndicator size="large" color={colors.ink} />
              )}
              <AppText variant="bodyMedium" color={colors.ink} style={styles.dlLabel}>
                {phase === 'done'
                  ? doneMsg
                  : `Downloading ${exporting === 'inventory' ? 'inventory' : 'products'}…`}
              </AppText>
              {phase === 'downloading' && progress > 0 ? (
                <View style={styles.progressTrack}>
                  <View
                    style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]}
                  />
                </View>
              ) : null}
            </View>
          )}
        </View>
      </BottomSheet>
    </Screen>
  );
}

function ExportRow({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: string;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={styles.actionRow}>
      <Icon name={icon} size={20} color={colors.ink} />
      <View style={styles.flex}>
        <AppText variant="bodyMedium" color={colors.ink}>
          {label}
        </AppText>
        <AppText variant="meta" color={colors.meta}>
          {hint}
        </AppText>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.meta} />
    </PressableScale>
  );
}

function InfoRow({
  label,
  value,
  chip,
}: {
  label: string;
  value: string;
  chip?: string;
}) {
  return (
    <View style={styles.infoRow}>
      <AppText variant="meta" color={colors.meta}>
        {label}
      </AppText>
      <View style={styles.infoValueRow}>
        <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1} style={styles.flex}>
          {value}
        </AppText>
        {chip ? <StatusChip label={chip.replace(/_/g, ' ')} tone={toneForStatus(chip)} /> : null}
      </View>
    </View>
  );
}

function ActionRow({
  icon,
  label,
  hint,
  tone,
  onPress,
}: {
  icon: string;
  label: string;
  hint?: string;
  tone?: 'warning';
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={styles.actionRow}>
      <Icon name={icon} size={20} color={tone === 'warning' ? colors.danger : colors.ink} />
      <View style={styles.flex}>
        <AppText variant="bodyMedium" color={colors.ink}>
          {label}
        </AppText>
        {hint ? (
          <AppText variant="meta" color={tone === 'warning' ? colors.danger : colors.meta}>
            {hint}
          </AppText>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={18} color={colors.meta} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: 120, gap: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  h1: { fontSize: 24, lineHeight: 28 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 24, lineHeight: 28 },
  identityBody: { flex: 1, gap: spacing.xs, alignItems: 'flex-start' },
  name: { fontSize: 20, lineHeight: 24 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.md,
  },
  infoRow: { gap: 2 },
  infoValueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  actions: { gap: spacing.sm },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
  dlStatus: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  dlLabel: { textAlign: 'center' },
  dlDone: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.hairline,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.ink },
});
