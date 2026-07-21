import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  AppImage,
  AppText,
  Banner,
  Card,
  HeroHeadline,
  Icon,
  PressableScale,
  Screen,
  StatusChip,
  toneForStatus,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useCaptureDraft } from '../store/captureDraft';
import { useKyc, useRetailerMe, useSetOrderAcceptance } from '../api/onboardingHooks';
import { useListings } from '../api/catalogHooks';
import { Listing } from '../types/catalog';
import { formatPaise } from '../utils/money';
import { colors, radii, spacing } from '../theme/theme';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

export function HomeScreen({ navigation }: ScreenProps<'Home'>) {
  const clearDraft = useCaptureDraft((s) => s.clear);
  const kyc = useKyc();
  const meQ = useRetailerMe();
  const listingsQ = useListings();
  const listings = listingsQ.data ?? [];

  const store = meQ.data?.store ?? null;
  const online = !store?.orderPauseUntil;
  const reopenAt = store?.orderPauseUntil ? formatReopen(store.orderPauseUntil) : null;
  const setAccept = useSetOrderAcceptance();
  const toast = useToast();

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

  const startNewMockup = () => {
    clearDraft();
    navigation.navigate('SelectPhotos');
  };

  const productCount = listings.length;
  const prices = listings
    .map((l) => l.variants?.[0]?.pricePaise)
    .filter((p): p is number => typeof p === 'number' && p > 0);
  const avgPaise = prices.length
    ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
    : null;
  const recent = listings.slice(0, 5);

  return (
    <Screen edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <AppText variant="sectionLabel" color={colors.meta}>
          Trendzo Studio
        </AppText>

        {/* Hero: headline on the left, online/offline toggle aligned to its right. */}
        <View style={styles.heroRow}>
          <View style={styles.heroText}>
            <HeroHeadline
              align="left"
              fontSize={38}
              style={styles.headline}
              lines={[{ text: 'Create Mockups' }, { text: 'Instantly', muted: true }]}
            />
          </View>
          {store ? (
            <StoreToggle
              online={online}
              pending={setAccept.isPending}
              reopenAt={reopenAt}
              onToggle={toggleOnline}
            />
          ) : null}
        </View>

        <AppText variant="body" color={colors.meta} style={styles.sub}>
          Turn a garment photo into studio-grade mockups, then manage them as products.
        </AppText>

        {store && !online ? (
          <Banner
            tone="warning"
            title="You're offline"
            message={
              reopenAt
                ? `Not accepting new orders. Auto-reopens ${reopenAt} — or reopen now.`
                : 'Not accepting new orders. Reopen whenever you are ready.'
            }
            actionLabel={setAccept.isPending ? 'Reopening…' : 'Go online now'}
            onAction={toggleOnline}
          />
        ) : null}

        {kycNeedsAction ? (
          <Banner
            tone={kyc.data!.status === 'pending' ? 'warning' : 'danger'}
            title={
              kyc.data!.status === 'rejected'
                ? 'Some KYC documents were rejected'
                : kyc.data!.status === 'overdue'
                  ? 'KYC overdue'
                  : 'KYC verification due'
            }
            message={
              kyc.data!.status === 'rejected'
                ? 'Re-upload the rejected documents and submit again.'
                : kyc.data!.status === 'overdue'
                  ? 'Submit before the grace period ends or your store will be paused.'
                  : 'Upload your documents to stay verified.'
            }
            actionLabel="Complete KYC"
            onAction={() => navigation.navigate('Kyc')}
          />
        ) : null}

        <Animated.View entering={FadeInDown.delay(60).springify()}>
          <Card
            tone="yellow"
            titleTop="New"
            titleBottom="Mockup"
            meta="Capture → generate"
            height={160}
            onPress={startNewMockup}
            graphic={<Icon name="tshirt-crew" set="mci" size={56} color={colors.accentInk} />}
          />
        </Animated.View>

        {/* Overview stats */}
        <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.statsWrap}>
          <View style={styles.statRow}>
            <StatTile
              value={listingsQ.isLoading ? '…' : String(productCount)}
              label="Products"
              icon="cube-outline"
            />
            <StatTile
              value={avgPaise != null ? formatPaise(avgPaise) : '-'}
              label="Avg. price"
              icon="pricetag-outline"
            />
          </View>
          <PressableScale
            onPress={() => navigation.navigate('Catalog')}
            toScale={0.98}
            style={styles.catalogCard}
          >
            <View style={styles.catalogIcon}>
              <Icon name="pricetags-outline" size={22} color={colors.accentInk} />
            </View>
            <View style={styles.flex}>
              <AppText variant="bodyMedium" color={colors.ink}>
                Product Catalog
              </AppText>
              <AppText variant="meta" color={colors.meta}>
                Manage products, variants & inventory
              </AppText>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.meta} />
          </PressableScale>
        </Animated.View>

        {/* Created products */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText variant="sectionLabel" color={colors.meta}>
              Created products
            </AppText>
            {recent.length > 0 ? (
              <PressableScale onPress={() => navigation.navigate('Catalog')} haptic={false}>
                <AppText variant="meta" color={colors.ink}>
                  View all
                </AppText>
              </PressableScale>
            ) : null}
          </View>
          {recent.length === 0 ? (
            <AppText variant="meta" color={colors.meta} style={styles.empty}>
              No products yet - publish a mockup and it shows up here.
            </AppText>
          ) : (
            recent.map((l) => (
              <ProductMiniRow
                key={l.id}
                listing={l}
                onPress={() => navigation.navigate('ProductDetail', { id: l.id })}
              />
            ))
          )}
        </View>
      </ScrollView>

    </Screen>
  );
}

