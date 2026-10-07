import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { launchImageLibrary, type ImageLibraryOptions } from 'react-native-image-picker';
import {
  AppImage,
  AppText,
  Banner,
  DetailRow,
  Divider,
  EmptyState,
  Field,
  FilterChips,
  Icon,
  ImageViewer,
  KeyboardStickyView,
  ListRow,
  Panel,
  PressableScale,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SectionHeader,
  StatusChip,
  TimeSelect,
  ToggleRow,
  toneForStatus,
  useToast,
} from '../components';
import type { FilterOption, StatusTone } from '../components';
import { ScreenProps, StoreProfileTab } from '../navigation/types';
import { useRetailerMe } from '../api/onboardingHooks';
import { useFees } from '../api/earningsHooks';
import { errorMessage } from '../api/request';
import { uploadToFolder } from '../api/storeSettings';
import {
  useSaveStoreHours,
  useStoreBank,
  useStoreDocuments,
  useStoreHours,
  useSubmitStoreDocument,
  useUpdateStoreProfile,
} from '../api/storeSettingsHooks';
import { useAuth } from '../store/auth';
import { RetailerProfile, Store } from '../types/onboarding';
import {
  canManageStore,
  DayHours,
  DEFAULT_DAY_HOURS,
  MAX_STORE_PHOTOS,
  StoreDocument,
  StoreHours,
  WEEK,
  Weekday,
} from '../types/store';
import { formatDate, formatHm, hmToMinutes } from '../utils/format';
import { prepareUpload } from '../utils/image';
import { nationalPhone, toE164 } from '../utils/phone';
import { colors, radii, spacing } from '../theme/theme';

type Nav = ScreenProps<'StoreProfile'>['navigation'];

interface TabProps {
  store: Store;
  canManage: boolean;
  navigation: Nav;
  onRefresh: () => Promise<unknown>;
}

const TABS: FilterOption<StoreProfileTab>[] = [
  { value: 'basics', label: 'Basics' },
  { value: 'photos', label: 'Photos' },
  { value: 'hours', label: 'Hours' },
  { value: 'address', label: 'Address' },
  { value: 'legal', label: 'Legal & bank' },
  { value: 'documents', label: 'Documents' },
];

const READ_ONLY_NOTE = 'Only the owner or a manager can change this.';
const MOBILE_RE = /^[6-9]\d{9}$/;
const NO_HOURS: StoreHours = {};
const PICK_PHOTO: ImageLibraryOptions = {
  mediaType: 'photo',
  selectionLimit: 1,
  quality: 0.9,
  maxWidth: 2400,
  maxHeight: 2400,
};

/** Stored numbers can be "+91…" (signup sends E.164); the field edits the 10 digits. */
const toNational = (phone?: string | null) =>
  nationalPhone(phone ?? '').replace(/\D/g, '').slice(-10);

const schemeLabel = (scheme?: string | null) =>
  scheme === 'regular' ? 'Regular' : scheme === 'composition' ? 'Composition' : '—';

/** Basis points → "10%" / "2.5%". */
const formatPercent = (bp: number) => `${Number((bp / 100).toFixed(2))}%`;

const sameHours = (a: DayHours, b: DayHours) =>
  a.closed === b.closed && a.from === b.from && a.to === b.to;

/** An open day whose closing time isn't after its opening time. */
const badRange = (h: DayHours) => !h.closed && !(hmToMinutes(h.from) < hmToMinutes(h.to));

const hoursLabel = (h: DayHours) =>
  h.closed ? 'Closed' : `${formatHm(h.from)} – ${formatHm(h.to)}`;

const needsUpload = (doc: StoreDocument) => doc.status === 'missing' || doc.status === 'rejected';

const isForbidden = (e: unknown) => (e as { status?: number } | null)?.status === 403;

function pennyDrop(status: string): { label: string; tone: StatusTone } {
  const s = status.toLowerCase();
  if (s === 'verified' || s === 'success') return { label: 'verified', tone: 'success' };
  if (s === 'failed' || s === 'failure' || s === 'rejected') return { label: 'failed', tone: 'danger' };
  return { label: s.replace(/_/g, ' '), tone: 'pending' };
}

