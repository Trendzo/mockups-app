import React from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
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
import {
  PENDING_PAUSE,
  useKyc,
  useRetailerMe,
  useSetOrderAcceptance,
} from '../api/onboardingHooks';
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
  const reopenAt =
    store?.orderPauseUntil && store.orderPauseUntil !== PENDING_PAUSE
      ? formatReopen(store.orderPauseUntil)
      : null;
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

        <HeroHeadline
          align="left"
          fontSize={38}
          style={styles.headline}
          lines={[{ text: 'Create Mockups' }, { text: 'Instantly', muted: true }]}
        />

        <AppText variant="body" color={colors.meta} style={styles.sub}>
          Turn a garment photo into studio-grade mockups, then manage them as products.
        </AppText>

        {store ? (
          <StoreStatusCard
            online={online}
            pending={setAccept.isPending}
            reopenAt={reopenAt}
            onToggle={toggleOnline}
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
  headline: { marginTop: spacing.xs },
  sub: { marginBottom: spacing.sm },
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
