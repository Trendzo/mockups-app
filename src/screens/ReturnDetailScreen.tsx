import React, { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  Banner,
  DetailRow,
  Icon,
  KeyboardStickyView,
  ListRow,
  Panel,
  PrimaryButton,
  Screen,
  ScreenHeader,
  StatusChip,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useOrderAction } from '../api/ordersHooks';
import { useMarkReturnReceived, usePayCashRefund, useReturn, useReturnDecision } from '../api/returnsHooks';
import { errorCode, errorMessage } from '../api/request';
import {
  AGENT_DISPOSITION_LABEL,
  RETURN_KIND_LABEL,
  RETURN_REASON_LABEL,
  ReturnDetail,
  goodsAtStore,
  returnDecisionMeta,
} from '../types/returns';
import { countdown, useNow } from '../utils/orders';
import { formatPaise } from '../utils/money';
import { formatDateTime, humanize, shortRef, timeAgo } from '../utils/format';
import { usePermissions } from '../utils/usePermission';
import { usePullRefresh } from '../utils/usePullRefresh';
import { ReasonSheet } from './orders/OrderActionSheets';
import { CashRefundSheet } from './orders/CashRefundSheet';
import { EvidenceStrip } from './orders/EvidenceStrip';
import { colors, spacing } from '../theme/theme';

type Sheet = null | 'decline' | 'cash';

