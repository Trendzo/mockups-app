import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { PrimaryButton } from './PrimaryButton';
import { StatusChip } from './StatusChip';
import {
  DELIVERY_LABEL,
  DeliveryMethod,
  NEEDS_ATTENTION,
  OrderRow,
  PAYMENT_LABEL,
  orderStatusMeta,
} from '../types/orders';
import { countdown, itemsPreview, useNow } from '../utils/orders';
import { formatPaise } from '../utils/money';
import { shortRef, timeAgo } from '../utils/format';
import { colors, radii, spacing } from '../theme/theme';

const METHOD_ICON: Record<DeliveryMethod, string> = {
  express: 'flash-outline',
  standard: 'cube-outline',
  pickup: 'storefront-outline',
  try_and_buy: 'shirt-outline',
};

/** Small pill naming how the order reaches the customer. */
export function DeliveryPill({ method }: { method: DeliveryMethod }) {
  return (
    <View style={styles.pill}>
      <Icon name={METHOD_ICON[method] ?? 'cube-outline'} size={12} color={colors.ink} />
      <AppText variant="meta" color={colors.ink} style={styles.pillText}>
        {DELIVERY_LABEL[method] ?? method}
      </AppText>
    </View>
  );
}

/** Live "m:ss to accept" — ticks on its own so the list doesn't re-render every second. */
export function AcceptTimer({ deadline }: { deadline?: string | null }) {
  const now = useNow(1000);
  const left = countdown(deadline, now);
  const tint = left ? '#B8860B' : colors.danger;
  return (
    <View style={styles.timer}>
      <Icon name="timer-outline" size={16} color={tint} />
      <AppText variant="meta" color={tint} numberOfLines={1} style={styles.timerText}>
        {left ? `${left} to accept` : 'Accept now'}
      </AppText>
    </View>
  );
}

/**
 * One online order in a list. New orders (status `routing`) carry a live
 * acceptance countdown and inline Accept / Reject, because the store only has
 * a few minutes before the order is offered to the next store.
 */
export function OrderCard({
  order,
  onPress,
  onAccept,
  onReject,
  busy,
}: {
  order: OrderRow;
  onPress: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  busy?: boolean;
}) {
  const meta = orderStatusMeta(order.status);
  const isNew = order.status === 'routing';
  const attention = NEEDS_ATTENTION.includes(order.status);

  return (
    <PressableScale onPress={onPress} toScale={0.98} style={[styles.card, isNew && styles.cardNew]}>
      <View style={styles.topRow}>
        <AppText variant="bodyMedium" color={colors.ink}>
          {shortRef(order.id)}
        </AppText>
        <DeliveryPill method={order.deliveryMethod} />
        <View style={styles.flex} />
        <AppText variant="meta" color={colors.meta}>
          {timeAgo(order.placedAt)}
        </AppText>
      </View>

      <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
        {order.consumerName || 'Customer'}
      </AppText>
      <AppText variant="meta" color={colors.meta} numberOfLines={1}>
        {itemsPreview(order)}
      </AppText>

      {attention ? (
        <View style={styles.attention}>
          <Icon name="alert-circle" size={14} color="#B8860B" />
          <AppText variant="meta" color="#B8860B">
            Needs your attention
          </AppText>
        </View>
      ) : null}

      <View style={styles.bottomRow}>
        <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1} style={styles.amount}>
          {formatPaise(order.grandTotalPaise)}
          <AppText variant="meta" color={colors.meta}>
            {'  '}
            {PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}
          </AppText>
        </AppText>
        <StatusChip label={meta.label} tone={meta.tone} style={styles.chip} />
      </View>

      {isNew && (onAccept || onReject) ? (
        <View style={styles.actions}>
          <AcceptTimer deadline={order.acceptanceDeadlineAt} />
          {onReject ? (
            <PrimaryButton
              label="Reject"
              tone="surface"
              fullWidth={false}
              disabled={busy}
              onPress={onReject}
              style={styles.smallBtn}
            />
          ) : null}
          {onAccept ? (
            <PrimaryButton
              label="Accept"
              tone="accent"
              fullWidth={false}
              loading={busy}
              onPress={onAccept}
              style={styles.smallBtn}
            />
          ) : null}
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: 4,
  },
  cardNew: { borderWidth: 1.5, borderColor: colors.ink },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.canvas,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pillText: { fontSize: 11, lineHeight: 14 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  // The amount gives way (ellipsis) before the status pill does.
  amount: { flex: 1 },
  chip: { alignSelf: 'center', maxWidth: '55%' },
  attention: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  timer: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  timerText: { flexShrink: 1 },
  smallBtn: { paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md },
});
