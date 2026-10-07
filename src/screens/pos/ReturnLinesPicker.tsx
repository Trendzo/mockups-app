import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Chip, Panel, QtyStepper } from '../../components';
import { PosSaleItem } from '../../types/pos';
import {
  QtyMap,
  ReturnSelection,
  lineRefundPaise,
  remainingQty,
  setPickQty,
  setPickRestock,
} from '../../utils/posExchange';
import { formatPaise } from '../../utils/money';
import { colors, radii, spacing } from '../../theme/theme';

/**
 * The lines of the original sale: pick how many of each go back (capped at what hasn't already been
 * returned) and whether each returns to stock. Used by both Return and Exchange.
 */
export function ReturnLinesPicker({
  title,
  items,
  returned,
  selection,
  onChange,
  disabled,
}: {
  title: string;
  items: PosSaleItem[];
  returned: QtyMap;
  selection: ReturnSelection;
  onChange: (next: ReturnSelection) => void;
  disabled?: boolean;
}) {
  return (
    <Panel title={title}>
      {items.map((it) => {
        const left = remainingQty(it, returned);
        const pick = selection[it.id];
        const qty = pick?.qty ?? 0;
        const gone = returned[it.id] ?? 0;
        const sub = [it.attributesLabelSnap, it.skuSnap].filter(Boolean).join(' · ');
        return (
          <View key={it.id} style={styles.line}>
            <View style={styles.top}>
              <View style={styles.flex}>
                <AppText variant="bodyMedium" color={colors.ink} numberOfLines={2}>
                  {it.listingNameSnap}
                </AppText>
                {sub ? (
                  <AppText variant="meta" color={colors.meta} numberOfLines={1}>
                    {sub}
                  </AppText>
                ) : null}
                <AppText variant="meta" color={colors.meta}>
                  Bought {it.qty} · {formatPaise(it.netLinePaise)}
                  {gone > 0 ? ` · ${gone} already returned` : ''}
                </AppText>
              </View>
              {left > 0 ? (
                <QtyStepper
                  compact
                  value={qty}
                  min={0}
                  max={left}
                  onChange={(n) => !disabled && onChange(setPickQty(selection, it.id, n, left))}
                />
              ) : (
                <AppText variant="meta" color={colors.meta}>
                  All returned
                </AppText>
              )}
            </View>
            {qty > 0 ? (
              <View style={styles.bottom}>
                <Chip
                  label={pick?.restock === false ? 'Not back in stock' : 'Back in stock'}
                  selected={pick?.restock !== false}
                  onPress={() => !disabled && onChange(setPickRestock(selection, it.id, pick?.restock === false))}
                />
                <AppText variant="bodyMedium" color={colors.ink}>
                  {formatPaise(lineRefundPaise(it, qty))}
                </AppText>
              </View>
            ) : null}
          </View>
        );
      })}
    </Panel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  line: {
    backgroundColor: colors.canvas,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
