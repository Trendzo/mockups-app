import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Keyboard,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  Banner,
  BottomSheet,
  Divider,
  EmptyState,
  FilterChips,
  Icon,
  IconButton,
  KeyboardStickyView,
  ListRow,
  PressableScale,
  PrimaryButton,
  QtyStepper,
  Screen,
  ScreenHeader,
  SheetSurface,
  useToast,
} from '../components';
import type { FilterOption } from '../components';
import { ScreenProps } from '../navigation/types';
import {
  useBulkSetVariantsActive,
  useInventoryInfinite,
  useReservations,
  useSaveLowStockThreshold,
  useStockAdjustments,
} from '../api/catalogHooks';
import { downloadCatalogCsv } from '../api/catalogueExport';
import { errorMessage } from '../api/request';
import {
  InventoryFlag,
  InventoryPage,
  InventoryRow,
  ListingStatus,
  StockAdjustment,
} from '../types/catalog';
import { usePermissions } from '../utils/usePermission';
import { formatDayDate, humanize, plural, timeAgo } from '../utils/format';
import { colors, radii, spacing, type as typeScale } from '../theme/theme';
import { InventoryRowCard, rowTitle } from './inventory/InventoryRowCard';

type FlagFilter = 'all' | InventoryFlag;
type StatusFilter = 'all' | ListingStatus;
/** A sheet's variant. Kept after closing so the content doesn't blank mid-fade. */
type SheetTarget = { row: InventoryRow; open: boolean } | null;

const FLAG_OPTIONS: FilterOption<FlagFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
  { value: 'oversold', label: 'Oversold' },
];
const STATUS_OPTIONS: FilterOption<StatusFilter>[] = [
  { value: 'all', label: 'Any status' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'retired', label: 'Retired' },
  { value: 'taken_down', label: 'Taken down' },
];

const DEFAULT_THRESHOLD = 5;
const THRESHOLD_MIN = 1;
const THRESHOLD_MAX = 50;
/** The stock ledger's page size (server max); a full page means older changes were cut off. */
const LEDGER_LIMIT = 200;

/**
 * Stock across every variant in the store: search + flag/status filters, inline
 * stock / price / on-sale edits, bulk on/off, held-stock and history sheets, and
 * a menu for CSV import / export and the dead-stock report.
 *
 * What a login can do follows the server's permissions: `listings.edit` edits
 * stock, price and on-sale (and bulk on/off); `inventory.adjust` alone (floor
 * staff) corrects stock counts only; the menu entries need `inventory.import`,
 * `inventory.export` and `reports.view`.
 */
