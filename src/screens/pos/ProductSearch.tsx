import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, TextInput, View } from 'react-native';
import {
  AppImage,
  AppText,
  CodeScannerModal,
  Divider,
  Icon,
  IconButton,
  Panel,
  PressableScale,
  useToast,
} from '../../components';
import { findByCode } from '../../api/pos';
import { useDebouncedValue, useLookupNow, useProductLookup } from '../../api/posHooks';
import { errorMessage } from '../../api/request';
import { PosLookupRow } from '../../types/pos';
import { formatPaise } from '../../utils/money';
import { Haptics } from '../../utils/haptics';
import { colors, radii, spacing, type as typeScale } from '../../theme/theme';

/**
 * Product search + barcode / QR scan, the same lookup the Register uses (`/pos/lookup`, scan resolver).
 * Typing lists matches; Enter takes an exact barcode / SKU hit or a lone match straight away; the
 * camera button reads a Trendzo QR or a barcode. Calls `onPick(row)` — what to do with it (add to an
 * exchange, queue a label) is up to the screen.
 */
export function ProductSearch({
  onPick,
  placeholder = 'Search product, SKU or barcode',
  minChars = 2,
}: {
  onPick: (row: PosLookupRow) => void;
  placeholder?: string;
  minChars?: number;
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query);
  const lookupQ = useProductLookup(debounced);
  const lookupNow = useLookupNow();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [scanOpen, setScanOpen] = useState(false);

  const term = query.trim();
  const searching = term.length >= minChars;

  const rows = useMemo(() => {
    const list = lookupQ.data?.results ?? [];
    const exact = lookupQ.data?.exact;
    return exact && !list.some((r) => r.variantId === exact.variantId) ? [exact, ...list] : list;
  }, [lookupQ.data]);
  const loading = debounced.trim() !== term || lookupQ.isFetching;

  const pick = (row: PosLookupRow) => {
    onPick(row);
    Haptics.select();
    setQuery('');
  };

  /** One lookup at a time; a second Enter / scan while one is in flight is dropped. */
  const run = async (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const submit = () => {
    if (term.length < minChars) return;
    run(async () => {
      try {
        const res = await lookupNow(term);
        const results = res?.results ?? [];
        const row = res?.exact ?? (results.length === 1 ? results[0] : null);
        if (row) pick(row);
        else if (!results.length) toast.show(`No product for "${term}"`, 'error');
        else Keyboard.dismiss(); // several matches — choose from the list
      } catch (e) {
        toast.show(errorMessage(e, "Couldn't search"), 'error');
      }
    });
  };

  const onCode = (code: string) => {
    setScanOpen(false);
    run(async () => {
      try {
        const row = await findByCode(code.trim());
        if (row) pick(row);
        else toast.show('No product for that code', 'error');
      } catch (e) {
        toast.show(errorMessage(e, 'No product for that code'), 'error');
      }
    });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          {busy ? (
            <ActivityIndicator size="small" color={colors.ink} />
          ) : (
            <Icon name="search" size={18} color={colors.meta} />
          )}
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder}
            placeholderTextColor={colors.inkMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            // Keep focus after Enter so a USB / Bluetooth scanner can keep firing.
            submitBehavior="submit"
            onSubmitEditing={submit}
            style={styles.searchInput}
          />
          {query ? (
            <PressableScale onPress={() => setQuery('')} haptic={false} hitSlop={10}>
              <Icon name="close-circle" size={18} color={colors.inkMuted} />
            </PressableScale>
          ) : null}
        </View>
        <IconButton icon="barcode-outline" tone="ink" disabled={busy} onPress={() => setScanOpen(true)} />
      </View>

      {searching ? (
        <Panel>
          <View style={styles.resultsHead}>
            <AppText variant="sectionLabel" color={colors.meta}>
              Results
            </AppText>
            {loading ? <ActivityIndicator size="small" color={colors.ink} /> : null}
          </View>
          {rows.length ? (
            rows.map((row, i) => (
              <React.Fragment key={row.variantId}>
                {i > 0 ? <Divider /> : null}
                <ResultRow row={row} onPress={() => pick(row)} />
              </React.Fragment>
            ))
          ) : loading ? (
            <AppText variant="meta" color={colors.meta}>
              Searching…
            </AppText>
          ) : lookupQ.isError ? (
            <AppText variant="meta" color={colors.danger}>
              {errorMessage(lookupQ.error, "Couldn't search")}
            </AppText>
          ) : (
            <AppText variant="meta" color={colors.meta}>
              No product matches “{term}”.
            </AppText>
          )}
        </Panel>
      ) : null}

      <CodeScannerModal visible={scanOpen} onClose={() => setScanOpen(false)} onCode={onCode} />
    </View>
  );
}

function ResultRow({ row, onPress }: { row: PosLookupRow; onPress: () => void }) {
  const out = row.availableQty <= 0;
  const sub = [row.attributesLabel, row.sku, out ? null : `${row.availableQty} in stock`]
    .filter(Boolean)
    .join(' · ');
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={styles.resultRow}>
      {row.imageUrl ? (
        <AppImage uri={row.imageUrl} radius={radii.sm} containerStyle={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Icon name="shirt-outline" size={18} color={colors.inkMuted} />
        </View>
      )}
      <View style={styles.flex}>
        <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
          {row.name}
        </AppText>
        {sub ? (
          <AppText variant="meta" color={colors.meta} numberOfLines={1}>
            {sub}
          </AppText>
        ) : null}
        {out ? (
          <AppText variant="meta" color={colors.danger}>
            Out of stock
          </AppText>
        ) : null}
      </View>
      <AppText variant="bodyMedium" color={colors.ink}>
        {formatPaise(row.pricePaise)}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: spacing.sm },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchBox: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.sm + 4,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    color: colors.ink,
    fontFamily: typeScale.body.fontFamily,
    fontSize: 15,
  },
  resultsHead: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 2 },
  thumb: { width: 44, height: 44, borderRadius: radii.sm },
  thumbEmpty: { backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
});
