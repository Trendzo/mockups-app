import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppImage,
  AppText,
  Banner,
  DeliveryPill,
  DetailRow,
  Divider,
  Icon,
  IconButton,
  KeyboardStickyView,
  ListRow,
  Panel,
  PrimaryButton,
  Screen,
  ScreenHeader,
  StatusChip,
  useToast,
} from '../components';
import type { StatusTone } from '../components';
import { ScreenProps } from '../navigation/types';
import { useOrder, useOrderAction, useReturnsDecision } from '../api/ordersHooks';
import { openOrderInvoice } from '../api/invoices';
import { errorMessage } from '../api/request';
import {
  ACTOR_LABEL,
  NEEDS_ATTENTION,
  OrderDetail,
  OrderReturn,
  PAYMENT_LABEL,
  orderStatusMeta,
} from '../types/orders';
import { countdown, useNow } from '../utils/orders';
import { formatPaise } from '../utils/money';
import { formatDateTime, formatDayDate, formatTime, humanize, shortRef, timeAgo } from '../utils/format';
import {
  ACTION_DONE,
  OrderActionDef,
  OrderActionKey,
  actionsFor,
  pendingReturnIds,
} from './orders/orderActions';
import {
  CounterReturnSheet,
  DoorVisitSheet,
  HandoverSheet,
  PickupHandoverSheet,
  ReasonSheet,
} from './orders/OrderActionSheets';
import { colors, radii, spacing } from '../theme/theme';

type Sheet =
  | null
  | 'handover'
  | 'pickup-handover'
  | 'request-cancel'
  | 'mark-undelivered'
  | 'door-close'
  | 'decline-return'
  | 'counter-return';

const RETURN_META: Record<string, { label: string; tone: StatusTone }> = {
  pending: { label: 'Awaiting verification', tone: 'warning' },
  accepted: { label: 'Accepted', tone: 'success' },
  rejected: { label: 'Declined', tone: 'danger' },
};

const PAYMENT_STATUS: Record<string, string> = {
  succeeded: 'Paid',
  pending: 'Payment pending',
  failed: 'Payment failed',
  superseded: 'Replaced',
};