/** One return: the verification clock, accept / decline, goods-received, and COD cash owed. */
export function ReturnDetailScreen({ navigation, route }: ScreenProps<'ReturnDetail'>) {
  const { id } = route.params;
  const toast = useToast();
  const { can } = usePermissions();
  const q = useReturn(id);
  const pull = usePullRefresh(q.refetch);
  const ret = q.data;
  const orderId = ret?.orderItem.orderId ?? null;

  const decide = useReturnDecision(id, orderId);
  const markReceived = useMarkReturnReceived(id, orderId);
  const payCash = usePayCashRefund(id, orderId);
  const orderAction = useOrderAction();
  const [sheet, setSheet] = useState<Sheet>(null);

  if (!ret) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader overline="Return" title={shortRef(id)} onBack={() => navigation.goBack()} />
        {q.isError ? (
          <Banner
            tone="danger"
            title="Couldn't load this return"
            message={errorMessage(q.error)}
            actionLabel="Retry"
            onAction={() => q.refetch()}
            style={styles.gapTop}
          />
        ) : (
          <ActivityIndicator color={colors.ink} style={styles.loader} />
        )}
      </Screen>
    );
  }

  const meta = returnDecisionMeta(ret.storeDecision);
  const pending = ret.storeDecision === 'pending';
  const door = ret.kind === 'door_return';
  const atStore = goodsAtStore(ret);
  const canDecide = can('returns.accept');
  const busy = decide.isPending || markReceived.isPending || orderAction.isPending;
  const due = ret.cashRefundDue ?? null;

  const accept = () =>
    Alert.alert('Accept the return?', 'The customer is refunded for the returned item.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: () =>
          decide.mutate(
            { decision: 'accept' },
            {
              onSuccess: () => toast.show('Return accepted — refund issued', 'success'),
              onError: (e) => toast.show(errorMessage(e, 'Could not accept the return'), 'error'),
            },
          ),
      },
    ]);

  const decline = (reason: string, photos: string[]) =>
    decide.mutate(
      { decision: 'decline', reasonNote: reason, photos },
      {
        onSuccess: () => {
          setSheet(null);
          toast.show('Return declined — Trendzo will review the dispute', 'success');
        },
        onError: (e) => toast.show(errorMessage(e, 'Could not decline the return'), 'error'),
      },
    );

  /** Standard return: the parcel is here — starts the verification window. */
  const receiveStandard = () =>
    markReceived.mutate(undefined, {
      onSuccess: () => toast.show('Marked received — the verification window has started', 'success'),
      onError: (e) => toast.show(errorMessage(e, 'Could not mark it received'), 'error'),
    });

  /** Door return: goods are confirmed back on the ORDER (refunds the door return on arrival). */
  const receiveDoor = () =>
    Alert.alert('Goods received?', 'Confirm the returned items are back at your store.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Received',
        onPress: () =>
          orderAction.mutate(
            { id: ret.orderItem.orderId, action: 'confirm-return-received' },
            {
              onSuccess: () => toast.show('Return received at store', 'success'),
              onError: (e) => toast.show(errorMessage(e, 'Could not confirm receipt'), 'error'),
            },
          ),
      },
    ]);

  const payCashNow = (note: string) => {
    if (!due) return;
    payCash.mutate(
      { due, note },
      {
        onSuccess: () => {
          setSheet(null);
          toast.show(`${formatPaise(due.amountPaise)} recorded as handed over`, 'success');
        },
        onError: (e) => {
          // A replay is a 409: someone (or an earlier tap) already recorded it.
          if (errorCode(e) === 'disbursement_already_terminal') {
            setSheet(null);
            toast.show('This refund was already paid', 'info');
            return;
          }
          toast.show(errorMessage(e, 'Could not record the cash payment'), 'error');
        },
      },
    );
  };

  // Which decision controls to show while pending.
  const needsReceipt = pending && !atStore;
  const showDecision = pending && canDecide;

  return (
    <Screen edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={colors.ink} />}
      >
        <ScreenHeader overline="Return" title={ret.orderItem.listingNameSnap} onBack={() => navigation.goBack()} />

        <Panel>
          <View style={styles.chipRow}>
            <StatusChip label={RETURN_KIND_LABEL[ret.kind] ?? humanize(ret.kind)} tone="pending" style={styles.chip} />
            <StatusChip label={meta.label} tone={meta.tone} style={styles.chip} />
            {ret.agentDisposition ? (
              <StatusChip
                label={`Agent: ${AGENT_DISPOSITION_LABEL[ret.agentDisposition] ?? humanize(ret.agentDisposition)}`}
                tone={ret.agentDisposition === 'refused' ? 'danger' : ret.agentDisposition === 'returned' ? 'warning' : 'neutral'}
                style={styles.chip}
              />
            ) : null}
          </View>
          <AppText variant="meta" color={colors.meta}>
            Opened {formatDateTime(ret.openedAt)} · {timeAgo(ret.openedAt)}
          </AppText>
        </Panel>

        {pending && ret.verificationWindowExpiresAt ? <VerificationClock deadline={ret.verificationWindowExpiresAt} /> : null}
        {needsReceipt ? (
          <Banner
            tone="warning"
            title="Goods are not at your store yet"
            message={
              door
                ? 'Accepting needs the goods back first. Confirm receipt when the parcel arrives — the door return is then refunded automatically.'
                : 'Accepting needs the goods back first. Mark it received when the parcel reaches you — that starts the verification window.'
            }
          />
        ) : null}

        {due ? (
          <Panel style={styles.cashPanel}>
            <View style={styles.iconLine}>
              <Icon name="cash-outline" size={20} color="#B8860B" />
              <AppText variant="bodyMedium" color={colors.ink} style={styles.flex}>
                Hand {formatPaise(due.amountPaise)} in cash to the customer
              </AppText>
            </View>
            <AppText variant="meta" color={colors.meta}>
              This was a cash-on-delivery order, so the refund is paid in cash. You are repaid in your next payout — the
              amount is credited back to your settlement.
            </AppText>
            {canDecide ? (
              <PrimaryButton
                label={`I handed over ${formatPaise(due.amountPaise)}`}
                tone="ink"
                onPress={() => setSheet('cash')}
              />
            ) : (
              <AppText variant="meta" color={colors.meta}>
                Ask someone with returns access to record the hand-over.
              </AppText>
            )}
          </Panel>
        ) : null}

        <Panel title="Item">
          <DetailRow label="Product" value={ret.orderItem.listingNameSnap} />
          {ret.orderItem.attributesLabelSnap ? <DetailRow label="Variant" value={ret.orderItem.attributesLabelSnap} /> : null}
          {ret.orderItem.qty ? <DetailRow label="Quantity" value={String(ret.orderItem.qty)} /> : null}
          {ret.orderItem.order.consumerNameSnap ? (
            <DetailRow label="Customer" value={ret.orderItem.order.consumerNameSnap} />
          ) : null}
          {ret.storeDecidedAt ? <DetailRow label="Decided" value={formatDateTime(ret.storeDecidedAt)} /> : null}
          {ret.goodsReceivedAt ? <DetailRow label="Goods received" value={formatDateTime(ret.goodsReceivedAt)} /> : null}
        </Panel>

        {ret.reasonText || ret.reasonCategory ? (
          <Panel title="Reason">
            {ret.reasonCategory ? (
              <AppText variant="bodyMedium" color={colors.ink}>
                {RETURN_REASON_LABEL[ret.reasonCategory] ?? humanize(ret.reasonCategory)}
              </AppText>
            ) : null}
            {ret.reasonText ? (
              <AppText variant="body" color={colors.ink}>
                {ret.reasonText}
              </AppText>
            ) : null}
          </Panel>
        ) : null}

        {ret.consumerPhotos?.length || ret.photos?.length || ret.storeRejectPhotos?.length ? (
          <Panel title="Photos">
            <EvidenceStrip title="Customer photos" urls={ret.consumerPhotos} />
            <EvidenceStrip title="Agent / counter photos" urls={ret.photos} />
            <EvidenceStrip title="Your rejection evidence" urls={ret.storeRejectPhotos} />
          </Panel>
        ) : null}

        {ret.heldItems?.length ? <HeldItems ret={ret} /> : null}

        {can('orders.view') ? (
          <ListRow
            icon="receipt-outline"
            label={`Order ${shortRef(ret.orderItem.orderId)}`}
            hint="Open the order"
            onPress={() => navigation.navigate('OrderDetail', { id: ret.orderItem.orderId })}
          />
        ) : null}
      </ScrollView>

      {showDecision ? (
        <KeyboardStickyView style={styles.footer} minBottom={spacing.sm}>
          {needsReceipt ? (
            door ? (
              can('orders.mark_delivered') ? (
                <PrimaryButton label="Confirm goods received" tone="accent" loading={orderAction.isPending} disabled={busy} onPress={receiveDoor} />
              ) : (
                <AppText variant="meta" color={colors.meta} style={styles.center}>
                  Waiting for the goods to reach your store.
                </AppText>
              )
            ) : (
              <PrimaryButton label="Mark goods received" tone="accent" loading={markReceived.isPending} disabled={busy} onPress={receiveStandard} />
            )
          ) : (
            <PrimaryButton label="Accept return (refund customer)" tone="accent" loading={decide.isPending && decide.variables?.decision === 'accept'} disabled={busy} onPress={accept} />
          )}
          <PrimaryButton label="Decline & dispute" tone="ghost" disabled={busy} onPress={() => setSheet('decline')} />
        </KeyboardStickyView>
      ) : null}

      <ReasonSheet
        visible={sheet === 'decline'}
        title="Decline the return"
        message="This opens a dispute and holds the refund until Trendzo reviews it. Add photos of the item's condition."
        placeholder="e.g. Item used, tags removed"
        submitLabel="Decline & dispute"
        danger
        busy={decide.isPending}
        photosFolder={`returns/${ret.id}`}
        onSubmit={decline}
        onClose={() => setSheet(null)}
      />
      {due ? (
        <CashRefundSheet
          visible={sheet === 'cash'}
          due={due}
          busy={payCash.isPending}
          onSubmit={payCashNow}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </Screen>
  );
}

