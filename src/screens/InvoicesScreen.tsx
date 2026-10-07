import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  AppText,
  Banner,
  BottomSheet,
  DetailRow,
  Divider,
  EmptyState,
  FilterChips,
  Icon,
  PressableScale,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SegmentedControl,
  SheetSurface,
  StatusChip,
  useToast,
} from '../components';
import type { FilterOption } from '../components';
import { ScreenProps } from '../navigation/types';
import { useInvoice, useInvoices } from '../api/earningsHooks';
import { INVOICES_MAX_LIMIT, openInvoicePdf, openPdfUrl } from '../api/invoices';
import { errorMessage } from '../api/request';
import {
  invoiceGstPaise,
  invoiceKindMeta,
  TaxInvoice,
} from '../types/earnings';
import { usePermissions } from '../utils/usePermission';
import { formatPaise } from '../utils/money';
import { formatDate, humanize, shortRef } from '../utils/format';
import { colors, radii, spacing, type as typeScale } from '../theme/theme';

type Tab = 'tax' | 'commission';
type TaxFilter = 'all' | 'invoice' | 'supplementary';

const TABS = [
  { value: 'tax' as const, label: 'Tax invoices' },
  { value: 'commission' as const, label: 'Commission' },
];

/** Newest first, whichever list an invoice came from. */
const byNewest = (a: TaxInvoice, b: TaxInvoice) =>
  (b.createdAt ?? b.issuedAt ?? '').localeCompare(a.createdAt ?? a.issuedAt ?? '');

/**
 * Invoices hub: the tax invoices raised for customers (plus supplementary ones) and
 * the commission invoices Trendzo issues to the store, searchable, each openable as a PDF.
 */
export function InvoicesScreen({ navigation, route }: ScreenProps<'Invoices'>) {
  const { can } = usePermissions();
  const allowed = can('invoicing.view');
  const [tab, setTab] = useState<Tab>(route.params?.kind === 'commission' ? 'commission' : 'tax');
  const [taxFilter, setTaxFilter] = useState<TaxFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<{ id: string; open: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // The server filters by kind (limit 200 each), so a busy commission feed can't crowd
  // the tax invoices out of the page. The tax tab merges invoices + supplementary.
  const taxQ = useInvoices('invoice', allowed && tab === 'tax');
  const suppQ = useInvoices('supplementary', allowed && tab === 'tax');
  const commQ = useInvoices('commission', allowed && tab === 'commission');
  const active = tab === 'tax' ? [taxQ, suppQ] : [commQ];
  const loading = active.some((q) => q.isLoading);
  const error = active.find((q) => q.isError && !q.data)?.error;

  const all = useMemo(() => {
    if (tab === 'commission') return commQ.data ?? [];
    return [...(taxQ.data ?? []), ...(suppQ.data ?? [])].sort(byNewest);
  }, [tab, taxQ.data, suppQ.data, commQ.data]);

  const needle = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      all.filter((i) => {
        if (tab === 'tax' && taxFilter !== 'all' && i.kind !== taxFilter) return false;
        if (!needle) return true;
        return (
          i.number.toLowerCase().includes(needle) ||
          i.orderId.toLowerCase().includes(needle) ||
          shortRef(i.orderId).toLowerCase().includes(needle) ||
          i.consumerName.toLowerCase().includes(needle)
        );
      }),
    [all, tab, taxFilter, needle],
  );
  const taxOptions: FilterOption<TaxFilter>[] = useMemo(
    () => [
      { value: 'all', label: 'All', count: all.length },
      { value: 'invoice', label: 'Invoices', count: all.filter((i) => i.kind === 'invoice').length },
      {
        value: 'supplementary',
        label: 'Supplementary',
        count: all.filter((i) => i.kind === 'supplementary').length,
      },
    ],
    [all],
  );
  const capped =
    (tab === 'commission' ? (commQ.data?.length ?? 0) >= INVOICES_MAX_LIMIT : false) ||
    (tab === 'tax' &&
      ((taxQ.data?.length ?? 0) >= INVOICES_MAX_LIMIT || (suppQ.data?.length ?? 0) >= INVOICES_MAX_LIMIT));

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all(active.map((q) => q.refetch()));
    } finally {
      setRefreshing(false);
    }
  };

  if (!allowed) {
    return (
      <Screen edges={['top']}>
        <ScreenHeader overline="Payments" title="Invoices" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="lock-closed-outline"
          title="Not available for your role"
          message="Ask the store owner or a manager to share invoices with you."
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <ScreenHeader overline="Payments" title="Invoices" onBack={() => navigation.goBack()} />
      <FlatList
        data={rows}
        // Full-bleed list (gutter moved into the content) so the filter chips can scroll
        // edge to edge, like Payout history.
        style={styles.list}
        keyExtractor={(i) => i.id}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />
        }
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <SegmentedControl options={TABS} value={tab} onChange={setTab} compact />
            <View style={styles.searchBox}>
              <Icon name="search" size={18} color={colors.meta} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search number, order or customer…"
                placeholderTextColor={colors.inkMuted}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                style={styles.searchInput}
              />
              {search ? (
                <PressableScale onPress={() => setSearch('')} hitSlop={10} haptic={false}>
                  <Icon name="close-circle" size={18} color={colors.inkMuted} />
                </PressableScale>
              ) : null}
            </View>
            {tab === 'tax' ? (
              <FilterChips options={taxOptions} value={taxFilter} onChange={setTaxFilter} />
            ) : (
              <AppText variant="meta" color={colors.meta}>
                Trendzo raises one commission invoice per order. They feed your billing statement.
              </AppText>
            )}
            {capped ? (
              <AppText variant="meta" color={colors.meta}>
                Showing the latest {INVOICES_MAX_LIMIT}. Search narrows within those.
              </AppText>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.ink} style={styles.loader} />
          ) : error ? (
            <Banner
              tone="danger"
              title="Couldn't load invoices"
              message={errorMessage(error)}
              actionLabel="Retry"
              onAction={onRefresh}
            />
          ) : (
            <EmptyState
              icon="receipt-outline"
              title={needle || taxFilter !== 'all' ? 'No invoices match' : 'No invoices yet'}
              message={
                needle || taxFilter !== 'all'
                  ? 'Try another number, order or customer.'
                  : tab === 'tax'
                    ? 'A tax invoice appears here when a customer order is delivered.'
                    : 'Commission invoices appear here as orders settle.'
              }
            />
          )
        }
        renderItem={({ item }) => (
          <InvoiceCard
            invoice={item}
            commission={tab === 'commission'}
            onPress={() => setSelected({ id: item.id, open: true })}
          />
        )}
      />
      <InvoiceSheet
        invoice={all.find((i) => i.id === selected?.id) ?? null}
        visible={!!selected?.open}
        onClose={() => setSelected((s) => s && { ...s, open: false })}
        onOpenOrder={(orderId) => {
          setSelected((s) => s && { ...s, open: false });
          navigation.navigate('OrderDetail', { id: orderId });
        }}
      />
    </Screen>
  );
}