export function InventoryScreen({ navigation, route }: ScreenProps<'Inventory'>) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { can } = usePermissions();
  const canEdit = can('listings.edit');
  const canAdjust = can('inventory.adjust');
  const canImport = can('inventory.import');
  const canExport = can('inventory.export');
  const canReports = can('reports.view');
  /** Anything that opens the inline editor. */
  const canWrite = canEdit || canAdjust;
  const hasMenu = canImport || canExport || canReports;

  const [flag, setFlag] = useState<FlagFilter>(route.params?.flag ?? 'all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  // Arriving again with a different flag (e.g. a Home stock alert) re-filters.
  const paramFlag = route.params?.flag;
  const [lastParamFlag, setLastParamFlag] = useState(paramFlag);
  if (paramFlag !== lastParamFlag) {
    setLastParamFlag(paramFlag);
    setFlag(paramFlag ?? 'all');
  }

  // Only the settled search text goes to the server.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const inv = useInventoryInfinite({
    q: query || undefined,
    flag: flag === 'all' ? undefined : flag,
    status: status === 'all' ? undefined : status,
  });
  const pages = inv.data?.pages;
  const rows = useMemo(() => flattenRows(pages), [pages]);
  const total = pages?.length ? pages[pages.length - 1].total : 0;
  const threshold = pages?.[0]?.lowStockThreshold ?? DEFAULT_THRESHOLD;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [thresholdOpen, setThresholdOpen] = useState(false);
  const [thresholdDraft, setThresholdDraft] = useState(DEFAULT_THRESHOLD);
  const [holds, setHolds] = useState<SheetTarget>(null);
  const [history, setHistory] = useState<SheetTarget>(null);
  const [pulling, setPulling] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const bulk = useBulkSetVariantsActive();

  // Bulk on/off patches variants, which needs listings.edit.
  const selecting = canEdit && selectMode;
  // Bulk actions only touch rows loaded under the current search / filters.
  const selectedIds = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  // Fresh copy so the held count follows refetches while the sheet is open.
  const holdsRow = holds ? rows.find((r) => r.id === holds.row.id) ?? holds.row : null;

  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  // Android back leaves select mode before it leaves the screen.
  useEffect(() => {
    if (!selecting) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      exitSelect();
      return true;
    });
    return () => sub.remove();
  }, [selecting, exitSelect]);

  const onPressRow = useCallback(
    (row: InventoryRow) => {
      if (selecting) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(row.id)) next.delete(row.id);
          else next.add(row.id);
          return next;
        });
      } else if (canWrite) {
        Keyboard.dismiss();
        setExpandedId((cur) => (cur === row.id ? null : row.id));
      } else {
        // Read-only staff: the history is the useful detail.
        setHistory({ row, open: true });
      }
    },
    [selecting, canWrite],
  );
  const onSaved = useCallback(
    (row: InventoryRow) => setExpandedId((cur) => (cur === row.id ? null : cur)),
    [],
  );
  const openHolds = useCallback((row: InventoryRow) => {
    Keyboard.dismiss();
    setHolds({ row, open: true });
  }, []);
  const openHistory = useCallback((row: InventoryRow) => {
    Keyboard.dismiss();
    setHistory({ row, open: true });
  }, []);
  const openProduct = useCallback(
    (row: InventoryRow) => navigation.navigate('ProductDetail', { id: row.listingId }),
    [navigation],
  );

  const toggleSelectMode = () => {
    Keyboard.dismiss();
    setExpandedId(null);
    if (selectMode) exitSelect();
    else setSelectMode(true);
  };

  const openThreshold = () => {
    Keyboard.dismiss();
    setThresholdDraft(Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, threshold)));
    setThresholdOpen(true);
  };

  const clearSearch = () => {
    setSearch('');
    setQuery('');
  };
  const clearFilters = () => {
    clearSearch();
    setFlag('all');
    setStatus('all');
  };

  const onRefresh = async () => {
    // Own flag, so background refetches after a save don't spin the control.
    setPulling(true);
    try {
      await inv.refetch();
    } finally {
      setPulling(false);
    }
  };

  const runBulk = async (isActive: boolean) => {
    if (!selectedIds.length) return;
    try {
      const { updated, failed } = await bulk.mutateAsync({ ids: selectedIds, isActive });
      if (updated === 0) {
        // Nothing went through - stay in select mode so they can retry.
        toast.show(`Couldn't update ${plural(failed, 'variant')}`, 'error');
        return;
      }
      const failNote = failed > 0 ? `, ${failed} failed` : '';
      toast.show(
        `${plural(updated, 'variant')} ${isActive ? 'activated' : 'deactivated'}${failNote}`,
        failed > 0 ? 'error' : 'success',
      );
      exitSelect();
    } catch (e) {
      toast.show(errorMessage(e, "Couldn't update variants"), 'error');
    }
  };

  /** CSV of what the current search / filters show (the file matches the screen). */
  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { location, filename } = await downloadCatalogCsv('inventory', {
        filters: {
          q: query || undefined,
          flag: flag === 'all' ? undefined : flag,
          status: status === 'all' ? undefined : status,
        },
      });
      setMenuOpen(false);
      toast.show(
        location === 'downloads' ? `Saved ${filename} to Downloads` : `Saved ${filename} to Files`,
        'success',
      );
    } catch (e) {
      toast.show(errorMessage(e, "Couldn't export inventory"), 'error');
    } finally {
      setExporting(false);
    }
  };

  const goFromMenu = (target: 'InventoryImport' | 'DeadStock') => {
    setMenuOpen(false);
    navigation.navigate(target);
  };

  const empty = emptyCopy(query, flag, status, threshold);

  return (
    <Screen edges={['top']} padded={false}>
      <ScreenHeader
        overline="Products"
        title="Inventory"
        onBack={() => navigation.goBack()}
        style={styles.header}
        right={
          canEdit || canAdjust || hasMenu ? (
            <>
              {canEdit ? (
                <IconButton
                  icon="checkbox-outline"
                  tone={selecting ? 'ink' : 'surface'}
                  onPress={toggleSelectMode}
                />
              ) : null}
              {canAdjust ? <IconButton icon="options-outline" onPress={openThreshold} /> : null}
              {hasMenu ? (
                <IconButton
                  icon="ellipsis-horizontal"
                  onPress={() => {
                    Keyboard.dismiss();
                    setMenuOpen(true);
                  }}
                />
              ) : null}
            </>
          ) : undefined
        }
      />

      <FlatList
        style={styles.flex}
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <InventoryRowCard
            row={item}
            threshold={threshold}
            selectMode={selecting}
            selected={selected.has(item.id)}
            expanded={canWrite && !selecting && expandedId === item.id}
            editMode={canEdit ? 'full' : 'stock'}
            onPress={onPressRow}
            onSaved={onSaved}
            onHolds={openHolds}
            onHistory={openHistory}
            onOpenProduct={openProduct}
          />
        )}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.searchBox}>
              <Icon name="search" size={18} color={colors.meta} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                onSubmitEditing={() => setQuery(search.trim())}
                placeholder="Search SKU, product, brand…"
                placeholderTextColor={colors.inkMuted}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                style={styles.searchInput}
              />
              {search ? (
                <PressableScale onPress={clearSearch} hitSlop={10} haptic={false}>
                  <Icon name="close-circle" size={18} color={colors.inkMuted} />
                </PressableScale>
              ) : null}
            </View>
            <FilterChips options={FLAG_OPTIONS} value={flag} onChange={setFlag} />
            <FilterChips options={STATUS_OPTIONS} value={status} onChange={setStatus} />
            {rows.length ? (
              <View style={styles.summaryRow}>
                <AppText variant="meta" color={colors.meta} style={styles.flex}>
                  Showing {rows.length} of {total} {total === 1 ? 'variant' : 'variants'} ·
                  low-stock alert at {threshold}
                </AppText>
                {/* Always mounted, so the summary never re-wraps as loading starts/stops. */}
                <ActivityIndicator
                  size="small"
                  color={colors.ink}
                  animating={inv.isPlaceholderData}
                  hidesWhenStopped={false}
                  style={inv.isPlaceholderData ? null : styles.hidden}
                />
              </View>
            ) : null}
            {inv.isRefetchError && rows.length ? (
              <Banner
                tone="danger"
                title="Couldn't refresh inventory"
                message={errorMessage(inv.error)}
                actionLabel="Retry"
                onAction={() => inv.refetch()}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          inv.isPending ? (
            <ActivityIndicator color={colors.ink} style={styles.loader} />
          ) : inv.isError ? (
            <Banner
              tone="danger"
              title="Couldn't load inventory"
              message={errorMessage(inv.error)}
              actionLabel="Retry"
              onAction={() => inv.refetch()}
            />
          ) : (
            <EmptyState
              icon={empty.icon}
              title={empty.title}
              message={empty.message}
              actionLabel={empty.action}
              onAction={clearFilters}
            />
          )
        }
        ListFooterComponent={
          !rows.length ? null : inv.isFetchNextPageError ? (
            <Banner
              tone="danger"
              title="Couldn't load more"
              message={errorMessage(inv.error)}
              actionLabel="Retry"
              onAction={() => inv.fetchNextPage()}
            />
          ) : inv.hasNextPage ? (
            <PrimaryButton
              label="Load more"
              tone="surface"
              loading={inv.isFetchingNextPage}
              onPress={() => inv.fetchNextPage()}
            />
          ) : null
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: selecting ? spacing.lg : insets.bottom + spacing.xl },
        ]}
        refreshControl={
          <RefreshControl refreshing={pulling} onRefresh={onRefresh} tintColor={colors.ink} />
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        // Rows hold text inputs; detaching off-screen views can drop focus on Android.
        removeClippedSubviews={false}
        showsVerticalScrollIndicator={false}
      />

      {selecting ? (
        <KeyboardStickyView style={styles.bulkBar} minBottom={spacing.sm}>
          <View style={styles.bulkHead}>
            <AppText variant="bodyMedium" color={colors.ink}>
              {selectedIds.length ? `${selectedIds.length} selected` : 'Tap variants to select'}
            </AppText>
            {rows.length ? (
              <PressableScale
                onPress={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                hitSlop={10}
                haptic={false}
              >
                <AppText variant="bodyMedium" color={colors.ink}>
                  {allSelected ? 'Clear' : 'Select all on screen'}
                </AppText>
              </PressableScale>
            ) : null}
          </View>
          <View style={styles.bulkActions}>
            <PrimaryButton
              label="Activate"
              tone="surface"
              style={styles.flex}
              disabled={!selectedIds.length || bulk.isPending}
              loading={bulk.isPending && bulk.variables?.isActive === true}
              onPress={() => runBulk(true)}
            />
            <PrimaryButton
              label="Deactivate"
              tone="ink"
              style={styles.flex}
              disabled={!selectedIds.length || bulk.isPending}
              loading={bulk.isPending && bulk.variables?.isActive === false}
              onPress={() => runBulk(false)}
            />
          </View>
        </KeyboardStickyView>
      ) : null}

      <ThresholdSheet
        visible={thresholdOpen}
        value={thresholdDraft}
        saved={threshold}
        onChange={setThresholdDraft}
        onClose={() => setThresholdOpen(false)}
      />
      <HoldsSheet
        row={holdsRow}
        visible={!!holds?.open}
        onClose={() => setHolds((t) => t && { ...t, open: false })}
      />
      <HistorySheet
        row={history?.row ?? null}
        visible={!!history?.open}
        onClose={() => setHistory((t) => t && { ...t, open: false })}
      />
      <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <SheetSurface style={styles.sheet}>
          <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
            Inventory tools
          </AppText>
          {canImport ? (
            <ListRow
              icon="cloud-upload-outline"
              label="Import from CSV"
              hint="Update stock and prices, or add variants, in bulk"
              style={styles.menuRow}
              onPress={() => goFromMenu('InventoryImport')}
            />
          ) : null}
          {canExport ? (
            <ListRow
              icon="download-outline"
              label={exporting ? 'Exporting…' : 'Export to CSV'}
              hint="Save what the list shows now to Downloads"
              style={styles.menuRow}
              onPress={exportCsv}
            />
          ) : null}
          {canReports ? (
            <ListRow
              icon="hourglass-outline"
              label="Dead stock"
              hint="Variants that have stopped selling"
              style={styles.menuRow}
              onPress={() => goFromMenu('DeadStock')}
            />
          ) : null}
          <PrimaryButton label="Close" tone="surface" onPress={() => setMenuOpen(false)} />
        </SheetSurface>
      </BottomSheet>
    </Screen>
  );
}