export function OrderDetailScreen({ navigation, route }: ScreenProps<'OrderDetail'>) {
  const { id } = route.params;
  const toast = useToast();
  const orderQ = useOrder(id);
  const action = useOrderAction();
  const returns = useReturnsDecision();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const order = orderQ.data;

  if (!order) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader overline="Order" title={shortRef(id)} onBack={() => navigation.goBack()} />
        {orderQ.isError ? (
          <Banner
            tone="danger"
            title="Couldn't load this order"
            message={errorMessage(orderQ.error)}
            actionLabel="Retry"
            onAction={() => orderQ.refetch()}
            style={styles.gapTop}
          />
        ) : (
          <ActivityIndicator color={colors.ink} style={styles.loader} />
        )}
      </Screen>
    );
  }

  const busy = action.isPending || returns.isPending;
  const meta = orderStatusMeta(order.status);
  const actions = actionsFor(order);
  const primary = actions.find((a) => a.primary && !a.disabledReason) ?? null;
  const secondary = actions.filter((a) => a !== primary);

  /** POST /retailer/orders/:id/<action> with a success toast; closes any sheet. */
  const post = (key: OrderActionKey, endpoint: string, body?: object) =>
    action.mutate(
      { id: order.id, action: endpoint, body },
      {
        onSuccess: () => {
          toast.show(ACTION_DONE[key], 'success');
          setSheet(null);
        },
        onError: (e) => toast.show(errorMessage(e, 'Could not update the order'), 'error'),
      },
    );

  const decideReturns = (decision: 'accept' | 'decline', reasonNote?: string, photos?: string[]) =>
    returns.mutate(
      { orderId: order.id, returnIds: pendingReturnIds(order), decision, reasonNote, photos },
      {
        onSuccess: () => {
          toast.show(ACTION_DONE[decision === 'accept' ? 'accept-return' : 'decline-return'], 'success');
          setSheet(null);
        },
        onError: (e) => toast.show(errorMessage(e, 'Could not update the return'), 'error'),
      },
    );

  const confirm = (title: string, message: string, label: string, run: () => void, destructive?: boolean) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, style: destructive ? 'destructive' : 'default', onPress: run },
    ]);

  const runAction = (a: OrderActionDef) => {
    if (a.disabledReason) {
      toast.show(a.disabledReason, 'info');
      return;
    }
    switch (a.key) {
      case 'accept':
      case 'pack':
      case 'depart':
        post(a.key, a.key);
        return;
      case 'reject':
        confirm(
          'Reject this order?',
          "It's offered to the next-best store. This can't be undone.",
          'Reject',
          () => post('reject', 'reject'),
          true,
        );
        return;
      case 'mark-delivered':
        confirm('Mark as delivered?', 'Confirm the customer has received the order.', 'Delivered', () =>
          post('mark-delivered', 'mark-delivered'),
        );
        return;
      case 'confirm-return-received':
        confirm('Goods received?', 'Confirm the returned items are back at your store.', 'Received', () =>
          post('confirm-return-received', 'confirm-return-received'),
        );
        return;
      case 'door-extend':
        confirm('Give the customer more time?', 'You can extend the try-on window once.', 'Extend', () =>
          post('door-extend', 'door/extend', { reason: 'Customer needs more time' }),
        );
        return;
      case 'accept-return':
        confirm('Accept the return?', 'The customer is refunded for the returned items.', 'Accept', () =>
          decideReturns('accept'),
        );
        return;
      default:
        setSheet(a.key as Sheet);
    }
  };

  const openInvoice = async () => {
    setInvoiceBusy(true);
    try {
      await openOrderInvoice(order.id);
    } catch (e) {
      toast.show(errorMessage(e, 'Could not open the invoice'), 'error');
    } finally {
      setInvoiceBusy(false);
    }
  };

  return (
    <Screen edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <ScreenHeader
          overline="Order"
          title={shortRef(order.id)}
          onBack={() => navigation.goBack()}
          right={
            order.consumerPhoneSnap ? (
              <IconButton
                icon="call-outline"
                onPress={() => Linking.openURL(`tel:${order.consumerPhoneSnap}`).catch(() => {})}
              />
            ) : undefined
          }
        />

        {/* Status */}
        <Panel>
          <View style={styles.statusRow}>
            <StatusChip label={meta.label} tone={meta.tone} style={styles.chipCenter} />
            <DeliveryPill method={order.deliveryMethod} />
          </View>
          <AppText variant="meta" color={colors.meta}>
            Placed {formatDateTime(order.placedAt)} · {timeAgo(order.placedAt)}
          </AppText>
          {order.status === 'routing' ? (
            <Deadline
              at={order.acceptanceDeadlineAt}
              running={(left) => `Accept within ${left} or it goes to another store`}
              over="Accept now — the acceptance window is ending"
            />
          ) : null}
          {order.status === 'at_door' ? (
            <Deadline
              at={order.doorWindowExpiresAt}
              running={(left) => `Try-on window ends in ${left}`}
              over="Try-on window is over — close the door visit"
            />
          ) : null}
          {NEEDS_ATTENTION.includes(order.status) ? (
            <AppText variant="meta" color="#B8860B">
              Needs your attention
            </AppText>
          ) : null}
        </Panel>

        {/* Customer + delivery */}
        <Panel title="Customer">
          <AppText variant="bodyMedium" color={colors.ink}>
            {order.consumerNameSnap || 'Customer'}
          </AppText>
          {order.consumerPhoneSnap ? (
            <AppText
              variant="body"
              color={colors.ink}
              onPress={() => Linking.openURL(`tel:${order.consumerPhoneSnap}`).catch(() => {})}
            >
              {order.consumerPhoneSnap}
            </AppText>
          ) : null}
          {order.consumerEmailSnap ? (
            <AppText variant="meta" color={colors.meta}>
              {order.consumerEmailSnap}
            </AppText>
          ) : null}
          <Divider />
          {order.deliveryMethod === 'pickup' ? (
            <View style={styles.iconLine}>
              <Icon name="storefront-outline" size={18} color={colors.meta} />
              <AppText variant="body" color={colors.ink} style={styles.flex}>
                {order.pickupSlotStart
                  ? `Pickup ${formatDayDate(order.pickupSlotStart)}, ${formatTime(order.pickupSlotStart)}${
                      order.pickupSlotEnd ? `–${formatTime(order.pickupSlotEnd)}` : ''
                    }`
                  : 'Store pickup'}
              </AppText>
            </View>
          ) : (
            <View style={styles.iconLine}>
              <Icon name="location-outline" size={18} color={colors.meta} />
              <AppText variant="body" color={colors.ink} style={styles.flex}>
                {[
                  order.addressLine1Snap,
                  order.addressLine2Snap,
                  order.addressCitySnap,
                  order.addressPincodeSnap,
                ]
                  .filter(Boolean)
                  .join(', ') || 'Address not available'}
              </AppText>
            </View>
          )}
        </Panel>

        {/* Items */}
        <Panel title={`Items (${order.items.length})`}>
          {order.items.map((it) => (
            <View key={it.id} style={styles.item}>
              {it.galleryImageSnap ? (
                <AppImage uri={it.galleryImageSnap} radius={radii.sm} containerStyle={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Icon name="shirt-outline" size={20} color={colors.inkMuted} />
                </View>
              )}
              <View style={styles.flex}>
                <AppText variant="bodyMedium" color={colors.ink} numberOfLines={2}>
                  {it.listingNameSnap}
                </AppText>
                <AppText variant="meta" color={colors.meta} numberOfLines={1}>
                  {[it.brandSnap, it.attributesLabelSnap].filter(Boolean).join(' · ')}
                </AppText>
                <AppText variant="meta" color={colors.meta}>
                  {it.qty} × {formatPaise(it.unitPricePaise)}
                </AppText>
              </View>
              <AppText variant="bodyMedium" color={colors.ink}>
                {formatPaise(it.netLinePaise)}
              </AppText>
            </View>
          ))}
        </Panel>

        {/* Bill */}
        <BillPanel order={order} />

        {order.returns?.length ? <ReturnsPanel returns={order.returns} /> : null}

        {order.refunds?.length ? (
          <Panel title="Refunds">
            {order.refunds.map((r) => (
              <View key={r.id} style={styles.rowBetween}>
                <AppText variant="body" color={colors.ink}>
                  {formatPaise(r.totalRefundPaise)}
                </AppText>
                <StatusChip
                  label={humanize(r.status)}
                  tone={r.status === 'succeeded' ? 'success' : r.status === 'failed' ? 'danger' : 'warning'}
                  style={styles.chipCenter}
                />
              </View>
            ))}
          </Panel>
        ) : null}

        {order.transitions?.length ? <Timeline order={order} /> : null}

        <ListRow
          icon="document-text-outline"
          label="Tax invoice"
          hint={invoiceBusy ? 'Opening…' : 'Download the GST invoice (PDF)'}
          onPress={invoiceBusy ? undefined : openInvoice}
          right={invoiceBusy ? <ActivityIndicator color={colors.ink} /> : undefined}
        />
      </ScrollView>

      {actions.length ? (
        <KeyboardStickyView style={styles.footer} minBottom={spacing.sm}>
          {primary ? (
            <PrimaryButton
              label={primary.label}
              tone="accent"
              loading={busy}
              onPress={() => runAction(primary)}
            />
          ) : null}
          {secondary.length ? (
            <View style={styles.footerRow}>
              {secondary.map((a) => (
                <PrimaryButton
                  key={a.key}
                  label={a.label}
                  tone={a.primary ? 'accent' : 'ghost'}
                  disabled={busy || !!a.disabledReason}
                  onPress={() => runAction(a)}
                  style={styles.flex}
                />
              ))}
            </View>
          ) : null}
          {secondary.some((a) => a.disabledReason) ? (
            <AppText variant="meta" color={colors.meta} style={styles.center}>
              {secondary.find((a) => a.disabledReason)?.disabledReason}
            </AppText>
          ) : null}
        </KeyboardStickyView>
      ) : null}

      <HandoverSheet
        visible={sheet === 'handover'}
        order={order}
        busy={action.isPending}
        onSubmit={(body) => post('handover', 'handover', body)}
        onClose={() => setSheet(null)}
      />
      <PickupHandoverSheet
        visible={sheet === 'pickup-handover'}
        busy={action.isPending}
        onSubmit={(pickupCode) => post('pickup-handover', 'pickup-handover', { pickupCode })}
        onClose={() => setSheet(null)}
      />
      <ReasonSheet
        visible={sheet === 'request-cancel'}
        title="Request cancellation"
        message="Trendzo reviews every cancellation request. Tell us why you can't fulfil this order."
        placeholder="e.g. Item damaged, out of stock"
        submitLabel="Send request"
        busy={action.isPending}
        onSubmit={(reason) => post('request-cancel', 'request-cancel', { reason })}
        onClose={() => setSheet(null)}
      />
      <ReasonSheet
        visible={sheet === 'mark-undelivered'}
        title="Delivery failed"
        message="Say what went wrong — the customer and Trendzo are notified."
        placeholder="e.g. Customer not reachable"
        submitLabel="Mark undelivered"
        danger
        busy={action.isPending}
        onSubmit={(reason) => post('mark-undelivered', 'mark-undelivered', { reason })}
        onClose={() => setSheet(null)}
      />
      <ReasonSheet
        visible={sheet === 'decline-return'}
        title="Decline the return"
        message="This opens a dispute and holds the refund until Trendzo reviews it. Add photos of the item's condition."
        placeholder="e.g. Item used, tags removed"
        submitLabel="Decline & dispute"
        danger
        busy={returns.isPending}
        photosFolder={`disputes/${order.id}`}
        onSubmit={(reason, photos) => decideReturns('decline', reason, photos)}
        onClose={() => setSheet(null)}
      />
      <DoorVisitSheet
        visible={sheet === 'door-close'}
        order={order}
        busy={action.isPending}
        onSubmit={(items) => post('door-close', 'door/close', { items })}
        onClose={() => setSheet(null)}
      />
      <CounterReturnSheet
        visible={sheet === 'counter-return'}
        order={order}
        busy={action.isPending}
        onSubmit={(items) => post('counter-return', 'returns/open-counter', { items })}
        onClose={() => setSheet(null)}
      />
    </Screen>
  );
}

