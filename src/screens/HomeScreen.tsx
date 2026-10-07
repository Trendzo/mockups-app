import React, { useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  Banner,
  BottomSheet,
  Icon,
  IconButton,
  OrderCard,
  Panel,
  PressableScale,
  Screen,
  ScreenHeader,
  SectionHeader,
  SheetSurface,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useCaptureDraft } from '../store/captureDraft';
import { useProductDraft } from '../store/productDraft';
import {
  PENDING_PAUSE,
  useKyc,
  useRetailerMe,
  useSetOrderAcceptance,
} from '../api/onboardingHooks';
import { useBestSellers, useInventory, useListings } from '../api/catalogHooks';
import { useActiveOrders, useOrderAction, useRecentOrders } from '../api/ordersHooks';
import { useUpcomingPayout } from '../api/earningsHooks';
import { useDaySummary } from '../api/posHooks';
import { useInbox } from '../api/notifications';
import { errorMessage } from '../api/request';
import { OrderRow, OrderTab } from '../types/orders';
import { orderStats, sortForTab } from '../utils/orders';
import { formatPaise } from '../utils/money';
import { WEEKDAYS, formatDayDate, fromYmd, plural, todayYmd } from '../utils/format';
import { colors, radii, spacing } from '../theme/theme';

/** "Mon, 9:00 AM" from an ISO instant, in the device's local time (IST). Avoids
 *  Intl/toLocaleString, which is unreliable on Hermes without the Intl polyfill. */