/**
 * Store profile: what customers and Trendzo know about the store. Contact info,
 * photos and hours are self-serve; legal name, GSTIN, address and bank are
 * KYC-protected and change through a change request.
 */
export function StoreProfileScreen({ navigation, route }: ScreenProps<'StoreProfile'>) {
  const me = useRetailerMe();
  const authSubRole = useAuth((s) => s.retailer?.subRole);
  const canManage = canManageStore(me.data?.retailer.subRole ?? authSubRole);
  const store = me.data?.store ?? null;
  const retailer = me.data?.retailer;
  const refetchMe = me.refetch;

  const initialTab = route.params?.tab ?? 'basics';
  const [tab, setTab] = useState<StoreProfileTab>(initialTab);
  // Tabs stay mounted once opened, so unsaved edits survive a tab switch.
  const [opened, setOpened] = useState<StoreProfileTab[]>([initialTab]);
  const openTab = useCallback((next: StoreProfileTab) => {
    setTab(next);
    setOpened((list) => (list.includes(next) ? list : [...list, next]));
  }, []);

  // Navigating here again with a `tab` (e.g. Storefront & GST → Store hours).
  const paramTab = route.params?.tab;
  useEffect(() => {
    if (paramTab) openTab(paramTab);
  }, [paramTab, openTab]);

  const renderTab = (key: StoreProfileTab, s: Store) => {
    const common = { store: s, canManage, navigation, onRefresh: refetchMe };
    switch (key) {
      case 'basics':
        return <BasicsTab {...common} retailer={retailer} />;
      case 'photos':
        return <PhotosTab {...common} />;
      case 'hours':
        return <HoursTab canManage={canManage} />;
      case 'address':
        return <AddressTab {...common} />;
      case 'legal':
        return <LegalTab {...common} retailer={retailer} />;
      case 'documents':
        return <DocumentsTab canManage={canManage} navigation={navigation} />;
    }
  };

  return (
    <Screen edges={['top']}>
      <View style={styles.top}>
        <ScreenHeader
          overline="Store"
          title={store?.legalName || 'Store profile'}
          onBack={() => navigation.goBack()}
        />
        {store ? (
          <>
            <StatusChip
              label={store.status.replace(/_/g, ' ')}
              tone={toneForStatus(store.status)}
            />
            <FilterChips options={TABS} value={tab} onChange={openTab} style={styles.tabs} />
          </>
        ) : null}
      </View>

      {me.isLoading ? (
        <ActivityIndicator color={colors.ink} style={styles.loader} />
      ) : !me.data ? (
        <Banner
          tone="danger"
          title="Couldn't load your store"
          message={errorMessage(me.error, 'Check your connection and try again.')}
          actionLabel="Retry"
          onAction={() => refetchMe()}
        />
      ) : !store ? (
        <EmptyState
          icon="storefront-outline"
          title="No store yet"
          message="Your store profile shows up here once Trendzo finishes setting it up."
        />
      ) : (
        <View style={styles.flex}>
          {opened.map((key) => (
            <View key={key} style={key === tab ? styles.flex : styles.hidden}>
              {renderTab(key, store)}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

// ---- Basics ----

function BasicsTab({
  store,
  retailer,
  canManage,
  navigation,
  onRefresh,
}: TabProps & { retailer?: RetailerProfile }) {
  const toast = useToast();
  const update = useUpdateStoreProfile();
  const savedPhone = toNational(store.contactPhone);
  const savedManager = store.managerName?.trim() ?? '';
  // null = untouched: the field shows the live value until the retailer edits it.
  const [phoneDraft, setPhoneDraft] = useState<string | null>(null);
  const [managerDraft, setManagerDraft] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const phone = phoneDraft ?? savedPhone;
  const manager = managerDraft ?? savedManager;
  const dirty = phone !== savedPhone || manager.trim() !== savedManager;

  const saveContact = () => {
    if (!dirty || update.isPending) return;
    const phoneChanged = phone !== savedPhone;
    if (phoneChanged && phone && !MOBILE_RE.test(phone)) {
      setPhoneError('Enter a valid 10-digit mobile number');
      return;
    }
    update.mutate(
      {
        // An untouched number goes back exactly as stored.
        contactPhone: phoneChanged
          ? phone
            ? toE164(phone)
            : null
          : store.contactPhone?.trim() || null,
        managerName: manager.trim() || null,
      },
      {
        onSuccess: () => {
          setPhoneDraft(null);
          setManagerDraft(null);
          toast.show('Contact info saved', 'success');
        },
        onError: (e) => toast.show(errorMessage(e, "Couldn't save contact info"), 'error'),
      },
    );
  };

  return (
    <TabScroll onRefresh={onRefresh}>
      <Panel title="Business">
        <DetailRow label="Legal name" value={store.legalName || retailer?.legalName || '—'} />
        <DetailRow label="GSTIN" value={store.gstin || retailer?.gstin || '—'} />
        <FactRow label="GST scheme">
          <AppText variant="body" color={colors.ink}>
            {schemeLabel(store.gstScheme)}
          </AppText>
          {canManage ? (
            <TextLink label="Change" onPress={() => navigation.navigate('StoreStatus')} />
          ) : null}
        </FactRow>
        <DetailRow label="State code" value={store.stateCode || '—'} />
        <FactRow label="Status">
          <StatusChip label={store.status.replace(/_/g, ' ')} tone={toneForStatus(store.status)} />
        </FactRow>
      </Panel>

      <AppText variant="meta" color={colors.meta}>
        Legal details (name, GSTIN, address) are protected by KYC. Submit a change request to
        update them.
      </AppText>
      <ListRow
        icon="create-outline"
        label="Request a change"
        hint="Legal name, GSTIN, address or bank"
        onPress={() => navigation.navigate('ChangeRequest')}
      />

      <Panel title="Contact">
        {canManage ? (
          <>
            <View style={styles.fieldWrap}>
              <Field
                label="Contact phone"
                prefix="+91"
                boxed
                value={phone}
                onChangeText={(t) => {
                  setPhoneDraft(t.replace(/\D/g, ''));
                  setPhoneError(null);
                }}
                placeholder="9876543210"
                keyboardType="phone-pad"
                maxLength={10}
                error={phoneError}
              />
              {phoneError ? null : (
                <AppText variant="meta" color={colors.meta} style={styles.fieldHint}>
                  Shown to customers
                </AppText>
              )}
            </View>
            <Field
              label="Manager name"
              boxed
              value={manager}
              onChangeText={setManagerDraft}
              placeholder="Who runs the store day to day"
              autoCapitalize="words"
              maxLength={80}
            />
            <PrimaryButton
              label="Save contact info"
              tone="accent"
              disabled={!dirty}
              loading={update.isPending}
              onPress={saveContact}
            />
          </>
        ) : (
          <>
            <DetailRow label="Contact phone" value={savedPhone ? `+91 ${savedPhone}` : '—'} />
            <DetailRow label="Manager" value={savedManager || '—'} />
            <ReadOnlyNote />
          </>
        )}
      </Panel>
    </TabScroll>
  );
}

// ---- Photos ----

type PhotoCell = { kind: 'photo'; url: string; index: number } | { kind: 'add' };

function PhotosTab({ store, canManage, onRefresh }: TabProps) {
  const toast = useToast();
  const update = useUpdateStoreProfile();
  const [uploading, setUploading] = useState(false);
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const photos = useMemo(() => store.galleryImageUrls ?? [], [store.galleryImageUrls]);
  const busy = uploading || update.isPending;
  const canAdd = canManage && photos.length < MAX_STORE_PHOTOS;

  const addPhoto = async () => {
    if (busy || !canAdd) return;
    const res = await launchImageLibrary(PICK_PHOTO);
    if (res.errorCode) {
      toast.show(res.errorMessage || "Couldn't open your photos", 'error');
      return;
    }
    const uri = res.assets?.[0]?.uri;
    if (!uri) return;
    setUploading(true);
    try {
      const url = await uploadToFolder(await prepareUpload(uri), 'store-gallery');
      // The list is replaced as a whole, so send every photo plus the new one.
      await update.mutateAsync({
        galleryImageUrls: [...photos, url].slice(0, MAX_STORE_PHOTOS),
      });
      toast.show('Photos saved', 'success');
    } catch (e) {
      toast.show(errorMessage(e, "Couldn't add the photo"), 'error');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (index: number) =>
    Alert.alert('Remove this photo?', 'Customers will no longer see it on your store page.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setRemovingIndex(index);
          update.mutate(
            { galleryImageUrls: photos.filter((_, i) => i !== index) },
            {
              onSuccess: () => toast.show('Photos saved', 'success'),
              onError: (e) => toast.show(errorMessage(e, "Couldn't remove the photo"), 'error'),
              onSettled: () => setRemovingIndex(null),
            },
          );
        },
      },
    ]);

  const cells: PhotoCell[] = photos.map((url, index) => ({ kind: 'photo', url, index }));
  if (canAdd) cells.push({ kind: 'add' });
  const rows: PhotoCell[][] = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(cells.slice(i, i + 2));

  return (
    <TabScroll onRefresh={onRefresh}>
      <AppText variant="body" color={colors.meta}>
        Add up to {MAX_STORE_PHOTOS} photos of your storefront. Customers see these on your store
        page.
      </AppText>

      {rows.length ? (
        <View style={styles.grid}>
          {rows.map((row, r) => (
            <View key={`row-${r}`} style={styles.gridRow}>
              {row.map((cell) =>
                cell.kind === 'add' ? (
                  <AddPhotoTile
                    key="add"
                    uploading={uploading}
                    disabled={busy && !uploading}
                    onPress={addPhoto}
                  />
                ) : (
                  <PhotoTile
                    key={`${cell.index}-${cell.url}`}
                    url={cell.url}
                    removing={removingIndex === cell.index}
                    disabled={busy}
                    onOpen={() => setViewerIndex(cell.index)}
                    onRemove={canManage ? () => removePhoto(cell.index) : undefined}
                  />
                ),
              )}
              {row.length === 1 ? <View style={styles.tileSpacer} /> : null}
            </View>
          ))}
        </View>
      ) : (
        <EmptyState icon="images-outline" title="No photos yet" />
      )}

      {canManage ? (
        <AppText variant="meta" color={colors.meta}>
          {photos.length} of {MAX_STORE_PHOTOS} photos
        </AppText>
      ) : (
        <ReadOnlyNote />
      )}

      {viewerIndex != null ? (
        <ImageViewer
          visible
          images={photos.map((url) => ({ url }))}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </TabScroll>
  );
}

function PhotoTile({
  url,
  removing,
  disabled,
  onOpen,
  onRemove,
}: {
  url: string;
  removing: boolean;
  disabled: boolean;
  onOpen: () => void;
  onRemove?: () => void;
}) {
  return (
    <PressableScale onPress={onOpen} toScale={0.98} haptic={false} style={styles.tile}>
      <AppImage uri={url} radius={radii.card} containerStyle={styles.tileFill} />
      {removing ? (
        <View style={styles.tileBusy}>
          <ActivityIndicator color={colors.accentInk} />
        </View>
      ) : onRemove ? (
        <PressableScale
          onPress={onRemove}
          disabled={disabled}
          toScale={0.9}
          accessibilityLabel="Remove photo"
          style={styles.tileRemove}
        >
          <Icon name="close" size={16} color={colors.surface} />
        </PressableScale>
      ) : null}
    </PressableScale>
  );
}

function AddPhotoTile({
  uploading,
  disabled,
  onPress,
}: {
  uploading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      toScale={0.98}
      haptic={false}
      style={[styles.tile, styles.addTile]}
    >
      {uploading ? (
        <ActivityIndicator color={colors.ink} />
      ) : (
        <>
          <Icon name="add" size={26} color={colors.ink} />
          <AppText variant="meta" color={colors.ink}>
            Add photo
          </AppText>
        </>
      )}
    </PressableScale>
  );
}

// ---- Hours ----

function HoursTab({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const hoursQ = useStoreHours();
  const save = useSaveStoreHours();
  // Only touched days live here; everything else reads from the server copy.
  const [edits, setEdits] = useState<StoreHours>({});
  const saved = hoursQ.data ?? NO_HOURS;

  const valueOf = (day: Weekday): DayHours => edits[day] ?? saved[day] ?? DEFAULT_DAY_HOURS;
  const dirty = WEEK.some(({ key }) => {
    const edit = edits[key];
    return !!edit && !sameHours(edit, saved[key] ?? DEFAULT_DAY_HOURS);
  });
  const valid = WEEK.every(({ key }) => !badRange(valueOf(key)));

  const setDay = (day: Weekday, patch: Partial<DayHours>) =>
    setEdits((prev) => ({
      ...prev,
      [day]: { ...(prev[day] ?? saved[day] ?? DEFAULT_DAY_HOURS), ...patch },
    }));

  const copyMonday = () => {
    const monday = valueOf('monday');
    if (badRange(monday)) {
      toast.show("Fix Monday's hours first", 'error');
      return;
    }
    const next: StoreHours = {};
    WEEK.forEach(({ key }) => {
      next[key] = { ...monday };
    });
    setEdits(next);
  };

  const onSave = () => {
    if (!dirty || !valid || save.isPending) return;
    save.mutate(
      { ...saved, ...edits },
      {
        onSuccess: () => {
          setEdits({});
          toast.show('Hours saved', 'success');
        },
        onError: (e) => toast.show(errorMessage(e, "Couldn't save your hours"), 'error'),
      },
    );
  };

  if (hoursQ.isLoading) return <ActivityIndicator color={colors.ink} style={styles.loader} />;
  // Only when nothing ever loaded: a failed refresh keeps the editor (and its edits).
  if (hoursQ.isError && hoursQ.data === undefined) {
    return (
      <Banner
        tone="danger"
        title="Couldn't load your hours"
        message={errorMessage(hoursQ.error, 'Check your connection and try again.')}
        actionLabel="Retry"
        onAction={() => hoursQ.refetch()}
        style={styles.tabBanner}
      />
    );
  }

  return (
    <View style={styles.flex}>
      <TabScroll onRefresh={hoursQ.refetch}>
        <SectionHeader
          label="Opening hours"
          actionLabel={canManage ? 'Copy Monday to all days' : undefined}
          onAction={canManage ? copyMonday : undefined}
        />
        <Panel>
          {WEEK.map(({ key, label }, i) => (
            <React.Fragment key={key}>
              {i > 0 ? <Divider /> : null}
              {canManage ? (
                <DayEditor
                  label={label}
                  value={valueOf(key)}
                  onChange={(patch) => setDay(key, patch)}
                />
              ) : (
                <DetailRow label={label} value={hoursLabel(valueOf(key))} />
              )}
            </React.Fragment>
          ))}
        </Panel>
        <AppText variant="meta" color={colors.meta}>
          When you go offline from Home, your store reopens automatically at the next opening time
          set here.
        </AppText>
        {canManage ? null : <ReadOnlyNote />}
      </TabScroll>

      {canManage ? (
        <KeyboardStickyView style={styles.footer} minBottom={spacing.sm}>
          <PrimaryButton
            label="Save hours"
            tone="accent"
            disabled={!dirty || !valid}
            loading={save.isPending}
            onPress={onSave}
          />
        </KeyboardStickyView>
      ) : null}
    </View>
  );
}

function DayEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DayHours;
  onChange: (patch: Partial<DayHours>) => void;
}) {
  return (
    <View style={styles.day}>
      <ToggleRow
        label={label}
        hint={value.closed ? 'Closed all day' : undefined}
        value={!value.closed}
        onChange={(open) => onChange({ closed: !open })}
      />
      {value.closed ? null : (
        <View style={styles.timeRow}>
          <TimeSelect
            compact
            label={`${label} opens`}
            value={value.from}
            onChange={(from) => onChange({ from })}
          />
          <AppText variant="meta" color={colors.meta}>
            to
          </AppText>
          <TimeSelect
            compact
            label={`${label} closes`}
            value={value.to}
            onChange={(to) => onChange({ to })}
          />
        </View>
      )}
      {badRange(value) ? (
        <AppText variant="meta" color={colors.danger}>
          Closing time must be after opening time
        </AppText>
      ) : null}
    </View>
  );
}

// ---- Address ----

function AddressTab({ store, navigation, onRefresh }: TabProps) {
  const toast = useToast();
  const { lat, lng } = store;
  const pinned = typeof lat === 'number' && typeof lng === 'number';

  const openMap = () => {
    if (!pinned) return;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`).catch(() =>
      toast.show("Couldn't open maps", 'error'),
    );
  };

  return (
    <TabScroll onRefresh={onRefresh}>
      <Panel
        title="Store address"
        actionLabel={pinned ? 'View on map' : undefined}
        onAction={pinned ? openMap : undefined}
      >
        <AppText variant="body" color={store.address ? colors.ink : colors.meta}>
          {store.address || 'No address on file'}
        </AppText>
        <Divider />
        <DetailRow
          label="Coordinates"
          value={pinned ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : '—'}
        />
        <DetailRow label="State code" value={store.stateCode || '—'} />
      </Panel>

      <AppText variant="meta" color={colors.meta}>
        Your address is protected by KYC. Submit a change request to update it.
      </AppText>
      <ListRow
        icon="location-outline"
        label="Request address change"
        hint="Attach proof — Trendzo reviews it before it goes live"
        onPress={() => navigation.navigate('ChangeRequest')}
      />
    </TabScroll>
  );
}

// ---- Legal & bank ----

function LegalTab({
  store,
  retailer,
  navigation,
  onRefresh,
}: TabProps & { retailer?: RetailerProfile }) {
  const bankQ = useStoreBank();
  const feesQ = useFees();
  const bank = bankQ.data;
  // Prefer the live fee schedule; /retailer/me carries the same numbers as a fallback.
  const feeBp = feesQ.data?.platformFeeBp ?? store.platformFeeBp;
  const cadence = feesQ.data?.payoutCadenceDays ?? store.payoutCadenceDays;
  const verification = bank?.pennyDropStatus ? pennyDrop(bank.pennyDropStatus) : null;

  const refresh = () => Promise.all([onRefresh(), bankQ.refetch(), feesQ.refetch()]);

  return (
    <TabScroll onRefresh={refresh}>
      <Panel title="Legal">
        <DetailRow label="Legal name" value={store.legalName || retailer?.legalName || '—'} />
        <DetailRow label="GSTIN" value={store.gstin || retailer?.gstin || '—'} />
        {retailer?.pan ? <DetailRow label="PAN" value={retailer.pan} /> : null}
        <DetailRow label="State code" value={store.stateCode || '—'} />
      </Panel>

      <Panel title="Bank account">
        {bankQ.isLoading ? (
          // About the loaded panel's height, so the fees below don't jump.
          <ActivityIndicator color={colors.ink} style={styles.bankLoading} />
        ) : bankQ.isError && bank === undefined ? (
          isForbidden(bankQ.error) ? (
            <ReadOnlyNote message="Only the owner or a manager can see bank details." />
          ) : (
            <Banner
              tone="danger"
              title="Couldn't load bank details"
              message={errorMessage(bankQ.error, 'Check your connection and try again.')}
              actionLabel="Retry"
              onAction={() => bankQ.refetch()}
            />
          )
        ) : bank ? (
          <>
            <DetailRow label="Account holder" value={bank.accountHolderName} />
            <DetailRow label="Account number" value={bank.accountNumber} />
            <DetailRow label="IFSC" value={bank.ifsc} />
            {bank.bankName ? <DetailRow label="Bank" value={bank.bankName} /> : null}
            {verification ? (
              <FactRow label="Verification">
                <StatusChip label={verification.label} tone={verification.tone} />
              </FactRow>
            ) : null}
            {verification?.tone === 'success' && bank.pennyDropAt ? (
              <AppText variant="meta" color={colors.meta}>
                Verified on {formatDate(bank.pennyDropAt)}
              </AppText>
            ) : null}
          </>
        ) : (
          <AppText variant="body" color={colors.meta}>
            No bank account on file
          </AppText>
        )}
      </Panel>

      {feeBp != null || cadence ? (
        <Panel title="Fees & payouts">
          {feeBp != null ? <DetailRow label="Platform fee" value={formatPercent(feeBp)} /> : null}
          {cadence ? (
            <DetailRow
              label="Payouts"
              value={cadence === 1 ? 'Every day' : `Every ${cadence} days`}
            />
          ) : null}
        </Panel>
      ) : null}

      <AppText variant="meta" color={colors.meta}>
        Legal and bank details are protected by KYC. Submit a change request to update them.
      </AppText>
      <ListRow
        icon="card-outline"
        label="Request bank change"
        hint="Payouts move to the new account once it's approved"
        onPress={() => navigation.navigate('ChangeRequest')}
      />
    </TabScroll>
  );
}

// ---- Documents ----

function DocumentsTab({ canManage, navigation }: { canManage: boolean; navigation: Nav }) {
  const toast = useToast();
  const docsQ = useStoreDocuments();
  const submitDoc = useSubmitStoreDocument();
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const docs = docsQ.data ?? [];

  const upload = async (doc: StoreDocument) => {
    if (uploadingId) return;
    const res = await launchImageLibrary(PICK_PHOTO);
    if (res.errorCode) {
      toast.show(res.errorMessage || "Couldn't open your photos", 'error');
      return;
    }
    const uri = res.assets?.[0]?.uri;
    if (!uri) return;
    setUploadingId(doc.id);
    try {
      const url = await uploadToFolder(await prepareUpload(uri), 'kyc');
      await submitDoc.mutateAsync({ id: doc.id, url });
      toast.show(`${doc.label} sent for review`, 'success');
    } catch (e) {
      toast.show(errorMessage(e, 'Upload failed'), 'error');
    } finally {
      setUploadingId(null);
    }
  };

  const view = (url: string) =>
    Linking.openURL(url).catch(() => toast.show("Couldn't open the file", 'error'));

  return (
    <TabScroll onRefresh={docsQ.refetch}>
      <AppText variant="body" color={colors.meta}>
        Compliance documents Trendzo keeps on file for your store.
      </AppText>

      {docsQ.isLoading ? (
        <ActivityIndicator color={colors.ink} style={styles.docsLoading} />
      ) : docsQ.isError && !docsQ.data ? (
        isForbidden(docsQ.error) ? (
          <ReadOnlyNote message="Only the owner or a manager can see compliance documents." />
        ) : (
          <Banner
            tone="danger"
            title="Couldn't load documents"
            message={errorMessage(docsQ.error, 'Check your connection and try again.')}
            actionLabel="Retry"
            onAction={() => docsQ.refetch()}
          />
        )
      ) : docs.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="No compliance documents required at this time."
        />
      ) : (
        <View style={styles.docList}>
          {docs.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              canUpload={canManage && needsUpload(doc)}
              uploading={uploadingId === doc.id}
              disabled={uploadingId != null}
              onUpload={() => upload(doc)}
              onView={view}
            />
          ))}
        </View>
      )}

      {!canManage && docs.some(needsUpload) ? <ReadOnlyNote /> : null}

      <ListRow
        icon="shield-checkmark-outline"
        label="Verification (KYC)"
        hint="Periodic checks of your business documents"
        onPress={() => navigation.navigate('Kyc')}
      />
    </TabScroll>
  );
}

function DocumentRow({
  doc,
  canUpload,
  uploading,
  disabled,
  onUpload,
  onView,
}: {
  doc: StoreDocument;
  canUpload: boolean;
  uploading: boolean;
  disabled: boolean;
  onUpload: () => void;
  onView: (url: string) => void;
}) {
  const rejected = doc.status === 'rejected';
  const fileUrl = doc.fileUrl;
  return (
    <View style={styles.docRow}>
      <View style={styles.docHead}>
        <AppText variant="bodyMedium" color={colors.ink} style={styles.flex}>
          {doc.label}
        </AppText>
        <StatusChip label={doc.status.replace(/_/g, ' ')} tone={toneForStatus(doc.status)} />
      </View>
      <AppText variant="meta" color={rejected ? colors.danger : colors.meta}>
        {rejected
          ? 'Rejected — upload a clear, current copy'
          : doc.uploadedAt
            ? `Uploaded ${formatDate(doc.uploadedAt)}`
            : 'Not uploaded yet'}
      </AppText>
      {fileUrl || canUpload ? (
        <View style={styles.docActions}>
          {fileUrl ? (
            <PillButton icon="eye-outline" label="View" onPress={() => onView(fileUrl)} />
          ) : null}
          {canUpload ? (
            <PillButton
              icon="cloud-upload-outline"
              label={uploading ? 'Uploading…' : rejected ? 'Re-upload' : 'Upload'}
              primary
              busy={uploading}
              disabled={disabled && !uploading}
              onPress={onUpload}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ---- Shared bits ----

/** Each tab scrolls on its own (keeping its position) with pull-to-refresh. */
function TabScroll({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown>;
  children: React.ReactNode;
}) {
  // Own flag rather than isFetching, so the 20s /retailer/me poll never spins it.
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.ink} />
      }
    >
      {children}
    </ScrollView>
  );
}

/** DetailRow's layout with a chip or link on the right instead of plain text. */
function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.factRow}>
      <AppText variant="body" color={colors.meta}>
        {label}
      </AppText>
      <View style={styles.factValue}>{children}</View>
    </View>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} haptic={false}>
      <AppText variant="bodyMedium" color={colors.ink} style={styles.link}>
        {label}
      </AppText>
    </PressableScale>
  );
}

function PillButton({
  icon,
  label,
  onPress,
  primary,
  busy,
  disabled,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  primary?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  const fg = primary ? colors.accentInk : colors.ink;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      toScale={0.95}
      haptic={false}
      style={[styles.pill, primary ? styles.pillPrimary : styles.pillPlain]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <Icon name={icon} size={15} color={fg} />
      )}
      <AppText variant="meta" color={fg}>
        {label}
      </AppText>
    </PressableScale>
  );
}

function ReadOnlyNote({ message = READ_ONLY_NOTE }: { message?: string }) {
  return (
    <View style={styles.readOnly}>
      <Icon name="lock-closed-outline" size={14} color={colors.meta} style={styles.readOnlyIcon} />
      <AppText variant="meta" color={colors.meta} style={styles.flex}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hidden: { display: 'none' },
  top: { gap: spacing.sm, paddingBottom: spacing.sm },
  tabs: { marginTop: spacing.xs },
  loader: { marginTop: spacing.xl },
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.md },
  tabBanner: { marginTop: spacing.sm },
  footer: { paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.hairline },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  factValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 },
  link: { textDecorationLine: 'underline' },
  fieldWrap: { gap: spacing.xs },
  fieldHint: { marginLeft: 2 },
  readOnly: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  readOnlyIcon: { marginTop: 1 },
  // Photos: two 3:4 tiles per row.
  grid: { gap: spacing.sm },
  gridRow: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: radii.card,
    overflow: 'hidden',
    backgroundColor: colors.cardGray,
  },
  tileFill: { width: '100%', height: '100%' },
  tileSpacer: { flex: 1 },
  tileBusy: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileRemove: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.cardGray,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  // Hours
  day: { gap: spacing.xs },
  timeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  bankLoading: { minHeight: 140 },
  // Documents
  docsLoading: { minHeight: 120 },
  docList: { gap: spacing.sm },
  docRow: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.xs,
  },
  docHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  docActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  pillPlain: { borderWidth: 1, borderColor: colors.hairline },
  pillPrimary: { backgroundColor: colors.accent },
});
