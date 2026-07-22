import React, { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  AppText,
  BottomSheet,
  SheetSurface,
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
import { requestAccountClosure } from '../api/onboarding';
import { colors, radii, spacing } from '../theme/theme';
import { ACCOUNT_DELETION_URL, SUPPORT_URL, WEB_PORTAL_HOME_URL } from '../config/legal';

/** Profile (§account): view your retailer details, request changes, log out. */
export function ProfileScreen({ navigation }: ScreenProps<'Profile'>) {
  const toast = useToast();
  const retailer = useAuth(s => s.retailer);
  const logout = useAuth(s => s.logout);
  const me = useRetailerMe(!!retailer);
  const kyc = useKyc(!!retailer);

  const profile = me.data?.retailer;
  const store = me.data?.store;

  // Prefer the fresh /retailer/me, fall back to the persisted auth snapshot.
  const legalName = profile?.legalName ?? retailer?.legalName ?? '-';
  const email = profile?.email ?? retailer?.email ?? '-';
  const phone = profile?.phone ?? retailer?.phone ?? '-';
  const gstin = profile?.gstin ?? retailer?.gstin ?? '-';
  const status = (profile?.status ?? retailer?.status ?? 'pending').toString();
  const initial = (legalName || email).trim().charAt(0).toUpperCase() || '?';

  const subRole = profile?.subRole ?? retailer?.subRole;
  const canManageAccount = subRole === 'owner' || subRole === 'manager';
  const closurePending = me.data?.pendingAccountRequest === 'account_deletion';

  // Richer details (shown under "View more" when the backend provides them).
  // The address can arrive on either the store or the retailer object and under
  // a few possible key names, so read it defensively from the raw /retailer/me.
  const meAny = me.data as any;
  const st = (meAny?.store ?? {}) as Record<string, any>;
  const rt = (meAny?.retailer ?? {}) as Record<string, any>;
  const pan = profile?.pan ?? rt.pan ?? st.pan;
  const contactPhone = profile?.contactPhone ?? rt.contactPhone ?? st.contactPhone;
  const addressLine = st.addressLine ?? st.address ?? rt.addressLine ?? rt.address;
  const pincode = st.pincode ?? rt.pincode ?? profile?.pincode;
  const address = addressLine
    ? [addressLine, pincode].filter(Boolean).join(', ')
    : undefined;
  const [showAll, setShowAll] = useState(false);

  const kycStatus = kyc.data?.status;
  const kycNeedsAction =
    kycStatus === 'pending' ||
    kycStatus === 'overdue' ||
    kycStatus === 'rejected';

  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<CatalogExportKind | null>(null);
  const [phase, setPhase] = useState<'idle' | 'downloading' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [doneMsg, setDoneMsg] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      setDoneMsg(
        location === 'downloads' ? 'Saved to Downloads' : 'Saved to Files',
      );
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

  // Closure is now a request, not an instant delete. The account stays active until an
  // admin approves; we keep the user signed in and just refresh /retailer/me.
  const onRequestClosure = async () => {
    setDeleting(true);
    try {
      await requestAccountClosure();
      setDeleteOpen(false);
      await me.refetch();
      toast.show('Closure requested - pending admin review', 'info');
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not submit closure request', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Screen edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.headerRow}>
          <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
            Profile
          </AppText>
        </View>

        {/* Identity */}
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <AppText
              variant="cardTitle"
              color={colors.accentInk}
              style={styles.avatarText}
            >
              {initial}
            </AppText>
          </View>
          <View style={styles.identityBody}>
            <AppText
              variant="cardTitle"
              color={colors.ink}
              numberOfLines={1}
              style={styles.name}
            >
              {legalName}
            </AppText>
            <StatusChip
              label={status.replace(/_/g, ' ')}
              tone={toneForStatus(status)}
            />
          </View>
        </View>

        {/* Details */}
        <View style={styles.card}>
          <InfoRow label="Business name" value={legalName} />
          {/* Show the store NAME only - never the raw store id/number. */}
          {store && (store.name ?? profile?.storeName) ? (
            <InfoRow
              label="Store"
              value={(store.name ?? profile?.storeName)!}
              chip={store.status}
            />
          ) : null}
          {address ? <InfoRow label="Address" value={address} /> : null}
          <InfoRow label="Account status" value={status.replace(/_/g, ' ')} chip={status} />

          {showAll ? (
            <>
              <InfoRow label="Email" value={email} />
              <InfoRow label="Phone" value={phone} />
              {contactPhone ? <InfoRow label="Alternate phone" value={contactPhone} /> : null}
              <InfoRow label="GSTIN" value={gstin} />
              {pan ? <InfoRow label="PAN" value={pan} /> : null}
              {pincode ? <InfoRow label="Pincode" value={pincode} /> : null}
              {subRole ? <InfoRow label="Role" value={subRole} /> : null}
            </>
          ) : null}

          <PressableScale
            onPress={() => setShowAll((v) => !v)}
            haptic={false}
            style={styles.viewMore}
          >
            <AppText variant="meta" color={colors.ink}>
              {showAll ? 'View less' : 'View more'}
            </AppText>
            <Icon
              name={showAll ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.ink}
            />
          </PressableScale>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <ActionRow
            icon="layers-outline"
            label="Bulk Mockup"
            hint="Beta · queue mockups for many products"
            onPress={() => navigation.navigate('SelectPhotos', { bulk: true })}
          />
          <ActionRow
            icon="wallet-outline"
            label="Earnings & payouts"
            hint="Beta · unsettled amount owed & next payout"
            onPress={() => navigation.navigate('Earnings')}
          />
          <ActionRow
            icon="open-outline"
            label="Open web portal"
            hint="Billing terminal, orders, payouts & full ops"
            onPress={() => Linking.openURL(WEB_PORTAL_HOME_URL)}
          />
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
          {/* In-app viewers for the same backend-fetched docs shown at signup */}
          <ActionRow
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => navigation.navigate('LegalDoc', { kind: 'terms' })}
          />
          <ActionRow
            icon="lock-closed-outline"
            label="Privacy Policy"
            onPress={() => navigation.navigate('LegalDoc', { kind: 'privacy' })}
          />
          <ActionRow
            icon="help-circle-outline"
            label="Support"
            onPress={() => Linking.openURL(SUPPORT_URL)}
          />
          {canManageAccount ? (
            <ActionRow
              icon="trash-outline"
              label={closurePending ? 'Closure requested' : 'Request account closure'}
              tone="danger"
              onPress={() => {
                if (closurePending) {
                  toast.show('Your closure request is pending admin review', 'info');
                  return;
                }
                setDeleteOpen(true);
              }}
            />
          ) : null}
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
        <SheetSurface style={styles.sheet}>
          <AppText
            variant="cardTitle"
            color={colors.ink}
            style={styles.sheetTitle}
          >
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
              <AppText
                variant="bodyMedium"
                color={colors.ink}
                style={styles.dlLabel}
              >
                {phase === 'done'
                  ? doneMsg
                  : `Downloading ${
                      exporting === 'inventory' ? 'inventory' : 'products'
                    }…`}
              </AppText>
              {phase === 'downloading' && progress > 0 ? (
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.round(progress * 100)}%` },
                    ]}
                  />
                </View>
              ) : null}
            </View>
          )}
        </SheetSurface>
      </BottomSheet>

      <BottomSheet
        visible={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        dismissable={!deleting}
      >
        <SheetSurface style={styles.sheet}>
          <AppText
            variant="cardTitle"
            color={colors.ink}
            style={styles.sheetTitle}
          >
            Request account closure?
          </AppText>
          <AppText variant="body" color={colors.meta}>
            This sends a closure request to the Trendzo team for review. Nothing
            changes until an admin approves it. Once approved, your store is
            suspended and your account is closed - but your records are kept, and
            you can request to reopen the account anytime.
          </AppText>
          <PressableScale
            haptic={false}
            onPress={() => Linking.openURL(ACCOUNT_DELETION_URL)}
          >
            <AppText variant="bodyMedium" color={colors.ink}>
              Read account closure details
            </AppText>
          </PressableScale>
          <PrimaryButton
            label="Submit closure request"
            tone="danger"
            loading={deleting}
            onPress={onRequestClosure}
          />
          <PrimaryButton
            label="Cancel"
            tone="surface"
            disabled={deleting}
            onPress={() => setDeleteOpen(false)}
          />
        </SheetSurface>
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
        <AppText
          variant="bodyMedium"
          color={colors.ink}
          numberOfLines={1}
          style={styles.flex}
        >
          {value}
        </AppText>
        {chip ? (
          <StatusChip
            label={chip.replace(/_/g, ' ')}
            tone={toneForStatus(chip)}
          />
        ) : null}
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
  tone?: 'warning' | 'danger';
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={styles.actionRow}>
      <Icon name={icon} size={20} color={tone ? colors.danger : colors.ink} />
      <View style={styles.flex}>
        <AppText
          variant="bodyMedium"
          color={tone === 'danger' ? colors.danger : colors.ink}
        >
          {label}
        </AppText>
        {hint ? (
          <AppText variant="meta" color={tone ? colors.danger : colors.meta}>
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
  viewMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
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
  dlStatus: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
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