function formatReopen(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${WEEKDAYS[d.getDay()]}, ${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Store dashboard: what's selling today (online + counter), the order
 * pipeline, anything that needs the retailer's attention, and shortcuts into
 * every part of running the store.
 */
export function HomeScreen({ navigation }: ScreenProps<'Home'>) {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const clearCapture = useCaptureDraft((s) => s.clear);
  const kyc = useKyc();
  const meQ = useRetailerMe();
  const store = meQ.data?.store ?? null;
  const posEnabled = store?.posBillingEnabled === true;
  const storeName = store?.legalName || meQ.data?.retailer.legalName || 'Your store';

  const activeQ = useActiveOrders();
  const recentQ = useRecentOrders();
  const listingsQ = useListings();
  const inbox = useInbox();
  const payoutQ = useUpcomingPayout();
  const posQ = useDaySummary(todayYmd(), posEnabled);
  const lowQ = useInventory({ flag: 'low', page: 1, pageSize: 1 });
  const outQ = useInventory({ flag: 'out', page: 1, pageSize: 1 });
  const bestQ = useBestSellers(30, 5);
  const orderAction = useOrderAction();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const active = useMemo(() => activeQ.data ?? [], [activeQ.data]);
  const recent = useMemo(() => recentQ.data ?? [], [recentQ.data]);
  const stats = useMemo(() => orderStats(active, recent), [active, recent]);
  const newOrders = useMemo(
    () => sortForTab('new', active.filter((o) => o.status === 'routing')),
    [active],
  );

  const counterToday = posEnabled ? posQ.data?.netSalesPaise ?? 0 : 0;
  const billsToday = posEnabled ? posQ.data?.saleCount ?? 0 : 0;
  const totalToday = stats.salesTodayPaise + counterToday;

  const listings = listingsQ.data ?? [];
  const liveCount = listings.filter((l) => l.status === 'active').length;
  const draftCount = listings.filter((l) => l.status === 'draft').length;
  const lowCount = lowQ.data?.total ?? 0;
  const outCount = outQ.data?.total ?? 0;

  // Online / offline (quick break; the server auto-reopens at the next opening time).
  const online = !store?.orderPauseUntil;
  const reopenAt =
    store?.orderPauseUntil && store.orderPauseUntil !== PENDING_PAUSE
      ? formatReopen(store.orderPauseUntil)
      : null;
  const setAccept = useSetOrderAcceptance();
  const toggleOnline = () => {
    if (setAccept.isPending) return;
    const nextAccepting = !online; // online now → go offline (accepting=false)
    setAccept.mutate(nextAccepting, {
      onSuccess: () =>
        toast.show(
          nextAccepting ? 'Store online — accepting orders' : 'Store offline — orders paused',
          nextAccepting ? 'success' : 'info',
        ),
      onError: (e) =>
        toast.show(e instanceof Error ? e.message : 'Could not update store status', 'error'),
    });
  };

  const kycNeedsAction =
    kyc.data != null &&
    (kyc.data.status === 'pending' ||
      kyc.data.status === 'overdue' ||
      kyc.data.status === 'rejected');

  const goOrders = (tab: OrderTab) => navigation.navigate('Orders', { tab });

  const runOrder = (o: OrderRow, act: 'accept' | 'reject') => {
    setBusyId(o.id);
    orderAction.mutate(
      { id: o.id, action: act },
      {
        onSuccess: () =>
          toast.show(
            act === 'accept' ? 'Order accepted — start packing' : 'Order rejected',
            act === 'accept' ? 'success' : 'info',
          ),
        onError: (e) => toast.show(errorMessage(e, 'Could not update the order'), 'error'),
        onSettled: () => setBusyId(null),
      },
    );
  };
  const confirmReject = (o: OrderRow) =>
    Alert.alert('Reject this order?', "It's offered to the next-best store. This can't be undone.", [
      { text: 'Keep', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => runOrder(o, 'reject') },
    ]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        activeQ.refetch(),
        recentQ.refetch(),
        listingsQ.refetch(),
        payoutQ.refetch(),
        inbox.refetch(),
        lowQ.refetch(),
        outQ.refetch(),
        posEnabled ? posQ.refetch() : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const latest = useMemo(
    () =>
      [...recent]
        // New orders already sit under "Waiting for you".
        .filter((o) => !['pending', 'payment_failed', 'routing'].includes(o.status))
        .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
        .slice(0, 4),
    [recent],
  );

  // Everything that needs the retailer, in one panel below the fold of numbers —
  // so nothing pops in above the dashboard after it loads and shoves it down.
  const alerts: {
    key: string;
    icon: string;
    text: string;
    hint?: string;
    tone: 'warning' | 'danger';
    onPress: () => void;
  }[] = [];
  if (kycNeedsAction) {
    const st = kyc.data!.status;
    alerts.push({
      key: 'kyc',
      icon: 'shield-checkmark-outline',
      text:
        st === 'rejected'
          ? 'Some KYC documents were rejected'
          : st === 'overdue'
            ? 'KYC overdue'
            : 'KYC verification due',
      hint:
        st === 'rejected'
          ? 'Re-upload them and submit again'
          : st === 'overdue'
            ? 'Submit before the grace period ends'
            : 'Upload your documents to stay verified',
      tone: st === 'pending' ? 'warning' : 'danger',
      onPress: () => navigation.navigate('Kyc'),
    });
  }
  if (store?.status === 'paused') {
    alerts.push({
      key: 'paused',
      icon: 'pause-circle-outline',
      text: 'Storefront paused',
      hint: store.pauseReason || "Customers can't order until you resume",
      tone: 'warning',
      onPress: () => navigation.navigate('StoreStatus'),
    });
  }
  if (stats.returnsCount > 0) {
    alerts.push({
      key: 'returns',
      icon: 'return-down-back-outline',
      text: `${plural(stats.returnsCount, 'return')} to check`,
      tone: 'warning',
      onPress: () => goOrders('returns'),
    });
  }
  const failed = active.filter((o) => o.status === 'undelivered').length;
  if (failed > 0) {
    alerts.push({
      key: 'failed',
      icon: 'alert-circle-outline',
      text: `${plural(failed, 'delivery', 'deliveries')} failed — follow up`,
      tone: 'danger',
      onPress: () => goOrders('transit'),
    });
  }
  if (outCount > 0) {
    alerts.push({
      key: 'out',
      icon: 'close-circle-outline',
      text: `${plural(outCount, 'item')} out of stock`,
      tone: 'danger',
      onPress: () => navigation.navigate('Inventory', { flag: 'out' }),
    });
  }
  if (lowCount > 0) {
    alerts.push({
      key: 'low',
      icon: 'trending-down-outline',
      text: `${plural(lowCount, 'item')} running low`,
      tone: 'warning',
      onPress: () => navigation.navigate('Inventory', { flag: 'low' }),
    });
  }

  const startFromPhotos = () => {
    setAddOpen(false);
    clearCapture();
    navigation.navigate('SelectPhotos');
  };
  const startManual = () => {
    setAddOpen(false);
    useProductDraft.getState().startCreate();
    navigation.navigate('ProductWizardBasics');
  };
  const startBulk = () => {
    setAddOpen(false);
    navigation.navigate('SelectPhotos', { bulk: true });
  };

  return (
    <Screen edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />
        }
      >
        <ScreenHeader
          overline={greeting()}
          title={storeName}
          right={
            <IconButton
              icon="notifications-outline"
              badge={inbox.unread}
              onPress={() => navigation.navigate('Notifications')}
            />
          }
        />

        {store ? (
          <StoreStatusCard
            online={online}
            pending={setAccept.isPending}
            reopenAt={reopenAt}
            onToggle={toggleOnline}
          />
        ) : null}

        {/* Today */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <AppText variant="sectionLabel" color={colors.accentSub}>
              Today's sales
            </AppText>
            <AppText variant="meta" color={colors.accentSub}>
              {formatDayDate(new Date().toISOString())}
            </AppText>
          </View>
          <AppText variant="cardTitle" color={colors.accentInk} style={styles.heroAmount}>
            {recentQ.isLoading ? '…' : formatPaise(totalToday)}
          </AppText>
          <View style={styles.heroSplit}>
            <HeroStat label="Online" value={formatPaise(stats.salesTodayPaise)} hint={plural(stats.ordersToday, 'order')} />
            {posEnabled ? (
              <HeroStat label="Counter" value={formatPaise(counterToday)} hint={plural(billsToday, 'bill')} />
            ) : (
              <HeroStat label="Delivered" value={String(stats.deliveredToday)} hint="orders today" />
            )}
          </View>
          <WeekBars week={stats.week} />
          <AppText variant="meta" color={colors.accentSub}>
            Last 30 days: {formatPaise(stats.sales30Paise)} from {plural(stats.orders30, 'online order')}
          </AppText>
        </View>

        {/* Order pipeline */}
        <View style={styles.section}>
          <SectionHeader label="Orders" actionLabel="View all" onAction={() => goOrders('new')} />
          <View style={styles.tileRow}>
            <MetricTile
              value={activeQ.isLoading ? '…' : String(stats.newCount)}
              label="New"
              hint={stats.newCount ? 'Accept now' : 'Waiting for orders'}
              icon="notifications-outline"
              dark={stats.newCount > 0}
              onPress={() => goOrders('new')}
            />
            <MetricTile
              value={activeQ.isLoading ? '…' : String(stats.toPackCount)}
              label="To pack"
              hint="Accepted orders"
              icon="cube-outline"
              onPress={() => goOrders('preparing')}
            />
          </View>
          <View style={styles.tileRow}>
            <MetricTile
              value={activeQ.isLoading ? '…' : String(stats.shippedCount)}
              label="On the way"
              hint="With delivery"
              icon="bicycle-outline"
              onPress={() => goOrders('transit')}
            />
            <MetricTile
              value={recentQ.isLoading ? '…' : String(stats.deliveredToday)}
              label="Delivered"
              hint={stats.cancelledToday ? `Today · ${stats.cancelledToday} cancelled` : 'Today'}
              icon="checkmark-done-outline"
              onPress={() => goOrders('completed')}
            />
          </View>
          {activeQ.isError && !activeQ.data ? (
            <Banner
              tone="danger"
              title="Couldn't load orders"
              message={errorMessage(activeQ.error)}
              actionLabel="Retry"
              onAction={() => activeQ.refetch()}
            />
          ) : null}
        </View>

        {/* Needs attention */}
        {alerts.length ? (
          <Panel title="Needs attention">
            {alerts.map((a) => (
              <PressableScale key={a.key} onPress={a.onPress} toScale={0.98} haptic={false} style={styles.alertRow}>
                <Icon name={a.icon} size={20} color={a.tone === 'danger' ? colors.danger : '#B8860B'} />
                <View style={styles.flex}>
                  <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
                    {a.text}
                  </AppText>
                  {a.hint ? (
                    <AppText variant="meta" color={colors.meta} numberOfLines={2}>
                      {a.hint}
                    </AppText>
                  ) : null}
                </View>
                <Icon name="chevron-forward" size={18} color={colors.meta} />
              </PressableScale>
            ))}
          </Panel>
        ) : null}

        {/* New orders — accept right from home */}
        {newOrders.length ? (
          <View style={styles.section}>
            <SectionHeader
              label={`Waiting for you · ${newOrders.length}`}
              actionLabel={newOrders.length > 3 ? 'See all' : undefined}
              onAction={() => goOrders('new')}
            />
            {newOrders.slice(0, 3).map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                onPress={() => navigation.navigate('OrderDetail', { id: o.id })}
                onAccept={() => runOrder(o, 'accept')}
                onReject={() => confirmReject(o)}
                busy={busyId === o.id}
              />
            ))}
          </View>
        ) : null}

        {/* Quick actions */}
        <View style={styles.section}>
          <SectionHeader label="Quick actions" />
          <View style={styles.actionsCard}>
            <QuickAction icon="receipt-outline" label="New bill" onPress={() => navigation.navigate('Register')} />
            <QuickAction icon="add-circle-outline" label="Add product" onPress={() => setAddOpen(true)} />
            <QuickAction icon="layers-outline" label="Inventory" onPress={() => navigation.navigate('Inventory')} />
            <QuickAction icon="wallet-outline" label="Payments" onPress={() => navigation.navigate('Earnings')} />
            <QuickAction
              icon="stats-chart-outline"
              label="Sales"
              onPress={() => navigation.navigate(posEnabled ? 'PosSales' : 'Register')}
            />
            <QuickAction icon="storefront-outline" label="Store" onPress={() => navigation.navigate('StoreStatus')} />
            <QuickAction icon="calendar-outline" label="Holidays" onPress={() => navigation.navigate('HolidayCalendar')} />
            <QuickAction icon="time-outline" label="Pickup slots" onPress={() => navigation.navigate('PickupSlots')} />
          </View>
        </View>

        {/* Money */}
        <PressableScale onPress={() => navigation.navigate('Earnings')} toScale={0.98} style={styles.payoutCard}>
          <View style={styles.payoutIcon}>
            <Icon name="wallet-outline" size={20} color={colors.accentInk} />
          </View>
          <View style={styles.flex}>
            <AppText variant="meta" color={colors.meta}>
              Next payout{payoutQ.data ? ` · ${formatDayDate(payoutQ.data.nextCycleDate)}` : ''}
            </AppText>
            <AppText variant="cardTitle" color={colors.ink}>
              {payoutQ.isLoading ? '…' : formatPaise(payoutQ.data?.outstandingPayable ?? 0)}
            </AppText>
            {payoutQ.data ? (
              <AppText variant="meta" color={colors.meta}>
                From {plural(payoutQ.data.orderCount, 'order')} since your last payout
              </AppText>
            ) : null}
          </View>
          <Icon name="chevron-forward" size={18} color={colors.meta} />
        </PressableScale>

        {/* Recent orders */}
        {latest.length ? (
          <View style={styles.section}>
            <SectionHeader label="Recent orders" actionLabel="View all" onAction={() => goOrders('new')} />
            {latest.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                onPress={() => navigation.navigate('OrderDetail', { id: o.id })}
              />
            ))}
          </View>
        ) : null}

        {/* Catalog health */}
        <View style={styles.section}>
          <SectionHeader
            label="Products on Trendzo"
            actionLabel="Manage"
            onAction={() => navigation.navigate('Catalog')}
          />
          <View style={styles.tileRow}>
            <MetricTile
              value={listingsQ.isLoading ? '…' : String(liveCount)}
              label="Live"
              hint="Visible to customers"
              icon="eye-outline"
              onPress={() => navigation.navigate('Catalog')}
            />
            <MetricTile
              value={listingsQ.isLoading ? '…' : String(draftCount)}
              label="Drafts"
              hint="Finish to publish"
              icon="create-outline"
              onPress={() => navigation.navigate('Catalog')}
            />
          </View>
        </View>

        {bestQ.data?.length ? (
          <Panel title="Best sellers · 30 days">
            {bestQ.data.map((b, i) => (
              <View key={b.variantId} style={styles.bestRow}>
                <AppText variant="bodyMedium" color={colors.meta} style={styles.rank}>
                  {i + 1}
                </AppText>
                <View style={styles.flex}>
                  <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
                    {b.listingName}
                  </AppText>
                  <AppText variant="meta" color={colors.meta} numberOfLines={1}>
                    {b.attributesLabel} · {b.stock} in stock
                  </AppText>
                </View>
                <AppText variant="bodyMedium" color={colors.ink}>
                  {b.unitsSold} sold
                </AppText>
              </View>
            ))}
          </Panel>
        ) : null}
      </ScrollView>

      {/* Quick add: create a product from photos, always one tap away. */}
      <PressableScale
        onPress={startFromPhotos}
        toScale={0.9}
        style={[styles.fab, { bottom: insets.bottom + 86 }]}
        accessibilityLabel="Create product"
      >
        <Icon name="add" size={30} color={colors.accentInk} />
      </PressableScale>

      {/* Add product chooser */}
      <BottomSheet visible={addOpen} onClose={() => setAddOpen(false)}>
        <SheetSurface style={styles.sheet}>
          <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
            Add a product
          </AppText>
          <AppText variant="meta" color={colors.meta}>
            Products you publish go live on the Trendzo app for shoppers near you.
          </AppText>
          <SheetOption
            icon="sparkles-outline"
            title="Create with AI photos"
            hint="Photograph the garment — AI makes studio and on-model shots and drafts the description."
            onPress={startFromPhotos}
          />
          <SheetOption
            icon="create-outline"
            title="Enter details"
            hint="Add your own photos, price, sizes and stock."
            onPress={startManual}
          />
          <SheetOption
            icon="albums-outline"
            title="Many products at once"
            hint="Queue photos for several garments and finish them later."
            onPress={startBulk}
          />
        </SheetSurface>
      </BottomSheet>
    </Screen>
  );
}

