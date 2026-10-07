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
  PressableScale,
  PrimaryButton,
  Screen,
  ScreenHeader,
  StatusChip,
  useToast,
} from '../components';
import type { StatusTone } from '../components';
import { ScreenProps } from '../navigation/types';
import { useOrder, useOrderAction, useReturnsDecision } from '../api/ordersHooks';
import { useCreateIssue } from '../api/issuesHooks';
import { openOrderInvoice } from '../api/invoices';
import { errorMessage } from '../api/request';
import {
  ACTOR_LABEL,
  DeliveryAttempt,
  HeldItem,
  NEEDS_ATTENTION,
  OrderDetail,
  OrderDispute,
  OrderRefund,
  OrderReturn,
  PAYMENT_LABEL,
  itemOutcomeMeta,
  orderStatusMeta,
} from '../types/orders';
import { issueDecisionLabel, issueStatusMeta } from '../types/issues';
import { RETURN_REASON_LABEL } from '../types/returns';
import { countdown, orderBill, useNow } from '../utils/orders';
import { formatPaise } from '../utils/money';
import { formatDateTime, formatDayDate, formatTime, humanize, shortRef, timeAgo } from '../utils/format';
import { usePermissions } from '../utils/usePermission';
import {
  ACTION_DONE,
  IssueActionKey,
  OrderActionDef,
  OrderActionKey,
  actionsFor,
  issueActionsFor,
  pendingReturnIds,
} from './orders/orderActions';
import {
  CounterReturnSheet,
  DeliveryOtpSheet,
  DoorVisitSheet,
  HandoverSheet,
  PickupHandoverSheet,
  ReasonSheet,
} from './orders/OrderActionSheets';
import { RaiseIssueSheet } from './orders/RaiseIssueSheet';
import { EvidenceStrip } from './orders/EvidenceStrip';
import { colors, radii, spacing } from '../theme/theme';

type Sheet =
  | null
  | 'handover'
  | 'pickup-handover'
  | 'request-cancel'
  | 'mark-undelivered'
  | 'door-close'
  | 'decline-return'
  | 'counter-return'
  | 'mark-delivered'
  | 'raise-issue'
  | 'request-refund';

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

const REFUND_DEST: Record<string, string> = {
  original_tender: 'Original payment',
  wallet: 'Trendzo wallet',
  cash: 'Cash at the counter',
  manual_payout: 'Manual payout',
};

