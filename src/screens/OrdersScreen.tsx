import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet } from 'react-native';
import {
  AppText,
  Banner,
  EmptyState,
  FilterChips,
  IconButton,
  OrderCard,
  Screen,
  ScreenHeader,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useActiveOrders, useDoneOrders, useOrderAction } from '../api/ordersHooks';
import { useInbox } from '../api/notifications';
import { errorMessage } from '../api/request';
import { ORDER_TABS, OrderRow, OrderTab } from '../types/orders';
import { sortForTab } from '../utils/orders';
import { usePullRefresh } from '../utils/usePullRefresh';
import { colors, spacing } from '../theme/theme';

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

/** Online orders from the consumer app, grouped the way the store works them. */
export function OrdersScreen({ navigation, route }: ScreenProps<'Orders'>) {
  const toast = useToast();
  const [tab, setTab] = useState<OrderTab>(route.params?.tab ?? 'new');
  // Re-select whenever another screen links here with a tab. Keyed on the
  // params object (new on every navigate) so tapping the same Home tile twice
  // still jumps back after the retailer switched tabs by hand.
  const params = route.params;
  useEffect(() => {
    if (params?.tab) setTab(params.tab);
  }, [params]);

  const showDone = DONE_TABS.includes(tab);
  const activeQ = useActiveOrders();
  const doneQ = useDoneOrders(showDone);
  const inbox = useInbox();
  const action = useOrderAction();
  const [busyId, setBusyId] = useState<string | null>(null);

  const source = showDone ? doneQ : activeQ;
  const pull = usePullRefresh(source.refetch);
  const all: OrderRow[] = useMemo(() => source.data ?? [], [source.data]);
  const active: OrderRow[] = useMemo(() => activeQ.data ?? [], [activeQ.data]);

  const counts = useMemo(() => {
    const c = {} as Record<OrderTab, number>;
    for (const t of ORDER_TABS) c[t.key] = active.filter((o) => t.statuses.includes(o.status)).length;
    return c;
  }, [active]);

  const statuses = ORDER_TABS.find((t) => t.key === tab)!.statuses;
  const rows = useMemo(
    () => sortForTab(tab, all.filter((o) => statuses.includes(o.status))),
    [tab, all, statuses],
  );

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

  return (
    <Screen edges={['top']}>
      <ScreenHeader
        overline="Online orders"
        title="Orders"
        right={
          <IconButton
            icon="notifications-outline"
            badge={inbox.unread}
            onPress={() => navigation.navigate('Notifications')}
          />
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
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.ink}
            />
          }
          ListHeaderComponent={
            tab === 'new' && rows.length > 0 ? (
              <AppText variant="meta" color={colors.meta}>
                Accept quickly — an order not accepted in time moves to another store.
              </AppText>
            ) : null
          }
          ListEmptyComponent={<EmptyState {...EMPTY[tab]} />}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onPress={() => navigation.navigate('OrderDetail', { id: item.id })}
              onAccept={() => run(item, 'accept')}
              onReject={() => confirmReject(item)}
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
});
