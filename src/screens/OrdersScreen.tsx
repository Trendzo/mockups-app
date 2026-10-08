import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  AppText,
  Banner,
  EmptyState,
  FilterChips,
  Icon,
  IconButton,
  OrderCard,
  PressableScale,
  PrimaryButton,
  Screen,
  ScreenHeader,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useActiveOrders, useFinishedOrders, useOrderAction } from '../api/ordersHooks';
import { useIssuesAwaitingStore } from '../api/issuesHooks';
import { useInbox } from '../api/notifications';
import { errorMessage } from '../api/request';
import { DELIVERY_LABEL, DeliveryMethod, ORDER_TABS, OrderRow, OrderTab } from '../types/orders';
import { matchesOrderSearch, sortForTab } from '../utils/orders';
import { usePermissions } from '../utils/usePermission';
import { usePullRefresh } from '../utils/usePullRefresh';
import { colors, radii, spacing, type as typeScale } from '../theme/theme';

const EMPTY: Record<OrderTab, { icon: string; title: string; message: string }> = {
  new: {
    icon: 'notifications-outline',
    title: 'No new orders right now',
    message: 'New orders from the Trendzo app show up here. Accept them within a few minutes.',
  },
  preparing: { icon: 'cube-outline', title: 'Nothing to pack', message: 'Accepted orders waiting to be packed show up here.' },
  transit: { icon: 'bicycle-outline', title: 'Nothing on the way', message: 'Orders handed to delivery show up here.' },
  returns: { icon: 'return-down-back-outline', title: 'No returns', message: 'Items coming back to your store show up here.' },
  completed: { icon: 'checkmark-done-outline', title: 'No completed orders yet', message: 'Delivered and closed orders show up here.' },
  cancelled: { icon: 'close-circle-outline', title: 'No cancelled orders', message: 'Cancelled or failed-payment orders show up here.' },
};

const DONE_TABS: OrderTab[] = ['completed', 'cancelled'];

/** History "placed within" windows → days, or null for any time. */
const DATE_WINDOWS: { value: string; label: string; days: number | null }[] = [
  { value: 'all', label: 'Any time', days: null },
  { value: '7', label: '7 days', days: 7 },
  { value: '30', label: '30 days', days: 30 },
  { value: '90', label: '90 days', days: 90 },
];

const DELIVERY_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All methods' },
  { value: 'express', label: DELIVERY_LABEL.express },
  { value: 'standard', label: DELIVERY_LABEL.standard },
  { value: 'pickup', label: DELIVERY_LABEL.pickup },
  { value: 'try_and_buy', label: DELIVERY_LABEL.try_and_buy },
];