export function OrderDetailScreen({ navigation, route }: ScreenProps<'OrderDetail'>) {
  const { id } = route.params;
  const toast = useToast();
  const orderQ = useOrder(id);
  const action = useOrderAction();
  const returns = useReturnsDecision();
  const createIssue = useCreateIssue();
  const { can } = usePermissions();
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
  // Hide what this login has no permission for (the server enforces it regardless).
  const actions = actionsFor(order, can);
  const issueActions = issueActionsFor(order, can);
  const primary = actions.find((a) => a.primary && !a.disabledReason) ?? null;
  const secondary = actions.filter((a) => a !== primary);
  const canViewIssues = can('disputes.view');
  const canViewReturns = can('returns.view');

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
        // The server wants the customer's delivery OTP as proof of handover.
        setSheet('mark-delivered');
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

  const openIssue = (issueId: string) => {
    if (canViewIssues) navigation.navigate('IssueDetail', { id: issueId });
  };

  /** Raise dispute / Request refund — both file a dispute (kind 'dispute'). */
  const raiseIssue = (input: { subject: string; description: string; evidence: string[] }) =>
    createIssue.mutate(
      { orderId: order.id, kind: 'dispute', ...input },
      {
        onSuccess: (res) => {
          toast.show(sheet === 'request-refund' ? 'Refund request raised' : 'Dispute raised', 'success');
          setSheet(null);
          if (res?.issueId) openIssue(res.issueId);
        },
        onError: (e) => toast.show(errorMessage(e, "Couldn't raise the dispute"), 'error'),
      },
    );

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
          {order.group?.siblingOrders?.length ? (
            <AppText variant="meta" color={colors.meta}>
              Part of a checkout with {order.group.siblingOrders.length} other order
              {order.group.siblingOrders.length === 1 ? '' : 's'}
            </AppText>
          ) : null}
        </Panel>

        {order.openDispute ? (
          <Banner
            tone="warning"
            title="A dispute is open on this order"
            message="Funds are held until an admin decides. No further refund actions until it's resolved."
            actionLabel={canViewIssues ? 'View dispute' : undefined}
            onAction={() => openIssue(order.openDispute!.id)}
          />
        ) : null}

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
          {order.items.map((it) => {
            const outcome = itemOutcomeMeta(it.outcome);
            return (
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
                  {outcome ? (
                    <StatusChip label={outcome.label} tone={outcome.tone} style={styles.outcomeChip} />
                  ) : null}
                </View>
                <AppText variant="bodyMedium" color={colors.ink}>
                  {formatPaise(it.netLinePaise)}
                </AppText>
              </View>
            );
          })}
        </Panel>

        {/* Bill */}
        <BillPanel order={order} />

        {order.returns?.length ? (
          <ReturnsPanel
            returns={order.returns}
            onOpen={canViewReturns ? (rid) => navigation.navigate('ReturnDetail', { id: rid }) : undefined}
          />
        ) : null}

        {order.heldItems?.length ? <HeldItemsPanel held={order.heldItems} /> : null}

        {order.refunds?.length ? (
          <RefundsPanel
            refunds={order.refunds}
            cashReturnId={
              can('returns.accept') ? order.returns?.find((r) => r.storeDecision === 'accepted')?.id : undefined
            }
            onOpenReturn={(rid) => navigation.navigate('ReturnDetail', { id: rid })}
          />
        ) : null}

        {/* Disputes */}
        <Panel title="Disputes">
          {order.disputes?.length ? (
            order.disputes.map((d) => (
              <DisputeRow key={d.id} dispute={d} onPress={canViewIssues ? () => openIssue(d.id) : undefined} />
            ))
          ) : (
            <AppText variant="meta" color={colors.meta}>
              No disputes on this order.
            </AppText>
          )}
          {issueActions.length ? (
            <View style={styles.footerRow}>
              {issueActions.map((a) => (
                <PrimaryButton
                  key={a.key}
                  label={a.label}
                  tone="surface"
                  disabled={!!a.disabledReason}
                  onPress={() => setSheet(a.key as IssueActionKey)}
                  style={styles.flex}
                />
              ))}
            </View>
          ) : null}
          {issueActions.find((a) => a.disabledReason) ? (
            <AppText variant="meta" color={colors.meta}>
              {issueActions.find((a) => a.disabledReason)?.disabledReason}
            </AppText>
          ) : null}
        </Panel>

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
      <DeliveryOtpSheet
        visible={sheet === 'mark-delivered'}
        busy={action.isPending}
        onSubmit={(otp) => post('mark-delivered', 'mark-delivered', { otp })}
        onClose={() => setSheet(null)}
      />
      <RaiseIssueSheet
        visible={sheet === 'raise-issue' || sheet === 'request-refund'}
        mode={sheet === 'request-refund' ? 'refund' : 'dispute'}
        orderId={order.id}
        busy={createIssue.isPending}
        onSubmit={raiseIssue}
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

/**
 * The bill as rows that add up to the total: items − offers − coupon − points +
 * GST (CGST/SGST or IGST) + fees. The wallet is shown beneath the total as part of
 * how it was paid, not as a further discount.
 */
function BillPanel({ order }: { order: OrderDetail }) {
  const bill = orderBill(order);
  const payment = order.payments?.[0];
  const method = PAYMENT_LABEL[order.paymentMethod] ?? humanize(order.paymentMethod);
  return (
    <Panel title="Bill">
      {bill.rows.map((r) => (
        <DetailRow
          key={r.key}
          label={r.label}
          hint={r.hint}
          value={r.amountPaise < 0 ? `− ${formatPaise(-r.amountPaise)}` : formatPaise(r.amountPaise)}
          tone={r.kind === 'discount' ? 'negative' : 'default'}
        />
      ))}
      <Divider />
      <DetailRow label="Total" value={formatPaise(bill.totalPaise)} strong />
      {bill.walletPaise > 0 ? (
        <>
          <DetailRow label="Paid from wallet" value={formatPaise(bill.walletPaise)} tone="muted" />
          <DetailRow
            label={order.paymentMethod === 'cod' ? 'Cash to collect' : `Paid by ${method}`}
            value={formatPaise(bill.chargedPaise)}
            tone="muted"
          />
        </>
      ) : null}
      <AppText variant="meta" color={colors.meta}>
        {method}
        {payment ? ` · ${PAYMENT_STATUS[payment.status] ?? humanize(payment.status)}` : ''}
      </AppText>
    </Panel>
  );
}

function ReturnsPanel({
  returns,
  onOpen,
}: {
  returns: OrderReturn[];
  onOpen?: (returnId: string) => void;
}) {
  return (
    <Panel title="Returns">
      {returns.map((r) => {
        const m = RETURN_META[r.storeDecision] ?? { label: humanize(r.storeDecision), tone: 'neutral' as StatusTone };
        const body = (
          <>
            <View style={styles.rowBetween}>
              <AppText variant="bodyMedium" color={colors.ink} style={styles.flex}>
                {r.kind === 'door_return' ? 'Returned at the door' : 'Customer return'}
              </AppText>
              <StatusChip label={m.label} tone={m.tone} style={styles.chipCenter} />
              {onOpen ? <Icon name="chevron-forward" size={16} color={colors.meta} /> : null}
            </View>
            {r.reasonText ? (
              <AppText variant="body" color={colors.ink}>
                “{r.reasonText}”
              </AppText>
            ) : null}
            {r.reasonCategory ? (
              <AppText variant="meta" color={colors.meta}>
                {RETURN_REASON_LABEL[r.reasonCategory] ?? humanize(r.reasonCategory)}
              </AppText>
            ) : null}
            <AppText variant="meta" color={colors.meta}>
              Opened {timeAgo(r.openedAt)}
            </AppText>
          </>
        );
        return onOpen ? (
          <PressableScale
            key={r.id}
            onPress={() => onOpen(r.id)}
            toScale={0.98}
            haptic={false}
            style={styles.returnRow}
          >
            {body}
          </PressableScale>
        ) : (
          <View key={r.id} style={styles.returnRow}>
            {body}
          </View>
        );
      })}
    </Panel>
  );
}

/** Returned goods the store is holding for the customer (after a declined return). */
function HeldItemsPanel({ held }: { held: HeldItem[] }) {
  return (
    <Panel title="Items held">
      {held.map((h) => (
        <View key={h.id} style={styles.returnRow}>
          <View style={styles.rowBetween}>
            <AppText variant="bodyMedium" color={colors.ink} style={styles.flex}>
              {h.status === 'holding' ? 'Holding for the customer' : 'Hold closed'}
            </AppText>
            <StatusChip
              label={humanize(h.status)}
              tone={h.status === 'holding' ? 'warning' : 'neutral'}
              style={styles.chipCenter}
            />
          </View>
          <AppText variant="meta" color={colors.meta}>
            {h.status === 'holding' ? 'Hold ends' : 'Hold ended'} {formatDateTime(h.holdingWindowExpiresAt)}
            {h.disposition ? ` · ${humanize(h.disposition)}` : ''}
          </AppText>
        </View>
      ))}
    </Panel>
  );
}

function RefundsPanel({
  refunds,
  cashReturnId,
  onOpenReturn,
}: {
  refunds: OrderRefund[];
  /** A return of this order to open for the cash hand-over (when permitted). */
  cashReturnId?: string;
  onOpenReturn: (returnId: string) => void;
}) {
  return (
    <Panel title="Refunds">
      {refunds.map((r) => {
        const cashDue = (r.disbursements ?? []).find((d) => d.destination === 'cash' && d.status === 'pending');
        return (
          <View key={r.id} style={styles.returnRow}>
            <View style={styles.rowBetween}>
              <AppText variant="bodyMedium" color={colors.ink}>
                {formatPaise(r.totalRefundPaise)}
              </AppText>
              <StatusChip
                label={humanize(r.status)}
                tone={r.status === 'succeeded' ? 'success' : r.status === 'failed' ? 'danger' : 'warning'}
                style={styles.chipCenter}
              />
            </View>
            {(r.disbursements ?? []).map((d) => (
              <View key={d.id} style={styles.rowBetween}>
                <AppText variant="meta" color={colors.meta} style={styles.flex}>
                  {REFUND_DEST[d.destination] ?? humanize(d.destination)} · {humanize(d.status)}
                </AppText>
                <AppText variant="meta" color={colors.ink}>
                  {formatPaise(d.amountPaise)}
                </AppText>
              </View>
            ))}
            {cashDue ? (
              <Banner
                tone="warning"
                title={`Hand ${formatPaise(cashDue.amountPaise)} in cash to the customer`}
                message="Cash-on-delivery refund — you are repaid in your next payout."
                actionLabel={cashReturnId ? 'Open the return to record it' : undefined}
                onAction={cashReturnId ? () => onOpenReturn(cashReturnId) : undefined}
              />
            ) : null}
          </View>
        );
      })}
    </Panel>
  );
}

function DisputeRow({ dispute, onPress }: { dispute: OrderDispute; onPress?: () => void }) {
  const meta = issueStatusMeta(dispute.status);
  const body = (
    <>
      <View style={styles.rowBetween}>
        <StatusChip label={meta.label} tone={meta.tone} style={styles.chipCenter} />
        {dispute.heldAmountPaise ? (
          <StatusChip
            label={`Held ${formatPaise(dispute.heldAmountPaise)}`}
            tone="warning"
            style={styles.chipCenter}
          />
        ) : null}
        <View style={styles.flex} />
        <AppText variant="meta" color={colors.meta}>
          {timeAgo(dispute.createdAt)}
        </AppText>
        {onPress ? <Icon name="chevron-forward" size={16} color={colors.meta} /> : null}
      </View>
      <AppText variant="bodyMedium" color={colors.ink} numberOfLines={2}>
        {dispute.subject}
      </AppText>
      <AppText variant="meta" color={colors.meta}>
        Opened by {ACTOR_LABEL[dispute.openedByActorType] ?? humanize(dispute.openedByActorType)}
        {dispute.returnId ? ' · on a return' : ''}
      </AppText>
      {dispute.decision ? (
        <AppText variant="meta" color={colors.ink}>
          Decision: {issueDecisionLabel(dispute.decision)}
          {dispute.decisionNote ? ` — ${dispute.decisionNote}` : ''}
        </AppText>
      ) : null}
    </>
  );
  return onPress ? (
    <PressableScale onPress={onPress} toScale={0.98} haptic={false} style={styles.returnRow}>
      {body}
    </PressableScale>
  ) : (
    <View style={styles.returnRow}>{body}</View>
  );
}

function Timeline({ order }: { order: OrderDetail }) {
  const steps = [...(order.transitions ?? [])].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
  const attempts = order.deliveryAttempts ?? [];
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
      {attempts.length ? <DeliveryAttempts attempts={attempts} /> : null}
    </Panel>
  );
}

function DeliveryAttempts({ attempts }: { attempts: DeliveryAttempt[] }) {
  return (
    <>
      <Divider />
      <AppText variant="sectionLabel" color={colors.meta}>
        Delivery attempts
      </AppText>
      {attempts.map((a) => (
        <View key={a.id} style={styles.returnRow}>
          <View style={styles.rowBetween}>
            <AppText variant="bodyMedium" color={colors.ink} style={styles.flex}>
              #{a.attemptNumber} · {humanize(a.outcome)}
            </AppText>
            <AppText variant="meta" color={colors.meta}>
              {timeAgo(a.attemptedAt)}
            </AppText>
          </View>
          {a.notes ? (
            <AppText variant="meta" color={colors.ink}>
              {a.notes}
            </AppText>
          ) : null}
          <EvidenceStrip urls={[...(a.proofPhotos ?? []), ...(a.signatureUrl ? [a.signatureUrl] : [])]} />
        </View>
      ))}
    </>
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
  outcomeChip: { marginTop: 2 },
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
