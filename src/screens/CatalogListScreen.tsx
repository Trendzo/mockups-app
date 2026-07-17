import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  RefreshControl,
  StyleProp,
  StyleSheet,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppImage,
  AppText,
  Banner,
  BottomSheet,
  SheetSurface,
  Icon,
  PressableScale,
  PrimaryButton,
  Screen,
  SegmentedControl,
  StatusChip,
  toneForStatus,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useListings } from '../api/catalogHooks';
import { useRetailerMe } from '../api/onboardingHooks';
import { deleteListing, updateListing } from '../api/catalogManagement';
import { useProductDraft } from '../store/productDraft';
import { useAuth } from '../store/auth';
import { canWriteCatalog, Listing, ListingStatus } from '../types/catalog';
import { formatPaise } from '../utils/money';
import { colors, radii, spacing } from '../theme/theme';

type StatusFilter = 'all' | ListingStatus;
type StockFilter = 'all' | 'in_stock' | 'low' | 'out';
const LOW_STOCK = 5;
const SCREEN_W = Dimensions.get('window').width;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'retired', label: 'Retired' },
];
const STOCK_FILTERS: { value: StockFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'in_stock', label: 'In stock' },
  { value: 'low', label: 'Low' },
  { value: 'out', label: 'Out' },
];

function totalStock(l: Listing): number {
  return (l.variants ?? []).reduce((s, v) => s + (v.stock || 0), 0);
}

