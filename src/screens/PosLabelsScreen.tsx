import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  Banner,
  EmptyState,
  Icon,
  KeyboardStickyView,
  Panel,
  PressableScale,
  PrimaryButton,
  QtyStepper,
  Screen,
  ScreenHeader,
  SegmentedControl,
  ToggleRow,
  useToast,
} from '../components';
import type { SegmentOption } from '../components';
import { ScreenProps } from '../navigation/types';
import { useLabelSettings } from '../store/labelSettings';
import { usePermissions } from '../utils/usePermission';
import {
  CodeType,
  LABEL_FIELD_TOGGLES,
  LABEL_SIZES,
  LABEL_SIZE_KEYS,
  LabelPick,
  LabelSizeKey,
  MAX_COPIES,
  buildLabelSheet,
  clampCopies,
} from '../utils/labelHtml';
import {
  PRINT_UNAVAILABLE_MESSAGE,
  isPrintAvailable,
  printFailureMessage,
  printHtml,
} from '../utils/printing';
import { PosLookupRow } from '../types/pos';
import { formatPaise } from '../utils/money';
import { ProductSearch } from './pos/ProductSearch';
import { colors, radii, spacing } from '../theme/theme';

const SIZE_OPTIONS: SegmentOption<LabelSizeKey>[] = LABEL_SIZE_KEYS.map((k) => ({
  value: k,
  label: LABEL_SIZES[k].label,
}));
const CODE_OPTIONS: SegmentOption<CodeType>[] = [
  { value: 'qr', label: 'QR code' },
  { value: 'barcode', label: 'Barcode' },
];

const toPick = (row: PosLookupRow): LabelPick => ({
  variantId: row.variantId,
  listingId: row.listingId,
  name: row.name,
  attributesLabel: row.attributesLabel,
  sku: row.sku,
  barcode: row.barcode,
  pricePaise: row.pricePaise,
  compareAtPaise: row.compareAtPaise,
  copies: 1,
});

/**
 * Price-tag labels: search or scan products, choose copies, size and what shows on the tag, then print
 * the sheet through the system print dialog. The QR on each tag is `cx:v:<variantId>` — scanning it at
 * the Register adds that exact variant. Settings (size, fields, QR vs barcode) are remembered.
 */
export function PosLabelsScreen({ navigation }: ScreenProps<'PosLabels'>) {
  const toast = useToast();
  const { can } = usePermissions();
  const size = useLabelSettings((s) => s.size);
  const config = useLabelSettings((s) => s.config);
  const setSize = useLabelSettings((s) => s.setSize);
  const setConfig = useLabelSettings((s) => s.setConfig);
  const [picks, setPicks] = useState<LabelPick[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [printing, setPrinting] = useState(false);

  const total = useMemo(() => picks.reduce((s, p) => s + p.copies, 0), [picks]);

  const add = (row: PosLookupRow) =>
    setPicks((prev) => {
      const hit = prev.find((p) => p.variantId === row.variantId);
      if (hit) {
        return prev.map((p) =>
          p.variantId === row.variantId ? { ...p, copies: clampCopies(p.copies + 1) } : p,
        );
      }
      return [...prev, toPick(row)];
    });

  const setCopies = (variantId: string, copies: number) =>
    setPicks((prev) =>
      copies <= 0
        ? prev.filter((p) => p.variantId !== variantId)
        : prev.map((p) => (p.variantId === variantId ? { ...p, copies: clampCopies(copies) } : p)),
    );

  const print = async () => {
    if (printing || picks.length === 0) return;
    if (!isPrintAvailable()) {
      toast.show(PRINT_UNAVAILABLE_MESSAGE, 'info');
      return;
    }
    const sheet = buildLabelSheet({ picks, size, config });
    if (sheet.skipped.length) {
      toast.show(
        `No barcode or SKU for ${sheet.skipped.length === 1 ? `"${sheet.skipped[0]}"` : `${sheet.skipped.length} items`} — skipped`,
        'info',
      );
    }
    if (sheet.count === 0) {
      toast.show('Nothing to print', 'error');
      return;
    }
    setPrinting(true);
    try {
      await printHtml(sheet.html, `Labels (${sheet.count})`);
    } catch (e) {
      toast.show(printFailureMessage(e, "Couldn't print the labels"), 'error');
    } finally {
      setPrinting(false);
    }
  };

  const header = (
    <ScreenHeader
      overline="Billing counter"
      title="Product labels"
      onBack={() => navigation.goBack()}
    />
  );

  if (!can('pos.labels')) {
    return (
      <Screen edges={['top', 'bottom']}>
        {header}
        <Banner
          tone="warning"
          title="Not authorized"
          message="You don't have access to label printing."
          style={styles.gapTop}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {header}

        <ProductSearch onPick={add} placeholder="Search or scan products" />

        <Panel title="Tag">
          <SegmentedControl compact options={SIZE_OPTIONS} value={size} onChange={setSize} />
          <PressableScale onPress={() => setShowConfig((v) => !v)} haptic={false} style={styles.settingsRow}>
            <Icon name="options-outline" size={18} color={colors.ink} />
            <AppText variant="bodyMedium" color={colors.ink} style={styles.flex}>
              What shows on the tag
            </AppText>
            <Icon name={showConfig ? 'chevron-up' : 'chevron-down'} size={18} color={colors.meta} />
          </PressableScale>
          {showConfig ? (
            <View style={styles.config}>
              <SegmentedControl
                compact
                options={CODE_OPTIONS}
                value={config.codeType}
                onChange={(codeType) => setConfig({ codeType })}
              />
              {LABEL_FIELD_TOGGLES.map((f) => (
                <ToggleRow
                  key={f.key}
                  label={f.label}
                  value={config[f.key]}
                  onChange={(v) => setConfig({ [f.key]: v })}
                />
              ))}
              <AppText variant="meta" color={colors.meta}>
                {config.codeType === 'qr'
                  ? 'The QR opens that exact item when scanned at the Register.'
                  : 'The barcode carries the item’s barcode, or its SKU when it has none.'}
              </AppText>
            </View>
          ) : null}
        </Panel>

        <Panel title={picks.length ? `Labels · ${total}` : 'Labels'}>
          {picks.length === 0 ? (
            <EmptyState
              icon="pricetag-outline"
              title="No labels selected"
              message="Search or scan products to build a label sheet."
              style={styles.empty}
            />
          ) : (
            picks.map((p) => (
              <View key={p.variantId} style={styles.pick}>
                <View style={styles.flex}>
                  <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
                    {p.name}
                  </AppText>
                  <AppText variant="meta" color={colors.meta} numberOfLines={1}>
                    {[p.attributesLabel, formatPaise(p.pricePaise)].filter(Boolean).join(' · ')}
                  </AppText>
                </View>
                <QtyStepper
                  compact
                  value={p.copies}
                  min={0}
                  max={MAX_COPIES}
                  onChange={(n) => setCopies(p.variantId, n)}
                />
              </View>
            ))
          )}
        </Panel>
      </ScrollView>

      <KeyboardStickyView style={styles.footer} minBottom={spacing.sm}>
        <PrimaryButton
          label={total > 0 ? `Print ${total} label${total === 1 ? '' : 's'}` : 'Print labels'}
          tone="accent"
          loading={printing}
          disabled={picks.length === 0}
          onPress={print}
        />
      </KeyboardStickyView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: spacing.xl, gap: spacing.md },
  gapTop: { marginTop: spacing.md },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.canvas,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  config: { gap: spacing.sm },
  empty: { paddingVertical: spacing.md },
  pick: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  footer: { paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.hairline },
});
