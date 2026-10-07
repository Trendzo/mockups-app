import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Field, Icon, Panel, PressableScale, PrimaryButton, SegmentedControl } from '../../components';
import type { SegmentOption } from '../../components';
import { PosTenderMethod, TENDER_REFERENCE_MAX } from '../../types/pos';
import {
  TenderDraft,
  addTenderRow,
  removeTenderRow,
  resolveTenders,
  updateTenderRow,
} from '../../utils/posExchange';
import { formatPaise } from '../../utils/money';
import { colors, radii, spacing } from '../../theme/theme';

const METHODS: SegmentOption<PosTenderMethod>[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
];
const MAX_ROWS = 3;

/**
 * How an amount that has to be settled EXACTLY (a refund, or the difference of an exchange) is paid
 * out / collected: one method by default, optionally split across up to three. Every method but the
 * last has a typed amount; the last one always takes the rest, so the legs balance by construction
 * (the server rejects anything that doesn't add up).
 */
export function TenderSplitEditor({
  heading,
  rows,
  duePaise,
  onChange,
  disabled,
}: {
  heading: string;
  rows: TenderDraft[];
  duePaise: number;
  onChange: (rows: TenderDraft[]) => void;
  disabled?: boolean;
}) {
  const resolved = useMemo(() => resolveTenders(rows, duePaise), [rows, duePaise]);
  const balanced = !resolved.error && resolved.remainingPaise === 0;

  return (
    <Panel title={heading}>
      {rows.map((row, i) => {
        const last = i === rows.length - 1;
        return (
          <View key={row.key} style={styles.leg}>
            <View style={styles.legHead}>
              <View style={styles.flex}>
                <SegmentedControl
                  compact
                  options={METHODS}
                  value={row.method}
                  onChange={(method) => !disabled && onChange(updateTenderRow(rows, i, { method }))}
                />
              </View>
              {rows.length > 1 ? (
                <PressableScale
                  onPress={() => onChange(removeTenderRow(rows, i))}
                  disabled={disabled}
                  hitSlop={10}
                  toScale={0.9}
                  style={styles.removeBtn}
                >
                  <Icon name="close" size={16} color={colors.meta} />
                </PressableScale>
              ) : null}
            </View>

            {last ? (
              <View style={styles.amountRow}>
                <AppText variant="meta" color={colors.meta}>
                  {rows.length > 1 ? 'The rest' : 'Amount'}
                </AppText>
                <AppText variant="bodyMedium" color={colors.ink}>
                  {formatPaise(resolved.amounts[i] ?? 0)}
                </AppText>
              </View>
            ) : (
              <Field
                label="Amount"
                prefix="₹"
                value={row.amountText}
                onChangeText={(t) => onChange(updateTenderRow(rows, i, { amountText: t }))}
                keyboardType="decimal-pad"
                editable={!disabled}
                boxed
              />
            )}

            {row.method !== 'cash' ? (
              <Field
                label="Reference (optional)"
                value={row.reference}
                onChangeText={(t) => onChange(updateTenderRow(rows, i, { reference: t }))}
                placeholder={row.method === 'upi' ? 'UPI transaction id' : 'Card slip / approval code'}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={TENDER_REFERENCE_MAX}
                editable={!disabled}
                boxed
              />
            ) : null}
          </View>
        );
      })}

      {rows.length < MAX_ROWS && duePaise > 0 ? (
        <PrimaryButton
          label="Split across methods"
          tone="surface"
          disabled={disabled}
          onPress={() => onChange(addTenderRow(rows, duePaise))}
        />
      ) : null}

      <AppText variant="meta" color={balanced ? colors.success : colors.danger}>
        {resolved.error ?? (balanced ? `Adds up to ${formatPaise(duePaise)}` : `${formatPaise(Math.abs(resolved.remainingPaise))} left to assign`)}
      </AppText>
    </Panel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  leg: {
    backgroundColor: colors.canvas,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  legHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