function InvoiceCard({
  invoice: i,
  commission,
  onPress,
}: {
  invoice: TaxInvoice;
  commission: boolean;
  onPress: () => void;
}) {
  const kind = invoiceKindMeta(i.kind);
  const gst = invoiceGstPaise(i);
  const line = commission
    ? `Commission ${formatPaise(i.taxableValuePaise)} · GST ${formatPaise(gst)}`
    : i.consumerName || 'Customer';
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitle}>
          <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
            {i.number || 'Invoice'}
          </AppText>
          <View style={styles.chips}>
            {!commission ? <StatusChip label={kind.label} tone={kind.tone} /> : null}
            {i.status === 'credited' ? <StatusChip label="Credited" tone="neutral" /> : null}
            {i.status === 'draft' ? <StatusChip label="Draft" tone="warning" /> : null}
          </View>
        </View>
        <AppText variant="bodyMedium" color={colors.ink}>
          {formatPaise(i.totalPaise)}
        </AppText>
      </View>
      <AppText variant="meta" color={colors.meta} numberOfLines={1}>
        {line}
      </AppText>
      <AppText variant="meta" color={colors.meta}>
        Order {shortRef(i.orderId)} · {i.issuedAt ? formatDate(i.issuedAt) : 'Not issued yet'}
      </AppText>
    </PressableScale>
  );
}

