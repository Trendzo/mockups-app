import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppImage,
  AppText,
  BackButton,
  Icon,
  PressableScale,
  PrimaryButton,
  Screen,
  SegmentedControl,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useInventory } from '../api/catalogHooks';
import { useRetailerMe } from '../api/onboardingHooks';
import { useCart, billTotals } from '../store/cart';
import { InventoryRow } from '../types/catalog';
import { CartItem, Invoice, PaymentMethod, PAYMENT_LABELS } from '../types/billing';
import { formatPaise } from '../utils/money';
import { colors, radii, spacing, type as typeScale } from '../theme/theme';
import { Haptics } from '../utils/haptics';

/** INV-YYYYMMDD-NNNN. Client-side; there is no server billing endpoint. */
function genInvoiceNumber(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const seq = String(now.getTime() % 10000).padStart(4, '0');
  return `INV-${y}${m}${d}-${seq}`;
}

/** In-app billing / point-of-sale: search products → build a bill → charge. */
export function BillingScreen({ navigation }: ScreenProps<'Billing'>) {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const me = useRetailerMe();
  const storeName = me.data?.store?.name ?? me.data?.retailer?.legalName ?? undefined;

  const items = useCart((s) => s.items);
  const add = useCart((s) => s.add);
  const setQty = useCart((s) => s.setQty);
  const clear = useCart((s) => s.clear);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('cash');

  // Debounce the search so each keystroke doesn't refetch inventory.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const inv = useInventory({
    q: debounced || undefined,
    flag: 'in_stock',
    pageSize: 50,
  });
  const rows = inv.data?.rows ?? [];

  const cartItems = useMemo(() => Object.values(items), [items]);
  const totals = useMemo(() => billTotals(cartItems), [cartItems]);
  const hasItems = cartItems.length > 0;

  const addRow = (r: InventoryRow) => {
    if (r.stock <= 0) {
      toast.show('Out of stock', 'error');
      return;
    }
    Haptics.select();
    add({
      variantId: r.variantId,
      listingId: r.listingId,
      name: r.listingName,
      attributesLabel: r.attributesLabel,
      sku: r.sku,
      pricePaise: r.pricePaise,
      imageUrl: r.imageUrl,
      stock: r.stock,
    });
  };

  const onCharge = () => {
    if (!hasItems) return;
    const invoice: Invoice = {
      number: genInvoiceNumber(new Date()),
      createdAt: Date.now(),
      storeName,
      items: cartItems,
      subtotalPaise: totals.subtotalPaise,
      taxPaise: totals.taxPaise,
      totalPaise: totals.totalPaise,
      payment,
    };
    Haptics.success();
    clear();
    navigation.replace('Invoice', { invoice });
  };

  return (
    <Screen edges={['top']} padded={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <BackButton onPress={() => navigation.goBack()} />
        <AppText variant="sectionLabel" color={colors.meta}>
          Point of sale
        </AppText>
        <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
          New bill
        </AppText>

        {/* Search products */}
        <View style={styles.searchBox}>
          <Icon name="search" size={18} color={colors.inkMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search products by name or SKU"
            placeholderTextColor={colors.inkMuted}
            style={styles.searchInput}
            autoCorrect={false}
          />
          {query ? (
            <PressableScale onPress={() => setQuery('')} hitSlop={8}>
              <Icon name="close-circle" size={18} color={colors.inkMuted} />
            </PressableScale>
          ) : null}
        </View>

        {/* Current bill */}
        {hasItems ? (
          <View style={styles.section}>
            <AppText variant="sectionLabel" color={colors.meta}>
              Bill · {totals.count} item{totals.count === 1 ? '' : 's'}
            </AppText>
            {cartItems.map((it) => (
              <BillLine
                key={it.variantId}
                item={it}
                onDec={() => setQty(it.variantId, it.qty - 1)}
                onInc={() => setQty(it.variantId, it.qty + 1)}
              />
            ))}
          </View>
        ) : null}

        {/* Product results */}
        <View style={styles.section}>
          <AppText variant="sectionLabel" color={colors.meta}>
            {debounced ? 'Results' : 'In-stock products'}
          </AppText>
          {inv.isLoading ? (
            <View style={styles.centerPad}>
              <ActivityIndicator color={colors.ink} />
            </View>
          ) : inv.isError ? (
            <AppText variant="meta" color={colors.meta} style={styles.empty}>
              Couldn't load products. Pull to retry from the catalog.
            </AppText>
          ) : rows.length === 0 ? (
            <AppText variant="meta" color={colors.meta} style={styles.empty}>
              {debounced ? 'No products match that search.' : 'No in-stock products yet.'}
            </AppText>
          ) : (
            rows.map((r) => (
              <ProductRow
                key={r.variantId}
                row={r}
                inCartQty={items[r.variantId]?.qty ?? 0}
                onAdd={() => addRow(r)}
              />
            ))
          )}
        </View>

        {/* Totals + payment (only meaningful with a bill) */}
        {hasItems ? (
          <View style={styles.totalsCard}>
            <TotalRow label="Subtotal" value={formatPaise(totals.subtotalPaise)} />
            <TotalRow label="GST" value={formatPaise(totals.taxPaise)} />
            <View style={styles.divider} />
            <TotalRow label="Total" value={formatPaise(totals.totalPaise)} strong />
            <View style={styles.paymentBlock}>
              <AppText variant="sectionLabel" color={colors.meta}>
                Payment method
              </AppText>
              <SegmentedControl<PaymentMethod>
                value={payment}
                onChange={setPayment}
                options={(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((p) => ({
                  value: p,
                  label: PAYMENT_LABELS[p],
                }))}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky charge bar */}
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <PrimaryButton
          label={hasItems ? `Charge ${formatPaise(totals.totalPaise)}` : 'Add products to start a bill'}
          tone="accent"
          disabled={!hasItems}
          onPress={onCharge}
        />
      </View>
    </Screen>
  );
}

function ProductRow({
  row,
  inCartQty,
  onAdd,
}: {
  row: InventoryRow;
  inCartQty: number;
  onAdd: () => void;
}) {
  const out = row.stock <= 0;
  return (
    <View style={styles.prodRow}>
      {row.imageUrl ? (
        <AppImage uri={row.imageUrl} radius={radii.sm} containerStyle={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Icon name="image-outline" size={18} color={colors.inkMuted} />
        </View>
      )}
      <View style={styles.flex}>
        <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
          {row.listingName}
        </AppText>
        <AppText variant="meta" color={colors.meta} numberOfLines={1}>
          {row.attributesLabel}
          {row.sku ? ` · ${row.sku}` : ''} · {out ? 'Out of stock' : `${row.stock} in stock`}
        </AppText>
        <AppText variant="bodyMedium" color={colors.ink}>
          {formatPaise(row.pricePaise)}
        </AppText>
      </View>
      <PressableScale
        onPress={onAdd}
        disabled={out}
        style={[styles.addBtn, out && styles.addBtnDisabled]}
      >
        {inCartQty > 0 ? (
          <AppText variant="button" color={colors.accentInk}>
            {inCartQty} · Add
          </AppText>
        ) : (
          <Icon name="add" size={20} color={out ? colors.inkMuted : colors.accentInk} />
        )}
      </PressableScale>
    </View>
  );
}

function BillLine({
  item,
  onDec,
  onInc,
}: {
  item: CartItem;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <View style={styles.billLine}>
      <View style={styles.flex}>
        <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
          {item.name}
        </AppText>
        <AppText variant="meta" color={colors.meta} numberOfLines={1}>
          {item.attributesLabel} · {formatPaise(item.pricePaise)}
        </AppText>
      </View>
      <View style={styles.stepper}>
        <PressableScale onPress={onDec} hitSlop={6} style={styles.stepBtn}>
          <Icon name={item.qty <= 1 ? 'trash-outline' : 'remove'} size={16} color={colors.ink} />
        </PressableScale>
        <AppText variant="bodyMedium" color={colors.ink} style={styles.qty}>
          {item.qty}
        </AppText>
        <PressableScale
          onPress={onInc}
          hitSlop={6}
          disabled={item.qty >= item.stock}
          style={styles.stepBtn}
        >
          <Icon
            name="add"
            size={16}
            color={item.qty >= item.stock ? colors.inkMuted : colors.ink}
          />
        </PressableScale>
      </View>
      <AppText variant="bodyMedium" color={colors.ink} style={styles.lineTotal}>
        {formatPaise(item.pricePaise * item.qty)}
      </AppText>
    </View>
  );
}

function TotalRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.totalRow}>
      <AppText
        variant={strong ? 'bodyMedium' : 'meta'}
        color={strong ? colors.ink : colors.meta}
      >
        {label}
      </AppText>
      <AppText
        variant={strong ? 'cardTitle' : 'bodyMedium'}
        color={colors.ink}
        style={strong ? styles.strongTotal : undefined}
      >
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    paddingBottom: 140,
    gap: spacing.md,
  },
  h1: { fontSize: 24, lineHeight: 28 },
  flex: { flex: 1 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontFamily: typeScale.body.fontFamily,
    fontSize: typeScale.body.fontSize,
    padding: 0,
  },
  section: { gap: spacing.sm },
  empty: { paddingVertical: spacing.sm },
  centerPad: { paddingVertical: spacing.xl },
  prodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.sm + 2,
  },
  thumb: { width: 48, height: 48, borderRadius: radii.sm },
  thumbEmpty: {
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    minWidth: 44,
    height: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: { backgroundColor: colors.hairline },
  billLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: { minWidth: 20, textAlign: 'center' },
  lineTotal: { minWidth: 64, textAlign: 'right' },
  totalsCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  strongTotal: { fontSize: 20, lineHeight: 24 },
  divider: { height: 1, backgroundColor: colors.hairline, marginVertical: spacing.xs },
  paymentBlock: { gap: spacing.sm, marginTop: spacing.sm },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