/** Live countdown to the verification deadline; after it the sweep auto-accepts and refunds. */
function VerificationClock({ deadline }: { deadline: string }) {
  const now = useNow(1000);
  const left = countdown(deadline, now);
  const urgent = !left || new Date(deadline).getTime() - now < 3_600_000;
  return (
    <Banner
      tone={urgent ? 'danger' : 'neutral'}
      title={left ? `Verification window closes in ${left}` : 'Verification window expired'}
      message={
        left
          ? `Decide by ${formatDateTime(deadline)} — after that the return is accepted and refunded automatically.`
          : 'The return is accepted and refunded automatically once the sweep runs.'
      }
    />
  );
}

function HeldItems({ ret }: { ret: ReturnDetail }) {
  return (
    <Panel title="Items held">
      {(ret.heldItems ?? []).map((h) => (
        <View key={h.id} style={styles.heldRow}>
          <StatusChip label={humanize(h.status)} tone={h.status === 'holding' ? 'warning' : 'neutral'} style={styles.chip} />
          <AppText variant="meta" color={colors.meta} style={styles.flex}>
            {h.status === 'holding' ? 'Hold ends' : 'Hold ended'} {formatDateTime(h.holdingWindowExpiresAt)}
            {h.disposition ? ` · ${humanize(h.disposition)}` : ''}
          </AppText>
        </View>
      ))}
    </Panel>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl, gap: spacing.md },
  loader: { marginTop: spacing.xl },
  gapTop: { marginTop: spacing.md },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  chip: { alignSelf: 'center' },
  iconLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cashPanel: { borderWidth: 1.5, borderColor: '#B8860B' },
  heldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  footer: {
    paddingTop: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