/** Flatten loaded pages. Rows can shift between page fetches, so drop repeats. */
function flattenRows(pages?: InventoryPage[]): InventoryRow[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: InventoryRow[] = [];
  for (const page of pages) {
    for (const row of page.rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}

/** Empty-list copy for the active search / filters. `action` = a reset button label. */
function emptyCopy(
  query: string,
  flag: FlagFilter,
  status: StatusFilter,
  threshold: number,
): { icon: string; title: string; message?: string; action?: string } {
  const filtered = flag !== 'all' || status !== 'all';
  if (query) {
    return {
      icon: 'search-outline',
      title: 'No variants match',
      message: 'Try another SKU, product or brand.',
      action: filtered ? 'Clear filters' : 'Clear search',
    };
  }
  if (flag !== 'all' && status !== 'all') {
    return { icon: 'funnel-outline', title: 'No variants match these filters', action: 'Clear filters' };
  }
  switch (flag) {
    case 'low':
      return {
        icon: 'checkmark-circle-outline',
        title: 'Nothing is low on stock',
        message: `Variants show up here when available units drop to ${threshold} or below.`,
      };
    case 'out':
      return { icon: 'checkmark-circle-outline', title: 'Nothing is out of stock' };
    case 'oversold':
      return {
        icon: 'checkmark-circle-outline',
        title: 'Nothing is oversold',
        message: 'No variant has more units held than you have on hand.',
      };
  }
  if (status !== 'all') {
    return {
      icon: 'funnel-outline',
      title: 'No variants here',
      message: 'Try another status.',
      action: 'Clear filters',
    };
  }
  return {
    icon: 'cube-outline',
    title: 'No variants yet',
    message: 'Add a product to your catalog to track its stock here.',
  };
}

function ThresholdSheet({
  visible,
  value,
  saved,
  onChange,
  onClose,
}: {
  visible: boolean;
  value: number;
  saved: number;
  onChange: (n: number) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useSaveLowStockThreshold();

  const onSave = async () => {
    try {
      await save.mutateAsync(value);
      toast.show(`Low-stock alert set to ${plural(value, 'unit')}`, 'success');
      onClose();
    } catch (e) {
      toast.show(errorMessage(e, "Couldn't save the alert"), 'error');
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <SheetSurface style={styles.sheet}>
        <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
          Low-stock alert
        </AppText>
        <AppText variant="body" color={colors.meta}>
          You'll see a Low stock flag when available units drop to this number or below.
        </AppText>
        <View style={styles.thresholdRow}>
          <View style={styles.flex}>
            <AppText variant="bodyMedium" color={colors.ink}>
              Alert at
            </AppText>
            <AppText variant="meta" color={colors.meta}>
              {THRESHOLD_MIN} to {THRESHOLD_MAX} units
            </AppText>
          </View>
          <QtyStepper value={value} onChange={onChange} min={THRESHOLD_MIN} max={THRESHOLD_MAX} />
        </View>
        <PrimaryButton
          label="Save"
          tone="accent"
          loading={save.isPending}
          disabled={value === saved}
          onPress={onSave}
        />
        <PrimaryButton label="Cancel" tone="surface" onPress={onClose} />
      </SheetSurface>
    </BottomSheet>
  );
}

/** "…a1b2c3d4e5" - the tail is what matches the order / bill reference. */
function shortOwnerId(id: string): string {
  return id.length > 10 ? `…${id.slice(-10)}` : id;
}

function HoldsSheet({
  row,
  visible,
  onClose,
}: {
  row: InventoryRow | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const q = useReservations(row?.id ?? null);
  const holds = q.data ?? [];
  const listed = holds.reduce((n, h) => n + h.qty, 0);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <SheetSurface style={styles.sheet}>
        <View>
          <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
            {row ? `${plural(row.reserved, 'unit')} held` : 'Held stock'}
          </AppText>
          {row ? (
            <AppText variant="meta" color={colors.meta} numberOfLines={1}>
              {rowTitle(row)}
            </AppText>
          ) : null}
        </View>
        {q.isPending ? (
          <ActivityIndicator color={colors.ink} style={styles.sheetLoader} />
        ) : q.isError ? (
          <Banner
            tone="danger"
            title="Couldn't load held stock"
            message={errorMessage(q.error)}
            actionLabel="Retry"
            onAction={() => q.refetch()}
          />
        ) : holds.length === 0 ? (
          <AppText variant="body" color={colors.meta}>
            No active holds found — the reserved count may be catching up.
          </AppText>
        ) : (
          <ScrollView style={{ maxHeight: height * 0.45 }} showsVerticalScrollIndicator={false}>
            {holds.map((h, i) => (
              <React.Fragment key={h.id}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.holdLine}>
                  <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1} style={styles.flex}>
                    {humanize(h.ownerKind)} · {shortOwnerId(h.ownerId)}
                  </AppText>
                  <AppText variant="bodyMedium" color={colors.ink}>
                    × {h.qty}
                  </AppText>
                </View>
              </React.Fragment>
            ))}
            {row && row.reserved > listed ? (
              <AppText variant="meta" color={colors.meta} style={styles.more}>
                …and more
              </AppText>
            ) : null}
          </ScrollView>
        )}
        <PrimaryButton label="Close" tone="surface" onPress={onClose} />
      </SheetSurface>
    </BottomSheet>
  );
}

function HistorySheet({
  row,
  visible,
  onClose,
}: {
  row: InventoryRow | null;
  visible: boolean;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  // The server filters the ledger by variant, so this is just this variant's latest
  // changes. Disabled while closed, so saves don't refetch it in the background; the
  // cached entries stay put.
  const q = useStockAdjustments({ variantId: row?.id }, visible && !!row);
  const entries = q.data ?? [];
  // A full page means older changes were cut off.
  const cutoff = entries.length >= LEDGER_LIMIT ? entries[entries.length - 1].at : null;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <SheetSurface style={styles.sheet}>
        <View>
          <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
            Stock history
          </AppText>
          {row ? (
            <AppText variant="meta" color={colors.meta} numberOfLines={1}>
              {rowTitle(row)}
            </AppText>
          ) : null}
        </View>
        {q.isPending ? (
          <ActivityIndicator color={colors.ink} style={styles.sheetLoader} />
        ) : q.isError ? (
          <Banner
            tone="danger"
            title="Couldn't load stock history"
            message={errorMessage(q.error)}
            actionLabel="Retry"
            onAction={() => q.refetch()}
          />
        ) : entries.length === 0 ? (
          <AppText variant="body" color={colors.meta}>
            No stock changes recorded for this variant yet.
          </AppText>
        ) : (
          <ScrollView style={{ maxHeight: height * 0.5 }} showsVerticalScrollIndicator={false}>
            {entries.map((a, i) => (
              <React.Fragment key={a.id}>
                {i > 0 ? <Divider /> : null}
                <HistoryLine entry={a} />
              </React.Fragment>
            ))}
            {cutoff ? (
              <AppText variant="meta" color={colors.meta} style={styles.more}>
                Showing the latest {LEDGER_LIMIT} changes, back to {formatDayDate(cutoff)}.
              </AppText>
            ) : null}
          </ScrollView>
        )}
        <PrimaryButton label="Close" tone="surface" onPress={onClose} />
      </SheetSurface>
    </BottomSheet>
  );
}

function actorLabel(kind: string): string {
  if (kind === 'system') return 'System';
  if (kind === 'admin') return 'Trendzo';
  return 'Store';
}

function HistoryLine({ entry }: { entry: StockAdjustment }) {
  const { delta } = entry;
  const deltaText = delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : '0';
  const deltaColor = delta > 0 ? colors.success : delta < 0 ? colors.danger : colors.meta;
  return (
    <View style={styles.historyLine}>
      <AppText variant="bodyMedium" color={deltaColor} style={styles.delta}>
        {deltaText}
      </AppText>
      <View style={styles.flex}>
        <AppText variant="bodyMedium" color={colors.ink}>
          → {entry.newStock} in stock
        </AppText>
        <AppText variant="meta" color={colors.meta}>
          {humanize(entry.reason)} · {actorLabel(entry.actorKind)}
        </AppText>
        {entry.note ? (
          <AppText variant="meta" color={colors.meta}>
            {entry.note}
          </AppText>
        ) : null}
      </View>
      <AppText variant="meta" color={colors.meta}>
        {timeAgo(entry.at)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.screenH },
  listContent: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.screenH,
    gap: spacing.sm,
  },
  listHeader: { gap: spacing.sm + 4, marginBottom: spacing.xs },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.sm + 4,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm + 4,
    color: colors.ink,
    fontFamily: typeScale.body.fontFamily,
    fontSize: typeScale.body.fontSize,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  loader: { marginTop: spacing.xl },
  bulkBar: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.screenH,
    gap: spacing.md,
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  bulkHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  bulkActions: { flexDirection: 'row', gap: spacing.sm },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
  // The sheet is white, so rows take the canvas grey to stay visible.
  menuRow: { backgroundColor: colors.canvas },
  sheetLoader: { marginVertical: spacing.lg },
  thresholdRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  holdLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  more: { marginTop: spacing.sm },
  historyLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  delta: { minWidth: 40 },
  hidden: { opacity: 0 },
});