function InvoiceSheet({
  invoice,
  visible,
  onClose,
  onOpenOrder,
}: {
  invoice: TaxInvoice | null;
  visible: boolean;
  onClose: () => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const toast = useToast();
  const { height } = useWindowDimensions();
  const detailQ = useInvoice(visible ? invoice?.id : null);
  const [opening, setOpening] = useState<string | null>(null);
  // Detail adds the credit notes; the list row already has everything else.
  const inv = detailQ.data ?? invoice;
  const kind = inv ? invoiceKindMeta(inv.kind) : null;
  const creditNotes = detailQ.data?.creditNotes ?? [];

  const run = async (key: string, fn: () => Promise<void>, fallback: string) => {
    if (opening) return;
    setOpening(key);
    try {
      await fn();
    } catch (e) {
      toast.show(errorMessage(e, fallback), 'error');
    } finally {
      setOpening(null);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <SheetSurface style={styles.sheet}>
        <View>
          <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle} numberOfLines={1}>
            {inv?.number || 'Invoice'}
          </AppText>
          {kind ? (
            <AppText variant="meta" color={colors.meta}>
              {kind.label}
              {inv?.status ? ` · ${humanize(inv.status)}` : ''}
            </AppText>
          ) : null}
        </View>
        {inv ? (
          <ScrollView style={{ maxHeight: height * 0.5 }} showsVerticalScrollIndicator={false}>
            <View style={styles.detailRows}>
              <DetailRow label="Order" value={shortRef(inv.orderId)} />
              {inv.consumerName ? <DetailRow label="Customer" value={inv.consumerName} /> : null}
              <DetailRow label="Issued" value={inv.issuedAt ? formatDate(inv.issuedAt) : 'Not yet'} />
              <Divider />
              <DetailRow label="Taxable value" value={formatPaise(inv.taxableValuePaise)} />
              {inv.cgstPaise !== 0 ? <DetailRow label="CGST" value={formatPaise(inv.cgstPaise)} /> : null}
              {inv.sgstPaise !== 0 ? <DetailRow label="SGST" value={formatPaise(inv.sgstPaise)} /> : null}
              {inv.igstPaise !== 0 ? <DetailRow label="IGST" value={formatPaise(inv.igstPaise)} /> : null}
              {inv.tcsPaise !== 0 ? <DetailRow label="TCS" value={formatPaise(inv.tcsPaise)} /> : null}
              <DetailRow label="Total" value={formatPaise(inv.totalPaise)} strong />
              {creditNotes.length > 0 ? (
                <>
                  <Divider />
                  <AppText variant="sectionLabel" color={colors.meta}>
                    Credit notes
                  </AppText>
                  {creditNotes.map((cn) => (
                    <PressableScale
                      key={cn.id}
                      disabled={!cn.pdfUrl}
                      onPress={() =>
                        cn.pdfUrl
                          ? run(cn.id, () => openPdfUrl(cn.pdfUrl as string, cn.creditNoteNumber), "Couldn't open the credit note")
                          : undefined
                      }
                      toScale={0.98}
                      style={styles.creditNote}
                    >
                      <View style={styles.flex}>
                        <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
                          {cn.creditNoteNumber}
                        </AppText>
                        <AppText variant="meta" color={colors.meta}>
                          {[cn.reason ? humanize(cn.reason) : null, cn.issuedAt ? formatDate(cn.issuedAt) : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </AppText>
                      </View>
                      <AppText variant="bodyMedium" color={colors.danger}>
                        −{formatPaise(cn.grandTotalReversedPaise)}
                      </AppText>
                      {cn.pdfUrl ? <Icon name="download-outline" size={18} color={colors.meta} /> : null}
                    </PressableScale>
                  ))}
                </>
              ) : detailQ.isLoading ? (
                <ActivityIndicator color={colors.ink} style={styles.sheetLoader} />
              ) : null}
            </View>
          </ScrollView>
        ) : null}
        {inv && !inv.pdfUrl ? (
          <AppText variant="meta" color={colors.meta}>
            The PDF is still being generated. Try again in a moment.
          </AppText>
        ) : null}
        <PrimaryButton
          label="Open PDF"
          tone="accent"
          disabled={!inv}
          loading={opening === 'pdf'}
          onPress={() =>
            inv &&
            run('pdf', () => openInvoicePdf(inv.id, inv.number), "Couldn't open the PDF")
          }
        />
        {inv?.orderId ? (
          <PrimaryButton label="View order" tone="surface" onPress={() => onOpenOrder(inv.orderId)} />
        ) : null}
        <PrimaryButton label="Close" tone="ghost" onPress={onClose} />
      </SheetSurface>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { marginHorizontal: -spacing.screenH },
  listContent: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  listHeader: { gap: spacing.sm + 4, marginBottom: spacing.xs },
  loader: { marginTop: spacing.xl },
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.xs },
  cardTitle: { flex: 1, gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
  sheetLoader: { marginVertical: spacing.md },
  detailRows: { gap: spacing.sm },
  creditNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
});