/** Online orders from the consumer app, grouped the way the store works them. */
export function OrdersScreen({ navigation, route }: ScreenProps<'Orders'>) {
  const toast = useToast();
  const { can } = usePermissions();
  const [tab, setTab] = useState<OrderTab>(route.params?.tab ?? 'new');
  // Re-select whenever another screen links here with a tab. Keyed on the
  // params object (new on every navigate) so tapping the same Home tile twice
  // still jumps back after the retailer switched tabs by hand.
  const params = route.params;
  useEffect(() => {
    if (params?.tab) setTab(params.tab);
  }, [params]);

  const showDone = DONE_TABS.includes(tab);
  const statuses = ORDER_TABS.find((t) => t.key === tab)!.statuses;

  // History search: typed text filters the loaded rows at once; the server query
  // (`q`) follows once typing pauses.
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  // History-only filters (completed / cancelled tabs). Backend applies them via
  // from/deliveryMethod; re-applied client-side below so an old server can't leak
  // rows outside the window.
  const [dateWindow, setDateWindow] = useState('all');
  const [deliveryFilter, setDeliveryFilter] = useState('all');
  const fromIso = useMemo(() => {
    const win = DATE_WINDOWS.find((w) => w.value === dateWindow);
    if (!win?.days) return undefined;
    return new Date(Date.now() - win.days * 86_400_000).toISOString();
  }, [dateWindow]);
  const deliveryParam = deliveryFilter === 'all' ? undefined : (deliveryFilter as DeliveryMethod);

  const activeQ = useActiveOrders();
  const finishedQ = useFinishedOrders(statuses, query, showDone, {
    ...(fromIso ? { from: fromIso } : {}),
    ...(deliveryParam ? { deliveryMethod: deliveryParam } : {}),
  });
  const inbox = useInbox();
  const action = useOrderAction();
  const canViewIssues = can('disputes.view');
  const awaitingStore = useIssuesAwaitingStore(canViewIssues);
  const [busyId, setBusyId] = useState<string | null>(null);

  const source = showDone ? finishedQ : activeQ;
  const pull = usePullRefresh(source.refetch);
  const active: OrderRow[] = useMemo(() => activeQ.data ?? [], [activeQ.data]);
  const loaded: OrderRow[] = useMemo(
    () => (showDone ? finishedQ.data ?? [] : active),
    [showDone, finishedQ.data, active],
  );

  const counts = useMemo(() => {
    const c = {} as Record<OrderTab, number>;
    for (const t of ORDER_TABS) c[t.key] = active.filter((o) => t.statuses.includes(o.status)).length;
    return c;
  }, [active]);
  const pendingReturns = useMemo(() => active.filter((o) => o.hasPendingReturn).length, [active]);

  const rows = useMemo(() => {
    const inTab = loaded.filter((o) => statuses.includes(o.status));
    if (!showDone) return sortForTab(tab, inTab);
    const filtered = inTab.filter(
      (o) =>
        matchesOrderSearch(o, search) &&
        (!deliveryParam || o.deliveryMethod === deliveryParam) &&
        (!fromIso || o.placedAt >= fromIso),
    );
    return sortForTab(tab, filtered);
  }, [tab, loaded, statuses, showDone, search, deliveryParam, fromIso]);

  const filtersActive = dateWindow !== 'all' || deliveryFilter !== 'all';

  const run = (order: OrderRow, act: 'accept' | 'reject') => {
    setBusyId(order.id);
    action.mutate(
      { id: order.id, action: act },
      {
        onSuccess: () =>
          toast.show(act === 'accept' ? 'Order accepted — start packing' : 'Order rejected', act === 'accept' ? 'success' : 'info'),
        onError: (e) => toast.show(errorMessage(e, 'Could not update the order'), 'error'),
        onSettled: () => setBusyId(null),
      },
    );
  };

  const confirmReject = (order: OrderRow) =>
    Alert.alert(
      'Reject this order?',
      "It's offered to the next-best store. This can't be undone.",
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => run(order, 'reject') },
      ],
    );

  const options = ORDER_TABS.map((t) => ({
    value: t.key,
    label: t.label,
    count: DONE_TABS.includes(t.key) ? undefined : counts[t.key],
  }));

  const canAccept = can('orders.accept');
  const narrowing = showDone && (search.trim().length > 0 || filtersActive);

  return (
    <Screen edges={['top']}>
      <ScreenHeader
        overline="Online orders"
        title="Orders"
        right={
          <>
            {can('returns.view') ? (
              <IconButton
                icon="return-down-back-outline"
                badge={pendingReturns}
                onPress={() => navigation.navigate('Returns')}
              />
            ) : null}
            {canViewIssues ? (
              <IconButton
                icon="chatbubbles-outline"
                badge={awaitingStore.count}
                onPress={() => navigation.navigate('Issues')}
              />
            ) : null}
            <IconButton
              icon="notifications-outline"
              badge={inbox.unread}
              onPress={() => navigation.navigate('Notifications')}
            />
          </>
        }
      />
      <FilterChips options={options} value={tab} onChange={setTab} style={styles.chips} />

      {source.isLoading ? (
        <ActivityIndicator color={colors.ink} style={styles.loader} />
      ) : source.isError && !source.data ? (
        <Banner
          tone="danger"
          title="Couldn't load orders"
          message={errorMessage(source.error)}
          actionLabel="Retry"
          onAction={() => source.refetch()}
          style={styles.banner}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.ink}
            />
          }
          ListHeaderComponent={
            showDone ? (
              <View style={styles.doneHeader}>
                <View style={styles.searchBox}>
                  <Icon name="search" size={18} color={colors.meta} />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search order, customer or phone"
                    placeholderTextColor={colors.inkMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={() => setQuery(search.trim())}
                    style={styles.searchInput}
                  />
                  {search ? (
                    <PressableScale onPress={() => setSearch('')} hitSlop={10} haptic={false}>
                      <Icon name="close-circle" size={18} color={colors.inkMuted} />
                    </PressableScale>
                  ) : null}
                </View>
                <FilterChips options={DATE_WINDOWS} value={dateWindow} onChange={setDateWindow} />
                <FilterChips
                  options={DELIVERY_FILTERS}
                  value={deliveryFilter}
                  onChange={setDeliveryFilter}
                />
              </View>
            ) : tab === 'new' && rows.length > 0 ? (
              <AppText variant="meta" color={colors.meta}>
                Accept quickly — an order not accepted in time moves to another store.
              </AppText>
            ) : null
          }
          ListEmptyComponent={
            narrowing ? (
              finishedQ.isFetching ? (
                <ActivityIndicator color={colors.ink} style={styles.loader} />
              ) : (
                <EmptyState
                  icon="search-outline"
                  title="No matching orders"
                  message={
                    finishedQ.hasNextPage
                      ? 'Not in what is loaded yet — load more to keep looking.'
                      : search.trim()
                        ? `Nothing found for “${search.trim()}”.`
                        : 'No orders match these filters.'
                  }
                />
              )
            ) : (
              <EmptyState {...EMPTY[tab]} />
            )
          }
          ListFooterComponent={
            showDone && finishedQ.hasNextPage ? (
              <PrimaryButton
                label="Load more"
                tone="surface"
                loading={finishedQ.isFetchingNextPage}
                onPress={() => finishedQ.fetchNextPage()}
                style={styles.more}
              />
            ) : null
          }
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onPress={() => navigation.navigate('OrderDetail', { id: item.id })}
              onAccept={canAccept ? () => run(item, 'accept') : undefined}
              onReject={canAccept ? () => confirmReject(item) : undefined}
              busy={busyId === item.id}
            />
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { marginTop: spacing.md },
  loader: { marginTop: spacing.xl },
  banner: { marginTop: spacing.md },
  // Clears the floating bottom nav.
  list: { paddingTop: spacing.md, paddingBottom: 140, gap: spacing.sm },
  doneHeader: { gap: spacing.xs, marginBottom: spacing.xs },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.sm + 4,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm + 4,
    color: colors.ink,
    fontFamily: typeScale.body.fontFamily,
    fontSize: typeScale.body.fontSize,
  },
  more: { marginTop: spacing.sm },
});