/**
 * Compact online/offline switch that sits beside the hero headline. The whole
 * card is tappable; the Switch mirrors state. Off = store paused for new orders
 * until its next opening window (auto-reopen), with a manual "open early" tap.
 */
function StoreToggle({
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
  return (
    <PressableScale onPress={onToggle} toScale={0.97} haptic={false} style={styles.toggleCard}>
      <View style={styles.toggleHead}>
        <View style={[styles.dot, { backgroundColor: tint }]} />
        <AppText variant="sectionLabel" color={colors.ink}>
          {online ? 'Online' : 'Offline'}
        </AppText>
      </View>
      {pending ? (
        <ActivityIndicator size="small" color={colors.ink} style={styles.toggleSwitch} />
      ) : (
        <Switch
          value={online}
          onValueChange={onToggle}
          trackColor={{ false: colors.cardGray, true: colors.success }}
          thumbColor={colors.surface}
          ios_backgroundColor={colors.cardGray}
          style={styles.toggleSwitch}
        />
      )}
      <AppText variant="meta" color={colors.meta} style={styles.toggleHint} numberOfLines={2}>
        {online ? 'Accepting orders' : reopenAt ? `Opens ${reopenAt}` : 'Orders paused'}
      </AppText>
    </PressableScale>
  );
}

function StatTile({
  value,
  label,
  icon,
  onPress,
}: {
  value: string;
  label: string;
  icon: string;
  onPress?: () => void;
}) {
  const inner = (
    <View style={styles.tile}>
      <Icon name={icon} size={18} color={colors.meta} />
      <AppText variant="cardTitle" color={colors.ink} style={styles.tileValue} numberOfLines={1}>
        {value}
      </AppText>
      <AppText variant="meta" color={colors.meta}>
        {label}
      </AppText>
    </View>
  );
  return onPress ? (
    <PressableScale onPress={onPress} toScale={0.98} style={styles.flex}>
      {inner}
    </PressableScale>
  ) : (
    <View style={styles.flex}>{inner}</View>
  );
}

function ProductMiniRow({ listing, onPress }: { listing: Listing; onPress: () => void }) {
  const price = listing.variants?.[0] ? formatPaise(listing.variants[0].pricePaise) : '-';
  const thumb = listing.galleryUrls?.[0];
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={styles.miniRow}>
      {thumb ? (
        <AppImage uri={thumb} radius={radii.sm} containerStyle={styles.miniThumb} />
      ) : (
        <View style={[styles.miniThumb, styles.miniThumbEmpty]}>
          <Icon name="image-outline" size={18} color={colors.inkMuted} />
        </View>
      )}
      <View style={styles.flex}>
        <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
          {listing.name}
        </AppText>
        <AppText variant="meta" color={colors.meta}>
          {price}
        </AppText>
      </View>
      <StatusChip label={listing.status.replace(/_/g, ' ')} tone={toneForStatus(listing.status)} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg, paddingBottom: 130, gap: spacing.md },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  heroText: { flex: 1 },
  headline: {},
  sub: { marginBottom: spacing.sm },
  toggleCard: {
    width: 118,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 2,
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  toggleHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  toggleSwitch: { alignSelf: 'flex-start', marginTop: 2 },
  toggleHint: { marginTop: 2 },
  flex: { flex: 1 },
  statsWrap: { gap: spacing.md },
  statRow: { flexDirection: 'row', gap: spacing.md },
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.xs,
    minHeight: 96,
    justifyContent: 'center',
  },
  tileValue: { fontSize: 28, lineHeight: 32 },
  catalogCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  catalogIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { gap: spacing.sm, marginTop: spacing.xs },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  empty: { marginTop: spacing.xs },
  miniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.sm + 2,
  },
  miniThumb: { width: 44, height: 44, borderRadius: radii.sm },
  miniThumbEmpty: {
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