/**
 * Full-width store online/offline card. Off = store paused for new orders until
 * its next opening window (auto-reopen), with a manual "open early" tap.
 *
 * Deliberately layout-stable: a fixed height and a single-line subtitle mean
 * none of the four states (online / offline / offline-with-reopen / updating)
 * resize the card, so toggling never reflows the page below it. It also carries
 * the offline warning itself — a separate banner appearing and disappearing on
 * each toggle was the biggest source of that shift.
 *
 * The Switch is display-only (`pointerEvents="none"`): the card's press handler
 * is the single source of toggles. Letting the Switch handle its own
 * `onValueChange` too made one tap fire the mutation twice — on, then straight
 * back off.
 */
function StoreStatusCard({
  online,
  pending,
  reopenAt,
  onToggle,
}: {
  online: boolean;
  pending: boolean;
  reopenAt: string | null;
  onToggle: () => void;
}) {
  const tint = online ? colors.success : colors.danger;
  const subtitle = pending
    ? 'Updating…'
    : online
      ? 'Accepting new orders'
      : reopenAt
        ? `Paused · opens ${reopenAt}`
        : 'Paused · tap to reopen';

  return (
    <PressableScale
      onPress={onToggle}
      toScale={0.99}
      haptic={false}
      style={[styles.statusCard, online ? null : styles.statusCardOffline]}
    >
      <View style={[styles.statusIcon, { backgroundColor: tint }]}>
        <Icon name={online ? 'storefront' : 'pause'} size={18} color={colors.accentInk} />
      </View>
      <View style={styles.flex}>
        <View style={styles.statusTitleRow}>
          <View style={[styles.dot, { backgroundColor: tint }]} />
          <AppText variant="bodyMedium" color={colors.ink}>
            {online ? 'Store online' : 'Store offline'}
          </AppText>
        </View>
        <AppText variant="meta" color={colors.meta} numberOfLines={1}>
          {subtitle}
        </AppText>
      </View>
      <View pointerEvents="none">
        <Switch
          value={online}
          trackColor={{ false: colors.cardGray, true: colors.success }}
          thumbColor={colors.surface}
          ios_backgroundColor={colors.cardGray}
        />
      </View>
    </PressableScale>
  );
}

function HeroStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={styles.heroStat}>
      <AppText variant="meta" color={colors.accentSub}>
        {label}
      </AppText>
      <AppText variant="bodyMedium" color={colors.accentInk} numberOfLines={1}>
        {value}
      </AppText>
      <AppText variant="meta" color={colors.accentSub}>
        {hint}
      </AppText>
    </View>
  );
}

/** Seven days of online sales; today's bar is solid. */
function WeekBars({ week }: { week: { ymd: string; paise: number }[] }) {
  const max = Math.max(1, ...week.map((d) => d.paise));
  return (
    <View style={styles.bars}>
      {week.map((d, i) => {
        const today = i === week.length - 1;
        return (
          <View key={d.ymd} style={styles.barCol}>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.bar,
                  today ? styles.barToday : styles.barPast,
                  { height: `${Math.max(6, Math.round((d.paise / max) * 100))}%` },
                ]}
              />
            </View>
            <AppText variant="meta" color={today ? colors.accentInk : colors.accentSub} style={styles.barLabel}>
              {WEEKDAYS[fromYmd(d.ymd).getDay()].charAt(0)}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

function MetricTile({
  value,
  label,
  hint,
  icon,
  dark,
  onPress,
}: {
  value: string;
  label: string;
  hint?: string;
  icon: string;
  dark?: boolean;
  onPress?: () => void;
}) {
  const fg = dark ? colors.accentInk : colors.ink;
  const sub = dark ? colors.accentSub : colors.meta;
  return (
    <PressableScale onPress={onPress} toScale={0.97} style={[styles.tile, dark && styles.tileDark]}>
      <View style={styles.tileTop}>
        <AppText variant="meta" color={sub}>
          {label}
        </AppText>
        <Icon name={icon} size={18} color={sub} />
      </View>
      <AppText variant="cardTitle" color={fg} style={styles.tileValue} numberOfLines={1}>
        {value}
      </AppText>
      {hint ? (
        <AppText variant="meta" color={sub} numberOfLines={1}>
          {hint}
        </AppText>
      ) : null}
    </PressableScale>
  );
}

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} toScale={0.94} style={styles.quick}>
      <View style={styles.quickIcon}>
        <Icon name={icon} size={22} color={colors.ink} />
      </View>
      <AppText variant="meta" color={colors.ink} numberOfLines={1} style={styles.quickLabel}>
        {label}
      </AppText>
    </PressableScale>
  );
}

function SheetOption({
  icon,
  title,
  hint,
  onPress,
}: {
  icon: string;
  title: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={styles.option}>
      <View style={styles.optionIcon}>
        <Icon name={icon} size={20} color={colors.accentInk} />
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyMedium" color={colors.ink}>
          {title}
        </AppText>
        <AppText variant="meta" color={colors.meta}>
          {hint}
        </AppText>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.meta} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // Bottom padding clears the floating tab bar and the + button.
  content: { paddingBottom: 200, gap: spacing.md },
  fab: {
    position: 'absolute',
    right: spacing.screenH,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  flex: { flex: 1 },
  section: { gap: spacing.sm },
  // Fixed height + single-line subtitle: every state renders at exactly this
  // size, so toggling never shifts the content below.
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 72,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
  },
  statusCardOffline: { backgroundColor: 'rgba(200,140,0,0.12)' },
  statusIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  hero: {
    backgroundColor: colors.accent,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroAmount: { fontSize: 34, lineHeight: 40 },
  heroSplit: { flexDirection: 'row', gap: spacing.md },
  heroStat: {
    flex: 1,
    gap: 2,
    padding: spacing.sm + 2,
    borderRadius: radii.sm + 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginTop: spacing.xs },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barTrack: { height: 48, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4 },
  barToday: { backgroundColor: colors.accentInk },
  barPast: { backgroundColor: 'rgba(255,255,255,0.28)' },
  barLabel: { fontSize: 11, lineHeight: 14 },
  tileRow: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: 2,
    minHeight: 104,
  },
  tileDark: { backgroundColor: colors.accent },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileValue: { fontSize: 30, lineHeight: 36, marginTop: spacing.xs },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs + 2 },
  actionsCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    rowGap: spacing.md,
  },
  quick: { width: '25%', alignItems: 'center', gap: 6 },
  quickIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { fontSize: 11.5, lineHeight: 15, textAlign: 'center' },
  payoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  payoutIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  rank: { width: 18, textAlign: 'center' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.canvas,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
