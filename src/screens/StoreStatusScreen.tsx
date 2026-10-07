import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  AppText,
  Banner,
  Divider,
  EmptyState,
  Field,
  Icon,
  ListRow,
  Panel,
  PressableScale,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SectionHeader,
  StatusChip,
  ToggleRow,
  toneForStatus,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import {
  PENDING_PAUSE,
  useChangeRequests,
  useRetailerMe,
  useSetOrderAcceptance,
} from '../api/onboardingHooks';
import { errorMessage } from '../api/request';
import {
  usePauseStore,
  useRequestPosActivation,
  useResumeStore,
  useUpdateStoreProfile,
} from '../api/storeSettingsHooks';
import { useAuth } from '../store/auth';
import { GstScheme, PauseVisibility, Store } from '../types/onboarding';
import { canManageStore } from '../types/store';
import { WEEKDAYS, formatDateTime, formatTime, parseDate } from '../utils/format';
import { colors, radii, spacing } from '../theme/theme';

const READ_ONLY_NOTE = 'Only the owner or a manager can change this.';

const STATUS_COPY: Partial<Record<Store['status'], string>> = {
  onboarding: 'Your store is set up — add products and go live.',
  active: 'Live on Trendzo. Customers can find you and order.',
  paused: "Paused — customers can't place orders until you resume.",
};

interface Option<T extends string> {
  value: T;
  title: string;
  body: string;
}

const PAUSE_OPTIONS: Option<PauseVisibility>[] = [
  {
    value: 'visible',
    title: 'Block new orders only',
    body: "Listings stay visible; checkout shows a 'back soon' notice.",
  },
  {
    value: 'hidden',
    title: 'Hide from catalog',
    body: 'Listings disappear from search and browsing while paused.',
  },
];

const GST_OPTIONS: Option<GstScheme>[] = [
  {
    value: 'regular',
    title: 'Regular dealer',
    body: 'Charges GST on every sale. Counter bills are Tax Invoices with CGST + SGST and HSN-coded lines.',
  },
  {
    value: 'composition',
    title: 'Composition dealer',
    body: "Can't charge GST. Counter bills are issued as a Bill of Supply with the composition declaration.",
  },
];

/** "Mon, 9:00 AM" — the same wording as Home's store card (no Intl on Hermes). */
function formatReopen(iso: string): string | null {
  const d = parseDate(iso);
  return d ? `${WEEKDAYS[d.getDay()]}, ${formatTime(iso)}` : null;
}

/**
 * Storefront & GST: the store's live status, the quick online/offline switch,
 * the longer storefront pause, the GST scheme invoices are issued under, and
 * counter-billing activation — plus links to hours, holidays and pickup slots.
 */
