import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import {
  AppText,
  Banner,
  EmptyState,
  FilterChips,
  Icon,
  IconButton,
  PressableScale,
  Screen,
  ScreenHeader,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useInbox, useMarkAllInboxRead, useMarkInboxRead } from '../api/notifications';
import { errorMessage } from '../api/request';
import { INBOX_ICON, InboxItem } from '../types/notifications';
import { routeForDeepLink } from '../utils/orders';
import { usePullRefresh } from '../utils/usePullRefresh';
import { timeAgo } from '../utils/format';
import { colors, radii, spacing } from '../theme/theme';

type Filter = 'unread' | 'all';

/** Store inbox: order, payout, KYC and Trendzo announcements. */
export function NotificationsScreen({ navigation }: ScreenProps<'Notifications'>) {
  const inbox = useInbox();
  const pull = usePullRefresh(inbox.refetch);
  const markRead = useMarkInboxRead();
  const markAll = useMarkAllInboxRead();
  const items = useMemo(() => inbox.data ?? [], [inbox.data]);
  const [filter, setFilter] = useState<Filter>('unread');
  // Land on "All" when there's nothing unread, so the list isn't empty.
  const effective: Filter = filter === 'unread' && inbox.unread === 0 && items.length ? 'all' : filter;
  const rows = effective === 'unread' ? items.filter((n) => !n.readAt) : items;

  const open = (n: InboxItem) => {
    if (!n.readAt) markRead.mutate(n.id);
    const target = routeForDeepLink(n.deepLink);
    if (target) (navigation.navigate as (name: string, params?: object) => void)(target.name, target.params);
  };

  return (
    <Screen edges={['top']}>
      <ScreenHeader
        overline="Inbox"
        title="Notifications"
        onBack={() => navigation.goBack()}
        right={
          <>
            {/* Always in place (disabled when nothing's unread) so the list never jumps. */}
            <IconButton
              icon="checkmark-done-outline"
              disabled={inbox.unread === 0 || markAll.isPending}
              onPress={() => markAll.mutate()}
            />
            <IconButton icon="settings-outline" onPress={() => navigation.navigate('NotificationSettings')} />
          </>
        }
      />
      <FilterChips<Filter>
        options={[
          { value: 'unread', label: 'Unread', count: inbox.unread },
          { value: 'all', label: 'All' },
        ]}
        value={effective}
        onChange={setFilter}
        style={styles.chips}
      />

      {inbox.isLoading ? (
        <ActivityIndicator color={colors.ink} style={styles.loader} />
      ) : inbox.isError && !inbox.data ? (
        <Banner
          tone="danger"
          title="Couldn't load notifications"
          message={errorMessage(inbox.error)}
          actionLabel="Retry"
          onAction={() => inbox.refetch()}
          style={styles.loader}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.ink}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="notifications-off-outline"
              title={effective === 'unread' ? "You're all caught up" : 'No notifications yet'}
              message="Order updates, payouts and messages from Trendzo appear here."
            />
          }
          renderItem={({ item }) => <InboxRow item={item} onPress={() => open(item)} />}
        />
      )}
    </Screen>
  );
}

function InboxRow({ item, onPress }: { item: InboxItem; onPress: () => void }) {
  const unread = !item.readAt;
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={styles.row}>
      <View style={[styles.icon, unread && styles.iconUnread]}>
        <Icon
          name={INBOX_ICON[item.kind] ?? 'notifications-outline'}
          size={18}
          color={unread ? colors.accentInk : colors.ink}
        />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <AppText
            variant={unread ? 'bodyMedium' : 'body'}
            color={colors.ink}
            numberOfLines={1}
            style={styles.flex}
          >
            {item.title}
          </AppText>
          <AppText variant="meta" color={colors.meta}>
            {timeAgo(item.createdAt)}
          </AppText>
        </View>
        {item.body ? (
          <AppText variant="meta" color={colors.meta} numberOfLines={3}>
            {item.body}
          </AppText>
        ) : null}
      </View>
      {unread ? <View style={styles.dot} /> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chips: { marginTop: spacing.md },
  loader: { marginTop: spacing.xl },
  list: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnread: { backgroundColor: colors.accent },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger, marginTop: 6 },
});
