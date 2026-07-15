import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppImage,
  AppText,
  Banner,
  BottomSheet,
  Icon,
  PressableScale,
  PrimaryButton,
  Screen,
  SegmentedControl,
  StatusChip,
  toneForStatus,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useListings } from '../api/catalogHooks';
import { useProductDraft } from '../store/productDraft';
import { useAuth } from '../store/auth';
import { canWriteCatalog, Listing, ListingStatus } from '../types/catalog';
import { formatPaise } from '../utils/money';
import { colors, radii, spacing } from '../theme/theme';

type StatusFilter = 'all' | ListingStatus;
type StockFilter = 'all' | 'in_stock' | 'low' | 'out';
const LOW_STOCK = 5;

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
  const canWrite = canWriteCatalog(useAuth((s) => s.retailer?.subRole));

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
            />
          )}
        />
      )}

      {/* Filters */}
      <BottomSheet visible={filterOpen} onClose={() => setFilterOpen(false)}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
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
        </View>
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

function ProductRow({ listing, onPress }: { listing: Listing; onPress: () => void }) {
  const variants = listing.variants ?? [];
  const price = variants[0] ? formatPaise(variants[0].pricePaise) : '—';
  const stock = totalStock(listing);
  const thumb = listing.galleryUrls?.[0];
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={styles.row}>
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
