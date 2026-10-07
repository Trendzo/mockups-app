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
  ListRow,
  PressableScale,
  PrimaryButton,
  Screen,
  SectionHeader,
  StatusChip,
  toneForStatus,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useAuth } from '../store/auth';
import { useKyc, useRetailerMe } from '../api/onboardingHooks';
import { useInbox } from '../api/notifications';
import { CatalogExportKind, downloadCatalogCsv } from '../api/catalogueExport';
import { useStoreGate } from '../navigation/useStoreGate';
import { usePermissions } from '../utils/usePermission';
import { colors, radii, spacing } from '../theme/theme';
import { SUPPORT_URL, WEB_PORTAL_HOME_URL } from '../config/legal';

/** Account tab: who you are, plus the menu into every store-management area. */
export function ProfileScreen({ navigation }: ScreenProps<'Profile'>) {
  const toast = useToast();
  const retailer = useAuth(s => s.retailer);
  const logout = useAuth(s => s.logout);
  const me = useRetailerMe(!!retailer);
  const gate = useStoreGate();
  const { can } = usePermissions();
  const kyc = useKyc(!!retailer);
  const inbox = useInbox(!!retailer);

  const profile = me.data?.retailer;
  const store = me.data?.store;
  const storeName = store?.legalName ?? store?.name ?? profile?.storeName;
  const posEnabled = store?.posBillingEnabled === true;
  const canCreateProducts = can('listings.create') && gate.abilities.editCatalog;

  // Prefer the fresh /retailer/me, fall back to the persisted auth snapshot.
  const legalName = profile?.legalName ?? retailer?.legalName ?? '-';
  const email = profile?.email ?? retailer?.email ?? '-';
  const phone = profile?.phone ?? retailer?.phone ?? '-';
  const gstin = profile?.gstin ?? retailer?.gstin ?? '-';
  const status = (profile?.status ?? retailer?.status ?? 'pending').toString();
  const initial = (legalName || email).trim().charAt(0).toUpperCase() || '?';

  const subRole = profile?.subRole ?? retailer?.subRole;
  // Closure is filed (with a reason) on AccountStatus; this row only shows who may.
  const canRequestClosure =
    (profile?.status ?? retailer?.status) === 'active' &&
    can('change_requests.submit') &&
    (subRole === 'owner' || subRole === 'manager');
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

  return (
    <Screen edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.headerRow}>
          <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
            Account
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
          {store && storeName ? (
            <InfoRow label="Store" value={storeName} chip={store.status} />
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

        {/* Store */}
        <View style={styles.actions}>
          <SectionHeader label="Store" />
          <ListRow
            icon="storefront-outline"
            label="Store profile"
            hint="Contact, photos, hours, address, legal & bank"
            onPress={() => navigation.navigate('StoreProfile')}
          />
          <ListRow
            icon="power-outline"
            label="Storefront & GST"
            hint="Online status, pause, GST scheme, counter billing"
            onPress={() => navigation.navigate('StoreStatus')}
          />
          <ListRow
            icon="calendar-outline"
            label="Holiday calendar"
            hint="Block orders on days you're closed"
            onPress={() => navigation.navigate('HolidayCalendar')}
          />
          <ListRow
            icon="time-outline"
            label="Pickup slots"
            hint="Windows and capacity for store pickup"
            onPress={() => navigation.navigate('PickupSlots')}
          />
        </View>

        {/* Sales & money */}
        <View style={styles.actions}>
          <SectionHeader label="Sales & money" />
          {gate.mode === 'restricted' && !gate.abilities.counterBilling ? null : (
            <ListRow
              icon="receipt-outline"
              label="Billing counter"
              hint={posEnabled ? 'Bill walk-in customers' : 'Request activation to bill in-store sales'}
              onPress={() => navigation.navigate('Register')}
            />
          )}
          {posEnabled ? (
            <ListRow
              icon="stats-chart-outline"
              label="Counter sales"
              hint="Bills, receipts and the day's cash"
              onPress={() => navigation.navigate('PosSales')}
            />
          ) : null}
          <ListRow
            icon="wallet-outline"
            label="Earnings & payouts"
            hint="What you're owed and the next payout"
            onPress={() => navigation.navigate('Earnings')}
          />
          <ListRow
            icon="cash-outline"
            label="Payout history"
            hint="Every settlement to your bank"
            onPress={() => navigation.navigate('Payouts')}
          />
        </View>

        {/* Products */}
        <View style={styles.actions}>
          <SectionHeader label="Products" />
          <ListRow
            icon="layers-outline"
            label="Inventory"
            hint="Stock, prices and low-stock alerts"
            onPress={() => navigation.navigate('Inventory')}
          />
          {canCreateProducts ? (
            <ListRow
              icon="albums-outline"
              label="Create many products"
              hint="Beta · queue AI product photos for many garments"
              onPress={() => navigation.navigate('SelectPhotos', { bulk: true })}
            />
          ) : null}
          <ListRow
            icon="download-outline"
            label="Export catalog (CSV)"
            hint="Download your products or inventory"
            onPress={() => setExportOpen(true)}
          />
        </View>

        {/* Account */}
        <View style={styles.actions}>
          <SectionHeader label="Account" />
          <ListRow
            icon="notifications-outline"
            label="Notifications"
            hint="Inbox and alert settings"
            badge={inbox.unread}
            onPress={() => navigation.navigate('Notifications')}
          />
          <ListRow
            icon="shield-checkmark-outline"
            label="Verification (KYC)"
            hint={kycNeedsAction ? 'Action needed' : 'View your documents'}
            tone={kycNeedsAction ? 'warning' : undefined}
            onPress={() => navigation.navigate('Kyc')}
          />
          <ListRow
            icon="create-outline"
            label="Request a change"
            hint="GST, bank, legal name & address need approval"
            onPress={() => navigation.navigate('ChangeRequest')}
          />
          <ListRow
            icon="person-circle-outline"
            label="Account status"
            hint="Closure, reopening and messages from Trendzo"
            onPress={() => navigation.navigate('AccountStatus')}
          />
          <ListRow
            icon="open-outline"
            label="Open web portal"
            hint="Full store dashboard on the web"
            onPress={() => Linking.openURL(WEB_PORTAL_HOME_URL)}
          />
          {/* In-app viewers for the same backend-fetched docs shown at signup */}
          <ListRow
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => navigation.navigate('LegalDoc', { kind: 'terms' })}
          />
          <ListRow
            icon="lock-closed-outline"
            label="Privacy Policy"
            onPress={() => navigation.navigate('LegalDoc', { kind: 'privacy' })}
          />
          <ListRow
            icon="help-circle-outline"
            label="Support"
            onPress={() => Linking.openURL(SUPPORT_URL)}
          />
          {canRequestClosure ? (
            <ListRow
              icon="trash-outline"
              label={closurePending ? 'Closure requested' : 'Request account closure'}
              hint="Add a reason and send it for review"
              tone="danger"
              onPress={() => navigation.navigate('AccountStatus')}
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
            style={styles.chipCenter}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Clears the floating tab bar and the restriction strip above it.
  content: { paddingTop: spacing.md, paddingBottom: 170, gap: spacing.lg },
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
  chipCenter: { alignSelf: 'center' },
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