/** Ticking deadline line (re-renders itself, not the whole screen). */
function Deadline({
  at,
  running,
  over,
}: {
  at?: string | null;
  running: (left: string) => string;
  over: string;
}) {
  const now = useNow(1000);
  const left = countdown(at, now);
  return (
    <AppText variant="bodyMedium" color={left ? '#B8860B' : colors.danger}>
      {left ? running(left) : over}
    </AppText>
  );
}

function BillPanel({ order }: { order: OrderDetail }) {
  const minus = (p?: number) => `− ${formatPaise(p ?? 0)}`;
  const payment = order.payments?.[0];
  return (
    <Panel title="Bill">
      <DetailRow label="Items" value={formatPaise(order.itemsSubtotalPaise ?? 0)} />
      {order.couponPaise ? <DetailRow label="Coupon" value={minus(order.couponPaise)} tone="negative" /> : null}
      {order.walletAppliedPaise ? (
        <DetailRow label="Wallet" value={minus(order.walletAppliedPaise)} tone="negative" />
      ) : null}
      {order.pointsRedeemedPaise ? (
        <DetailRow label="Points" value={minus(order.pointsRedeemedPaise)} tone="negative" />
      ) : null}
      <DetailRow label="Tax (GST)" value={formatPaise(order.taxPaise ?? 0)} />
      {order.deliveryFeePaise ? <DetailRow label="Delivery fee" value={formatPaise(order.deliveryFeePaise)} /> : null}
      {order.handlingFeePaise ? <DetailRow label="Handling fee" value={formatPaise(order.handlingFeePaise)} /> : null}
      {order.convenienceFeePaise ? (
        <DetailRow label="Convenience fee" value={formatPaise(order.convenienceFeePaise)} />
      ) : null}
      <Divider />
      <DetailRow label="Total" value={formatPaise(order.grandTotalPaise)} strong />
      <AppText variant="meta" color={colors.meta}>
        {PAYMENT_LABEL[order.paymentMethod] ?? humanize(order.paymentMethod)}
        {payment ? ` · ${PAYMENT_STATUS[payment.status] ?? humanize(payment.status)}` : ''}
      </AppText>
    </Panel>
  );
}

