import React from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  Icon,
  PrimaryButton,
  Screen,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { Invoice, PAYMENT_LABELS } from '../types/billing';
import { formatPaise } from '../utils/money';
import { colors, radii, spacing } from '../theme/theme';

/** Format an epoch-ms timestamp as "10 Jul 2026, 4:31 PM". */
function formatWhen(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Plain-text receipt for sharing over WhatsApp/SMS/etc. */
function invoiceText(inv: Invoice): string {
  const lines = inv.items.map(
    (it) =>
      `${it.qty} × ${it.name} (${it.attributesLabel}) — ${formatPaise(
        it.pricePaise * it.qty,
      )}`,
  );
  return [
    inv.storeName ?? 'Trendzo',
    `Invoice ${inv.number}`,
    formatWhen(inv.createdAt),
    '',
    ...lines,
    '',
    `Subtotal: ${formatPaise(inv.subtotalPaise)}`,
    `GST: ${formatPaise(inv.taxPaise)}`,
    `Total: ${formatPaise(inv.totalPaise)}`,
    `Paid via ${PAYMENT_LABELS[inv.payment]}`,
  ].join('\n');
}

/** Invoice receipt shown after charging a bill. Share or start a new bill. */
export function InvoiceScreen({ navigation, route }: ScreenProps<'Invoice'>) {
  const insets = useSafeAreaInsets();
  const inv = route.params.invoice;

  const onShare = async () => {
    try {
      await Share.share({ message: invoiceText(inv) });
    } catch {
      /* user cancelled */
    }
  };

  return (
    <Screen edges={['top']} padded={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Success header */}
        <View style={styles.successWrap}>
          <View style={styles.successBadge}>
            <Icon name="checkmark" size={30} color={colors.accentInk} />
          </View>
          <AppText variant="cardTitle" color={colors.ink} style={styles.paid}>
            {formatPaise(inv.totalPaise)} charged
          </AppText>
          <AppText variant="meta" color={colors.meta}>
            Paid via {PAYMENT_LABELS[inv.payment]}
          </AppText>
        </View>

        {/* Receipt */}
        <View style={styles.receipt}>
          <View style={styles.receiptHead}>
            <AppText variant="bodyMedium" color={colors.ink}>
              {inv.storeName ?? 'Trendzo'}
            </AppText>
            <AppText variant="meta" color={colors.meta}>
              {inv.number}
            </AppText>
            <AppText variant="meta" color={colors.meta}>
              {formatWhen(inv.createdAt)}
            </AppText>
          </View>

          <View style={styles.divider} />

          {inv.items.map((it) => (
            <View key={it.variantId} style={styles.line}>
              <View style={styles.flex}>
                <AppText variant="body" color={colors.ink} numberOfLines={1}>
                  {it.name}
                </AppText>
                <AppText variant="meta" color={colors.meta}>
                  {it.qty} × {formatPaise(it.pricePaise)} · {it.attributesLabel}
                </AppText>
              </View>
              <AppText variant="bodyMedium" color={colors.ink}>
                {formatPaise(it.pricePaise * it.qty)}
              </AppText>
            </View>
          ))}

          <View style={styles.divider} />

          <Row label="Subtotal" value={formatPaise(inv.subtotalPaise)} />
          <Row label="GST" value={formatPaise(inv.taxPaise)} />
          <Row label="Total" value={formatPaise(inv.totalPaise)} strong />
        </View>
      </ScrollView>

      {/* Actions */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <PrimaryButton label="Share receipt" tone="surface" onPress={onShare} />
        <PrimaryButton
          label="New bill"
          tone="accent"
          onPress={() => navigation.replace('Billing')}
        />
        <PrimaryButton
          label="Done"
          tone="ghost"
          onPress={() => navigation.navigate('Main')}
        />
      </View>
    </Screen>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.row}>
      <AppText
        variant={strong ? 'bodyMedium' : 'meta'}
        color={strong ? colors.ink : colors.meta}
      >
        {label}
      </AppText>
      <AppText
        variant={strong ? 'cardTitle' : 'bodyMedium'}
        color={colors.ink}
        style={strong ? styles.strong : undefined}
      >
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.xl,
    paddingBottom: 200,
    gap: spacing.lg,
  },
  successWrap: { alignItems: 'center', gap: spacing.xs },
  successBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  paid: { fontSize: 24, lineHeight: 28 },
  receipt: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  receiptHead: { gap: 2 },
  flex: { flex: 1 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  divider: { height: 1, backgroundColor: colors.hairline, marginVertical: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  strong: { fontSize: 20, lineHeight: 24 },
  footer: {
    gap: spacing.sm,
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