export function CatalogListScreen({ navigation }: ScreenProps<'Catalog'>) {
  const insets = useSafeAreaInsets();
  // Prefer the fresh /retailer/me sub-role; the login snapshot may omit it.
  const me = useRetailerMe();
  const authSubRole = useAuth((s) => s.retailer?.subRole);
  const canWrite = canWriteCatalog(me.data?.retailer.subRole ?? authSubRole);
  const qc = useQueryClient();
  const toast = useToast();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['listings'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  // Swipe-right action: publish a draft/retired product.
  const publish = async (l: Listing) => {
    try {
      await updateListing(l.id, { status: 'active' });
      toast.show('Published', 'success');
      refresh();
    } catch (e: any) {
      // cannot_publish_incomplete lists what's missing in the message.
      toast.show(e?.message ?? 'Could not publish', 'error');
    }
  };

  // Swipe-left action: delete a product (confirm first - it can't be undone).
  const remove = (l: Listing) => {
    Alert.alert('Delete product', `Delete "${l.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteListing(l.id);
            toast.show('Product deleted', 'info');
            refresh();
          } catch (e: any) {
            toast.show(e?.message ?? 'Could not delete', 'error');
          }
        },
      },
    ]);
  };

  const [status, setStatus] = useState<StatusFilter>('all');
  const [stock, setStock] = useState<StockFilter>('all');
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  const listingsQ = useListings(status === 'all' ? undefined : status);
  const all = listingsQ.data ?? [];

  const q = search.trim().toLowerCase();
  const listings = all.filter((l) => {
    if (q && !l.name.toLowerCase().includes(q)) return false;
    if (stock !== 'all') {
      const t = totalStock(l);
      if (stock === 'out' && t !== 0) return false;
      if (stock === 'in_stock' && t <= 0) return false;
      if (stock === 'low' && !(t > 0 && t <= LOW_STOCK)) return false;
    }
    return true;
  });

  const filtersActive = status !== 'all' || stock !== 'all' || q !== '';
  const clearFilters = () => {
    setStatus('all');
    setStock('all');
    setSearch('');
  };

  return (
    <Screen edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="sectionLabel" color={colors.meta}>
            Products & inventory
          </AppText>
          <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
            Catalog
          </AppText>
        </View>
        <PressableScale onPress={() => setFilterOpen(true)} style={styles.iconBtn}>
          <Icon name="options-outline" size={22} color={colors.ink} />
          {filtersActive ? <View style={styles.dot} /> : null}
        </PressableScale>
      </View>

      {listingsQ.isLoading ? (
        <ActivityIndicator color={colors.ink} style={styles.loader} />
      ) : listingsQ.isError ? (
        <View style={styles.pad}>
          <Banner
            tone="danger"
            title="Couldn't load products"
            message={(listingsQ.error as any)?.message}
            actionLabel="Retry"
            onAction={() => listingsQ.refetch()}
          />
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={listingsQ.isRefetching}
              onRefresh={() => listingsQ.refetch()}
              tintColor={colors.ink}
            />
          }
          ListEmptyComponent={
            <AppText variant="meta" color={colors.meta} style={styles.empty}>
              {filtersActive ? 'No products match these filters.' : 'No products yet.'}
            </AppText>
          }
          renderItem={({ item }) => (
            <ProductRow
              listing={item}
              onPress={() => navigation.navigate('ProductDetail', { id: item.id })}
              onDelete={canWrite ? () => remove(item) : undefined}
              onPublish={canWrite ? () => publish(item) : undefined}
            />
          )}
        />
      )}

      {/* Filters */}
      <BottomSheet visible={filterOpen} onClose={() => setFilterOpen(false)}>
        <SheetSurface style={styles.sheet}>
          <View style={styles.sheetHead}>
            <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
              Filters
            </AppText>
            {filtersActive ? (
              <PressableScale onPress={clearFilters} haptic={false}>
                <AppText variant="bodyMedium" color={colors.ink}>
                  Clear all
                </AppText>
              </PressableScale>
            ) : null}
          </View>

          <View style={styles.filterBlock}>
            <AppText variant="sectionLabel" color={colors.meta}>
              Search
            </AppText>
            <View style={styles.searchBox}>
              <Icon name="search" size={18} color={colors.meta} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Product name"
                placeholderTextColor={colors.inkMuted}
                autoCapitalize="none"
                style={styles.searchInput}
              />
            </View>
          </View>

          <View style={styles.filterBlock}>
            <AppText variant="sectionLabel" color={colors.meta}>
              Status
            </AppText>
            <SegmentedControl<StatusFilter> value={status} onChange={setStatus} options={STATUS_FILTERS} />
          </View>

          <View style={styles.filterBlock}>
            <AppText variant="sectionLabel" color={colors.meta}>
              Stock
            </AppText>
            <SegmentedControl<StockFilter> value={stock} onChange={setStock} options={STOCK_FILTERS} />
          </View>

          <PrimaryButton label="Show results" tone="accent" onPress={() => setFilterOpen(false)} />
        </SheetSurface>
      </BottomSheet>

      {canWrite ? (
        <PressableScale
          onPress={() => {
            useProductDraft.getState().startCreate();
            navigation.navigate('ProductWizardBasics');
          }}
          style={[styles.fab, { bottom: insets.bottom + 86 }]}
        >
          <Icon name="add" size={20} color={colors.accentInk} />
          <AppText variant="meta" color={colors.accentInk} style={styles.fabLabel}>
            New product
          </AppText>
        </PressableScale>
      ) : null}
    </Screen>
  );
}

function ProductRow({
  listing,
  onPress,
  onDelete,
  onPublish,
}: {
  listing: Listing;
  onPress: () => void;
  onDelete?: () => void;
  onPublish?: () => void;
}) {
  const variants = listing.variants ?? [];
  const price = variants[0] ? formatPaise(variants[0].pricePaise) : '-';
  const stock = totalStock(listing);
  const thumb = listing.galleryUrls?.[0];
  const swipeRef = useRef<SwipeableMethods>(null);
  // True once a swipe drag has begun - lets us swallow the tap that fires on
  // release so a swipe never navigates. Reset only after the row settles closed.
  const dragged = useRef(false);
  // Publishing only makes sense for a not-yet-active product.
  const canPublish = !!onPublish && listing.status !== 'active';
  const swipeable = !!onDelete || canPublish;

  const handlePress = () => {
    if (dragged.current) {
      // The touch was a swipe, not a tap - close any open action, don't open.
      dragged.current = false;
      swipeRef.current?.close();
      return;
    }
    onPress();
  };

  const row = (
    // No press-shrink on swipeable rows: the scale-down would pull the row in
    // and reveal the coloured action panels behind it at the corners/edges.
    <PressableScale onPress={handlePress} toScale={swipeable ? 1 : 0.98} style={styles.row}>
      {thumb ? (
        <AppImage uri={thumb} radius={radii.sm} containerStyle={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Icon name="image-outline" size={22} color={colors.inkMuted} />
        </View>
      )}
      <View style={styles.rowBody}>
        <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
          {listing.name}
        </AppText>
        <AppText variant="meta" color={stock <= 0 ? colors.danger : colors.meta} numberOfLines={1}>
          {price} · {stock} in stock · {variants.length || 0} variant
          {variants.length === 1 ? '' : 's'}
        </AppText>
      </View>
      <StatusChip label={listing.status.replace(/_/g, ' ')} tone={toneForStatus(listing.status)} />
    </PressableScale>
  );

  // Read-only users get a plain row (no swipe actions).
  if (!onDelete && !canPublish) return row;

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={1}
      leftThreshold={48}
      rightThreshold={48}
      overshootLeft={false}
      overshootRight={false}
      containerStyle={styles.swipeContainer}
      onSwipeableOpenStartDrag={() => {
        dragged.current = true;
      }}
      onSwipeableClose={() => {
        dragged.current = false;
      }}
      // Swiping far enough IS the action - no button to tap. `WillOpen` fires
      // the moment the release crosses the threshold (~48pt), so a slight slide
      // is enough - waiting for `Open` would mean sliding the full panel width.
      // NOTE: `direction` is the SWIPE direction, not the panel side - swiping
      // RIGHT opens the left Publish panel and reports 'right'.
      onSwipeableWillOpen={(direction) => {
        swipeRef.current?.close();
        if (String(direction) === 'right') onPublish?.();
        else onDelete?.();
      }}
      // Swiping RIGHT reveals this full-width panel on the left → Publish.
      // NOTE: the library overlays BOTH action containers full-size, so each
      // panel must hide itself unless ITS swipe is in progress — otherwise one
      // panel (rendered on top) covers the other.
      renderLeftActions={
        canPublish
          ? (progress) => (
              <SwipePanel progress={progress} style={[styles.swipeAction, styles.publishAction]}>
                <View style={styles.actionStart}>
                  <Icon name="cloud-upload-outline" size={22} color={colors.accentInk} />
                  <AppText variant="bodyMedium" color={colors.accentInk}>
                    Publish
                  </AppText>
                </View>
              </SwipePanel>
            )
          : undefined
      }
      // Swiping LEFT reveals this full-width panel on the right → Delete.
      renderRightActions={
        onDelete
          ? (progress) => (
              <SwipePanel progress={progress} style={[styles.swipeAction, styles.deleteAction]}>
                <View style={styles.actionEnd}>
                  <Icon name="trash-outline" size={22} color={colors.surface} />
                  <AppText variant="bodyMedium" color={colors.surface}>
                    Delete
                  </AppText>
                </View>
              </SwipePanel>
            )
          : undefined
      }
    >
      {row}
    </ReanimatedSwipeable>
  );
}

/** Action panel that is only visible while its own swipe is in progress. */
function SwipePanel({
  progress,
  style,
  children,
}: {
  progress: SharedValue<number>;
  style: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const visible = useAnimatedStyle(() => ({ opacity: progress.value > 0 ? 1 : 0 }));
  return <Animated.View style={[style, visible]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  headerText: { flex: 1 },
  h1: { fontSize: 24, lineHeight: 28 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  loader: { marginTop: spacing.xl },
  pad: { marginTop: spacing.md },
  listContent: { paddingTop: spacing.md, paddingBottom: 160, gap: spacing.sm },
  fab: {
    position: 'absolute',
    right: spacing.screenH,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabLabel: { fontSize: 15, lineHeight: 20, textAlignVertical: 'center', includeFontPadding: false },
  empty: { textAlign: 'center', marginTop: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.sm + 2,
  },
  thumb: { width: 52, height: 52, borderRadius: radii.sm },
  thumbEmpty: { backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  // Clip the whole swipeable to the card shape so a revealed action can never
  // bleed past the rounded corners.
  swipeContainer: { borderRadius: radii.card, overflow: 'hidden' },
  // Full-width coloured panel behind the row (clipped to the card by the
  // container). The inner block keeps the label near the edge being revealed.
  swipeAction: { width: SCREEN_W },
  actionStart: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  actionEnd: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  publishAction: { backgroundColor: colors.accent },
  deleteAction: { backgroundColor: colors.danger },
  rowBody: { flex: 1, gap: 2 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
  filterBlock: { gap: spacing.sm },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.canvas,
    borderRadius: radii.sm + 4,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: spacing.sm + 2, color: colors.ink, fontSize: 15 },
});