export function StoreStatusScreen({ navigation }: ScreenProps<'StoreStatus'>) {
  const me = useRetailerMe();
  const authSubRole = useAuth((s) => s.retailer?.subRole);
  const canManage = canManageStore(me.data?.retailer.subRole ?? authSubRole);
  const store = me.data?.store ?? null;
  // Only needed to show a pending counter-billing request.
  const billingOff = !!store && !store.posBillingEnabled;
  const changeRequestsQ = useChangeRequests(billingOff);
  const posPending = (changeRequestsQ.data ?? []).some(
    (cr) =>
      cr.field === 'pos_billing_activation' &&
      (cr.status === 'pending' || cr.status === 'under_review'),
  );

  // Own flag rather than isFetching, so the 20s /retailer/me poll never spins it.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([me.refetch(), billingOff ? changeRequestsQ.refetch() : null]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen edges={['top']}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />
        }
      >
        <ScreenHeader
          overline="Store operations"
          title="Storefront & GST"
          onBack={() => navigation.goBack()}
        />

        {me.isLoading ? (
          <ActivityIndicator color={colors.ink} style={styles.loader} />
        ) : !me.data ? (
          <Banner
            tone="danger"
            title="Couldn't load your store"
            message={errorMessage(me.error, 'Check your connection and try again.')}
            actionLabel="Retry"
            onAction={() => me.refetch()}
          />
        ) : !store ? (
          <EmptyState
            icon="storefront-outline"
            title="No store yet"
            message="Store settings show up here once Trendzo finishes setting up your store."
          />
        ) : (
          <>
            <StatusPanel store={store} canManage={canManage} />
            <PausePanel store={store} canManage={canManage} />
            <GstPanel store={store} canManage={canManage} />
            <BillingPanel
              store={store}
              canManage={canManage}
              pending={posPending}
              checking={changeRequestsQ.isLoading}
              onOpenCounter={() => navigation.navigate('Register')}
            />

            <SectionHeader label="Operations" style={styles.sectionGap} />
            <ListRow
              icon="time-outline"
              label="Store hours"
              hint="Your weekly opening times"
              onPress={() => navigation.navigate('StoreProfile', { tab: 'hours' })}
            />
            <ListRow
              icon="calendar-outline"
              label="Holiday calendar"
              hint="Close for festivals and days off"
              onPress={() => navigation.navigate('HolidayCalendar')}
            />
            <ListRow
              icon="bag-handle-outline"
              label="Pickup slots"
              hint="Weekly windows for store pickup"
              onPress={() => navigation.navigate('PickupSlots')}
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/** Status line + the quick online/offline switch (same mutation as Home's card). */
function StatusPanel({ store, canManage }: { store: Store; canManage: boolean }) {
  const toast = useToast();
  const setAccept = useSetOrderAcceptance();
  const online = !store.orderPauseUntil;
  // PENDING_PAUSE stands in while going offline is in flight — not a date.
  const reopenAt =
    store.orderPauseUntil && store.orderPauseUntil !== PENDING_PAUSE
      ? formatReopen(store.orderPauseUntil)
      : null;
  const hint = setAccept.isPending
    ? 'Updating…'
    : online
      ? 'Customers can order now'
      : reopenAt
        ? `Paused · reopens ${reopenAt}`
        : canManage
          ? 'Paused · tap to reopen'
          : 'Paused';

  const toggle = (accepting: boolean) => {
    if (setAccept.isPending) return;
    setAccept.mutate(accepting, {
      onSuccess: () =>
        toast.show(
          accepting ? 'Store online — accepting orders' : 'Store offline — orders paused',
          accepting ? 'success' : 'info',
        ),
      onError: (e) => toast.show(errorMessage(e, 'Could not update store status'), 'error'),
    });
  };

  const copy =
    STATUS_COPY[store.status] ??
    `Your store is ${store.status.replace(/_/g, ' ')}. Contact Trendzo support to restore it.`;

  return (
    <Panel title="Storefront">
      <StatusChip label={store.status.replace(/_/g, ' ')} tone={toneForStatus(store.status)} />
      <AppText variant="body" color={colors.ink}>
        {copy}
      </AppText>
      {store.status === 'active' ? (
        <>
          <Divider />
          <ToggleRow
            label="Accepting orders"
            hint={hint}
            value={online}
            onChange={toggle}
            disabled={!canManage}
          />
          <AppText variant="meta" color={colors.meta}>
            Going offline is a quick break: your store reopens on its own at the next opening time.
          </AppText>
          {canManage ? null : <ReadOnlyNote />}
        </>
      ) : null}
    </Panel>
  );
}

/** The longer break: stays paused until the retailer resumes it. */
function PausePanel({ store, canManage }: { store: Store; canManage: boolean }) {
  const toast = useToast();
  const pause = usePauseStore();
  const resume = useResumeStore();
  const [visibility, setVisibility] = useState<PauseVisibility>('visible');
  const [reason, setReason] = useState('');

  if (store.status === 'paused') {
    const details = [
      store.pauseReason ? `Reason: ${store.pauseReason}` : null,
      store.pauseVisibility === 'hidden'
        ? 'Hidden from catalog — your listings are out of search and browsing.'
        : "Listings stay visible — checkout shows a 'back soon' notice.",
      store.pauseUntil ? `Until ${formatDateTime(store.pauseUntil)}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const onResume = () =>
      resume.mutate(undefined, {
        onSuccess: () => toast.show('Storefront resumed', 'success'),
        onError: (e) => toast.show(errorMessage(e, "Couldn't resume the storefront"), 'error'),
      });

    return (
      <Panel title="Pause storefront">
        <Banner tone="warning" title="Storefront paused" message={details} />
        {canManage ? (
          <PrimaryButton
            label="Resume storefront"
            tone="accent"
            loading={resume.isPending}
            onPress={onResume}
          />
        ) : (
          <ReadOnlyNote />
        )}
      </Panel>
    );
  }

  if (store.status !== 'active') return null;

  const confirmPause = () =>
    Alert.alert(
      'Pause storefront?',
      visibility === 'hidden'
        ? 'Your listings are hidden and new orders are blocked until you resume.'
        : 'New orders are blocked until you resume. Your listings stay visible.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pause',
          style: 'destructive',
          onPress: () =>
            pause.mutate(
              { visibility, reason },
              {
                onSuccess: () => {
                  setReason('');
                  toast.show('Storefront paused', 'success');
                },
                onError: (e) =>
                  toast.show(errorMessage(e, "Couldn't pause the storefront"), 'error'),
              },
            ),
        },
      ],
    );

  return (
    <Panel title="Pause storefront">
      <AppText variant="meta" color={colors.meta}>
        For a longer break. Unlike going offline, a pause doesn't end on its own — your storefront
        stays paused until you resume it.
      </AppText>
      {canManage ? (
        <>
          {PAUSE_OPTIONS.map((o) => (
            <OptionCard
              key={o.value}
              title={o.title}
              body={o.body}
              selected={visibility === o.value}
              onPress={() => setVisibility(o.value)}
            />
          ))}
          <Field
            label="Reason (optional)"
            boxed
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. weekend stock-take"
            maxLength={120}
          />
          <PrimaryButton
            label="Pause storefront"
            tone="ink"
            loading={pause.isPending}
            onPress={confirmPause}
          />
        </>
      ) : (
        <ReadOnlyNote />
      )}
    </Panel>
  );
}

function GstPanel({ store, canManage }: { store: Store; canManage: boolean }) {
  const toast = useToast();
  const update = useUpdateStoreProfile();
  // null = untouched, so a /retailer/me refresh never overrides the retailer's pick.
  const [picked, setPicked] = useState<GstScheme | null>(null);
  const current = store.gstScheme ?? null;
  const selected = picked ?? current;
  const changed = picked != null && picked !== current;
  const currentOption = GST_OPTIONS.find((o) => o.value === current);

  const save = () => {
    if (!picked || !changed || update.isPending) return;
    Alert.alert('Change GST scheme?', 'This changes how your invoices are issued from now on.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Change',
        onPress: () =>
          update.mutate(
            { gstScheme: picked },
            {
              onSuccess: () => {
                setPicked(null);
                toast.show('GST scheme updated', 'success');
              },
              onError: (e) =>
                toast.show(errorMessage(e, "Couldn't update the GST scheme"), 'error'),
            },
          ),
      },
    ]);
  };

  return (
    <Panel title="GST scheme">
      {canManage ? (
        <>
          {GST_OPTIONS.map((o) => (
            <OptionCard
              key={o.value}
              title={o.title}
              body={o.body}
              selected={selected === o.value}
              onPress={() => setPicked(o.value)}
            />
          ))}
          <PrimaryButton
            label="Save GST scheme"
            tone="accent"
            disabled={!changed}
            loading={update.isPending}
            onPress={save}
          />
        </>
      ) : (
        <>
          {currentOption ? (
            <OptionCard title={currentOption.title} body={currentOption.body} selected />
          ) : (
            <AppText variant="body" color={colors.meta}>
              Not set yet
            </AppText>
          )}
          <ReadOnlyNote />
        </>
      )}
    </Panel>
  );
}

function BillingPanel({
  store,
  canManage,
  pending,
  checking,
  onOpenCounter,
}: {
  store: Store;
  canManage: boolean;
  /** A pos_billing_activation change request is pending / under review. */
  pending: boolean;
  /** Change requests are still loading — we don't know about `pending` yet. */
  checking: boolean;
  onOpenCounter: () => void;
}) {
  const toast = useToast();
  const requestPos = useRequestPosActivation();

  if (store.posBillingEnabled) {
    return (
      <Panel title="Counter billing">
        <View style={styles.onRow}>
          <Icon name="checkmark-circle" size={20} color={colors.success} />
          <AppText variant="bodyMedium" color={colors.ink}>
            Counter billing is on
          </AppText>
        </View>
        <AppText variant="meta" color={colors.meta}>
          Bill walk-in customers at your counter, right from this app.
        </AppText>
        <PrimaryButton label="Open billing counter" tone="accent" onPress={onOpenCounter} />
      </Panel>
    );
  }

  const request = () =>
    requestPos.mutate(undefined, {
      onSuccess: () => toast.show('Activation requested — Trendzo will review it', 'success'),
      onError: (e) => toast.show(errorMessage(e, "Couldn't send the request"), 'error'),
    });

  return (
    <Panel title="Counter billing">
      <AppText variant="body" color={colors.ink}>
        Bill walk-in customers at your counter, right from this app. Trendzo switches it on after a
        quick review.
      </AppText>
      {canManage ? (
        <>
          <PrimaryButton
            label={pending ? 'Request pending' : 'Request activation'}
            tone="accent"
            disabled={pending || checking}
            loading={requestPos.isPending}
            onPress={request}
          />
          {pending ? (
            <AppText variant="meta" color={colors.meta}>
              Trendzo is reviewing your request. You can start billing once it's approved.
            </AppText>
          ) : null}
        </>
      ) : (
        <ReadOnlyNote />
      )}
    </Panel>
  );
}

/** Selectable card with a radio mark. Without `onPress` it's a static, read-only card. */
function OptionCard({
  title,
  body,
  selected,
  onPress,
}: {
  title: string;
  body: string;
  selected: boolean;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyMedium" color={colors.ink}>
          {title}
        </AppText>
        <AppText variant="meta" color={colors.meta}>
          {body}
        </AppText>
      </View>
    </>
  );
  if (!onPress) return <View style={[styles.option, selected && styles.optionOn]}>{content}</View>;
  return (
    <PressableScale
      onPress={onPress}
      toScale={0.98}
      haptic={false}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.option, selected && styles.optionOn]}
    >
      {content}
    </PressableScale>
  );
}

function ReadOnlyNote() {
  return (
    <View style={styles.readOnly}>
      <Icon name="lock-closed-outline" size={14} color={colors.meta} style={styles.readOnlyIcon} />
      <AppText variant="meta" color={colors.meta} style={styles.flex}>
        {READ_ONLY_NOTE}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: spacing.xxl, gap: spacing.md },
  loader: { marginTop: spacing.xl },
  sectionGap: { marginTop: spacing.sm },
  onRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  readOnly: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  readOnlyIcon: { marginTop: 1 },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.sm + 4,
    borderWidth: 1.5,
    borderColor: colors.hairline,
  },
  optionOn: { borderColor: colors.ink },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.inkMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioOn: { borderColor: colors.ink },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink },
});