function ReturnsPanel({ returns }: { returns: OrderReturn[] }) {
  return (
    <Panel title="Returns">
      {returns.map((r) => {
        const m = RETURN_META[r.storeDecision] ?? { label: humanize(r.storeDecision), tone: 'neutral' as StatusTone };
        return (
          <View key={r.id} style={styles.returnRow}>
            <View style={styles.rowBetween}>
              <AppText variant="bodyMedium" color={colors.ink}>
                {r.kind === 'door_return' ? 'Returned at the door' : 'Customer return'}
              </AppText>
              <StatusChip label={m.label} tone={m.tone} style={styles.chipCenter} />
            </View>
            {r.reasonText ? (
              <AppText variant="body" color={colors.ink}>
                “{r.reasonText}”
              </AppText>
            ) : null}
            <AppText variant="meta" color={colors.meta}>
              Opened {timeAgo(r.openedAt)}
            </AppText>
          </View>
        );
      })}
    </Panel>
  );
}

function Timeline({ order }: { order: OrderDetail }) {
  const steps = [...(order.transitions ?? [])].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
  return (
    <Panel title="Timeline">
      {steps.map((t, i) => {
        const last = i === steps.length - 1;
        return (
          <View key={t.id} style={styles.step}>
            <View style={styles.rail}>
              <View style={[styles.dot, last && styles.dotLast]} />
              {!last ? <View style={styles.line} /> : null}
            </View>
            <View style={styles.stepBody}>
              <AppText variant="bodyMedium" color={colors.ink}>
                {orderStatusMeta(t.toStatus).label}
              </AppText>
              <AppText variant="meta" color={colors.meta}>
                {formatDateTime(t.at)} · {ACTOR_LABEL[t.actorType] ?? humanize(t.actorType)}
              </AppText>
              {t.reason ? (
                <AppText variant="meta" color={colors.ink}>
                  {t.reason}
                </AppText>
              ) : null}
            </View>
          </View>
        );
      })}
    </Panel>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl, gap: spacing.md },
  loader: { marginTop: spacing.xl },
  gapTop: { marginTop: spacing.md },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  chipCenter: { alignSelf: 'center' },
  iconLine: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  thumb: { width: 48, height: 64, borderRadius: radii.sm },
  thumbEmpty: { backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  returnRow: { gap: 4, paddingVertical: spacing.xs },
  step: { flexDirection: 'row', gap: spacing.md },
  rail: { width: 12, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.cardGray, marginTop: 6 },
  dotLast: { backgroundColor: colors.ink },
  line: { flex: 1, width: 2, backgroundColor: colors.hairline, marginTop: 2 },
  stepBody: { flex: 1, paddingBottom: spacing.md, gap: 2 },
  footer: {
    paddingTop: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  footerRow: { flexDirection: 'row', gap: spacing.sm },
});
