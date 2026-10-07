import React, { memo, useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import {
  AppText,
  Divider,
  Field,
  Icon,
  PressableScale,
  PrimaryButton,
  QtyStepper,
  StatusChip,
  ToggleRow,
  toneForStatus,
  useToast,
} from '../../components';
import type { StatusTone } from '../../components';
import { InventoryRowPatch, useUpdateInventoryRow } from '../../api/catalogHooks';
import { errorCode, errorMessage } from '../../api/request';
import { InventoryRow } from '../../types/catalog';
import { formatPaise, paiseToRupeeInput, parseRupeesToPaise } from '../../utils/money';
import { colors, radii, spacing } from '../../theme/theme';

const WARNING = '#B8860B';
/** PATCH /retailer/variants caps a price at ₹1,00,00,000. */
const MAX_PRICE_PAISE = 1_000_000_000;
const MAX_STOCK = 999_999;

interface StockState {
  available: number;
  out: boolean;
  low: boolean;
  oversold: boolean;
}

/** Same rules as the server's out / low / oversold filters. */
function stockState(row: InventoryRow, threshold: number): StockState {
  const available = Math.max(0, row.stock - row.reserved);
  return {
    available,
    out: available === 0,
    low: available > 0 && available <= threshold,
    oversold: row.reserved > row.stock,
  };
}

/** Short name for toasts. Single-variant products have no attributes label. */
function variantLabel(row: InventoryRow): string {
  return row.attributesLabel || row.listingName;
}

/** "Cotton kurta · Red / M" for sheet subtitles. */
export function rowTitle(row: InventoryRow): string {
  return row.attributesLabel ? `${row.listingName} · ${row.attributesLabel}` : row.listingName;
}

interface InventoryRowCardProps {
  row: InventoryRow;
  threshold: number;
  selectMode: boolean;
  selected: boolean;
  /** Inline editor open (write access only). */
  expanded: boolean;
  onPress: (row: InventoryRow) => void;
  onSaved: (row: InventoryRow) => void;
  onHolds: (row: InventoryRow) => void;
  onHistory: (row: InventoryRow) => void;
  onOpenProduct: (row: InventoryRow) => void;
}

/**
 * One variant: name, price, available units and stock flags. Tapping it opens
 * the inline editor (or toggles selection in select mode).
 */
export const InventoryRowCard = memo(function RowCard({
  row,
  threshold,
  selectMode,
  selected,
  expanded,
  onPress,
  onSaved,
  onHolds,
  onHistory,
  onOpenProduct,
}: InventoryRowCardProps) {
  const state = stockState(row, threshold);
  const availableColor = state.out ? colors.danger : state.low ? WARNING : colors.ink;
  const detail = [row.attributesLabel || 'Default', row.sku].filter(Boolean).join(' · ');
  const mrp = row.compareAtPrice ?? 0;

  const summary = (
    <View style={styles.summary}>
      {selectMode ? (
        <View style={[styles.check, selected && styles.checkOn]}>
          {selected ? <Icon name="checkmark" size={14} color={colors.accentInk} /> : null}
        </View>
      ) : null}
      <View style={[styles.summaryBody, !row.isActive && styles.dim]}>
        <View style={styles.top}>
          <View style={styles.info}>
            <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
              {row.listingName}
            </AppText>
            {row.brandName ? (
              <AppText variant="meta" color={colors.meta} numberOfLines={1}>
                {row.brandName}
              </AppText>
            ) : null}
            <AppText variant="meta" color={colors.meta} numberOfLines={1}>
              {detail}
            </AppText>
            <View style={styles.priceLine}>
              <AppText variant="bodyMedium" color={colors.ink}>
                {formatPaise(row.pricePaise)}
              </AppText>
              {mrp > row.pricePaise ? (
                <AppText variant="meta" color={colors.meta} style={styles.strike}>
                  {formatPaise(mrp)}
                </AppText>
              ) : null}
            </View>
          </View>
          <View style={styles.stockCol}>
            <AppText variant="cardTitle" color={availableColor} style={styles.available}>
              {state.available}
            </AppText>
            <AppText variant="meta" color={colors.meta}>
              available
            </AppText>
            <AppText variant="meta" color={colors.meta} style={styles.onHand}>
              stock {row.stock} · held {row.reserved}
            </AppText>
          </View>
        </View>
        <FlagChips row={row} state={state} />
      </View>
    </View>
  );

  if (!expanded) {
    return (
      <PressableScale
        onPress={() => onPress(row)}
        toScale={0.98}
        style={[styles.card, selected && styles.cardSelected]}
      >
        {summary}
      </PressableScale>
    );
  }

  // Expanded: only the summary collapses on tap - the editor's inputs must not.
  return (
    <View style={styles.card}>
      <PressableScale onPress={() => onPress(row)} toScale={1} haptic={false}>
        {summary}
      </PressableScale>
      <RowEditor
        row={row}
        onSaved={onSaved}
        onHolds={onHolds}
        onHistory={onHistory}
        onOpenProduct={onOpenProduct}
      />
    </View>
  );
});

function FlagChips({ row, state }: { row: InventoryRow; state: StockState }) {
  // Oversold rows are also out of stock; the stronger flag says more.
  const flag: { label: string; tone: StatusTone } | null = state.oversold
    ? { label: 'Oversold', tone: 'danger' }
    : state.out
      ? { label: 'Out of stock', tone: 'danger' }
      : state.low
        ? { label: 'Low stock', tone: 'warning' }
        : null;
  const listingOff = row.listingStatus !== 'active';
  if (!flag && !listingOff && row.isActive) return null;
  return (
    <View style={styles.chips}>
      {flag ? <StatusChip label={flag.label} tone={flag.tone} /> : null}
      {listingOff ? (
        <StatusChip
          label={row.listingStatus.replace(/_/g, ' ')}
          tone={toneForStatus(row.listingStatus)}
        />
      ) : null}
      {!row.isActive ? <StatusChip label="Off sale" tone="neutral" /> : null}
    </View>
  );
}

function RowEditor({
  row,
  onSaved,
  onHolds,
  onHistory,
  onOpenProduct,
}: Pick<InventoryRowCardProps, 'row' | 'onSaved' | 'onHolds' | 'onHistory' | 'onOpenProduct'>) {
  const toast = useToast();
  const save = useUpdateInventoryRow();
  const toggle = useUpdateInventoryRow();
  // null = untouched: the field shows the live value, so a sale landing in the
  // background is never written back as a stale absolute count.
  const [stockText, setStockText] = useState<string | null>(null);
  const [priceText, setPriceText] = useState<string | null>(null);
  // Switch position while its PATCH is in flight.
  const [pendingActive, setPendingActive] = useState<boolean | null>(null);

  const stockInput = stockText ?? String(row.stock);
  const stock = /^\d+$/.test(stockInput) ? Number(stockInput) : null;
  const stockDirty = stockText !== null && stock !== row.stock;
  const stockError = !stockDirty
    ? null
    : stock == null
      ? 'Enter a whole number'
      : stock < row.reserved
        ? `Can't go below ${row.reserved} reserved`
        : null;

  const priceInput = priceText ?? paiseToRupeeInput(row.pricePaise);
  const price = parseRupeesToPaise(priceInput);
  const priceDirty = priceText !== null && price !== row.pricePaise;
  const priceError = !priceDirty
    ? null
    : price == null || price <= 0
      ? 'Enter a valid price'
      : price > MAX_PRICE_PAISE
        ? 'Max ₹1,00,00,000'
        : null;
  const mrp = row.compareAtPrice ?? null;
  // Allowed, but worth a nudge: the struck-through MRP disappears.
  const atOrAboveMrp = priceDirty && !priceError && mrp != null && price != null && price >= mrp;

  const canSave = (stockDirty || priceDirty) && !stockError && !priceError;
  const isActive = pendingActive ?? row.isActive;
  const shownStock = stock ?? row.stock;

  const onSave = async () => {
    // Only send what changed.
    const patch: InventoryRowPatch = {};
    if (stockDirty && stock != null) patch.stock = stock;
    if (priceDirty && price != null) patch.pricePaise = price;
    Keyboard.dismiss();
    try {
      await save.mutateAsync({ id: row.id, patch });
      toast.show(`Saved · ${variantLabel(row)}`, 'success');
      onSaved(row);
    } catch (e) {
      toast.show(
        errorCode(e) === 'invalid_state'
          ? `Can't go below ${row.reserved} reserved`
          : errorMessage(e, "Couldn't save"),
        'error',
      );
    }
  };

  const onToggleActive = async (next: boolean) => {
    setPendingActive(next);
    try {
      await toggle.mutateAsync({ id: row.id, patch: { isActive: next } });
      toast.show(`${next ? 'On sale' : 'Off sale'} · ${variantLabel(row)}`, next ? 'success' : 'info');
    } catch (e) {
      toast.show(errorMessage(e, "Couldn't update"), 'error');
    } finally {
      setPendingActive(null);
    }
  };

  return (
    <View style={styles.editor}>
      <Divider />
      <View style={styles.stockRow}>
        <Field
          label="Stock on hand"
          boxed
          value={stockInput}
          onChangeText={(t) => setStockText(t.replace(/\D/g, ''))}
          keyboardType="number-pad"
          maxLength={6}
          selectTextOnFocus
          error={stockError}
          containerStyle={styles.flex}
        />
        <View style={styles.stepper}>
          <QtyStepper
            value={shownStock}
            onChange={(n) => setStockText(String(n))}
            min={row.reserved}
            max={MAX_STOCK}
          />
        </View>
      </View>
      {row.reserved > 0 && !stockError ? (
        <AppText variant="meta" color={colors.meta} style={styles.stockHint}>
          {row.reserved} held · {Math.max(0, shownStock - row.reserved)} free to sell
        </AppText>
      ) : null}

      <View style={styles.fieldBlock}>
        <Field
          label="Price"
          prefix="₹"
          boxed
          value={priceInput}
          onChangeText={setPriceText}
          keyboardType="decimal-pad"
          maxLength={12}
          error={priceError}
        />
        {atOrAboveMrp ? (
          <AppText variant="meta" color={WARNING}>
            At or above the MRP of {formatPaise(mrp)}, so no discount will show.
          </AppText>
        ) : mrp ? (
          <AppText variant="meta" color={colors.meta}>
            MRP {formatPaise(mrp)}
          </AppText>
        ) : null}
      </View>

      <PrimaryButton
        label="Save"
        tone="accent"
        disabled={!canSave}
        loading={save.isPending}
        onPress={onSave}
      />

      <Divider />
      <ToggleRow
        label="On sale"
        hint={isActive ? 'Customers can buy this variant' : 'Hidden from customers'}
        value={isActive}
        onChange={onToggleActive}
        disabled={toggle.isPending}
      />
      <View style={styles.actions}>
        {row.reserved > 0 ? (
          <ActionPill icon="lock-closed-outline" label="Held stock" onPress={() => onHolds(row)} />
        ) : null}
        <ActionPill icon="time-outline" label="Stock history" onPress={() => onHistory(row)} />
        <ActionPill icon="shirt-outline" label="Open product" onPress={() => onOpenProduct(row)} />
      </View>
    </View>
  );
}

function ActionPill({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} toScale={0.95} haptic={false} style={styles.pill}>
      <Icon name={icon} size={15} color={colors.ink} />
      <AppText variant="meta" color={colors.ink} style={styles.pillLabel}>
        {label}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: spacing.md,
  },
  cardSelected: { borderColor: colors.accent },
  summary: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.cardGray,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  summaryBody: { flex: 1, gap: spacing.sm },
  dim: { opacity: 0.55 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  info: { flex: 1, gap: 2 },
  priceLine: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  strike: { textDecorationLine: 'line-through' },
  stockCol: { alignItems: 'flex-end' },
  available: { fontSize: 24, lineHeight: 28 },
  onHand: { marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  editor: { gap: spacing.md, marginTop: spacing.sm },
  stockRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  // Drops the stepper level with the input box (the Field's label sits above it).
  stepper: { marginTop: spacing.lg + spacing.sm },
  stockHint: { marginTop: -spacing.sm },
  fieldBlock: { gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: spacing.md - 4,
    borderRadius: radii.pill,
    backgroundColor: colors.canvas,
  },
  pillLabel: { fontSize: 13, lineHeight: 16 },
});
