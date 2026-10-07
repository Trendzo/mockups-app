import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  Banner,
  BottomSheet,
  DetailRow,
  Divider,
  Field,
  FilterChips,
  Icon,
  Panel,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SheetSurface,
  StatusChip,
  useToast,
} from '../components';
import type { FilterOption } from '../components';
import { ScreenProps } from '../navigation/types';
import { usePullRefresh } from '../utils/usePullRefresh';
import { usePermission } from '../utils/usePermission';
import { useCloseDay, useDaySummary, useOpenDay } from '../api/posHooks';
import { errorMessage } from '../api/request';
import { PosDaySummary, PosTenderMethod, TENDER_LABEL } from '../types/pos';
import { formatPaise, parseRupeesToPaise } from '../utils/money';
import { formatDateTime, formatYmd, fromYmd, plural, toYmd, todayYmd } from '../utils/format';
import { colors, radii, spacing } from '../theme/theme';

type Day = 'today' | 'yesterday';

const DAYS: FilterOption<Day>[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
];
const METHODS: PosTenderMethod[] = ['cash', 'card', 'upi'];
const WARNING = '#B8860B';

const money = (p: number) => (p < 0 ? `− ${formatPaise(-p)}` : formatPaise(p));

function shiftYmd(ymd: string, days: number): string {
  const d = fromYmd(ymd);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

/** 9 → "9a", 13 → "1p" (chart axis). */
const hourTick = (h: number) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
/** 18 → "6 PM". */
const hourName = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

/** Counted − expected cash, as the cashier reads it. */
function variance(diff: number): { label: string; color: string } {
  if (diff > 0) return { label: `Over by ${formatPaise(diff)}`, color: WARNING };
  if (diff < 0) return { label: `Short by ${formatPaise(-diff)}`, color: colors.danger };
  return { label: 'Matches', color: colors.success };
}

/** Expected cash for the session: the snapshot taken at close, else the live figure. */
const expectedCash = (s: PosDaySummary) => s.session?.expectedCashPaise ?? s.expectedCashPaise;

/** The counter's day: cash drawer open/close (Z-report) and the day's numbers. */
export function RegisterDayScreen({ navigation }: ScreenProps<'RegisterDay'>) {
  const toast = useToast();
  const [day, setDay] = useState<Day>('today');
  // Local (IST) calendar dates — never toISOString, which would shift to UTC.
  const today = todayYmd();
  const date = day === 'today' ? today : shiftYmd(today, -1);
  const sumQ = useDaySummary(date);
  const pull = usePullRefresh(sumQ.refetch);
  const summary = sumQ.data;
  const closeQ = useCloseDay();
  const [closeOpen, setCloseOpen] = useState(false);

  const closeDay = (countedPaise: number, note?: string) =>
    closeQ.mutate(
      { countedPaise, date, note },
      {
        onSuccess: () => {
          setCloseOpen(false);
          toast.show('Day closed', 'success');
        },
        onError: (e) => toast.show(errorMessage(e, "Couldn't close the day"), 'error'),
      },
    );

  return (
    <Screen edges={['top']}>
      <ScreenHeader overline="Billing counter" title="Day summary" onBack={() => navigation.goBack()} />
      <FilterChips options={DAYS} value={day} onChange={setDay} style={styles.chips} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={pull.refreshing}
            onRefresh={pull.onRefresh}
            tintColor={colors.ink}
          />
        }
      >
        <AppText variant="meta" color={colors.meta}>
          {formatYmd(date)}
        </AppText>

        {sumQ.isLoading ? (
          <ActivityIndicator color={colors.ink} style={styles.loader} />
        ) : sumQ.isError && !summary ? (
          <Banner
            tone="danger"
            title="Couldn't load the day summary"
            message={errorMessage(sumQ.error)}
            actionLabel="Retry"
            onAction={() => sumQ.refetch()}
          />
        ) : summary ? (
          <>
            <SessionCard
              key={date}
              summary={summary}
              date={date}
              canOpen={day === 'today'}
              onCloseDay={() => setCloseOpen(true)}
            />
            <KpiGrid s={summary} />
            <TenderPanel s={summary} />
            <DrawerPanel s={summary} />
            <HourlyPanel s={summary} />
            <TopProductsPanel s={summary} />
          </>
        ) : null}
      </ScrollView>

      <BottomSheet
        visible={closeOpen}
        onClose={() => !closeQ.isPending && setCloseOpen(false)}
        avoidKeyboard
        dismissable={!closeQ.isPending}
      >
        {summary ? (
          <CloseDaySheet
            expected={expectedCash(summary)}
            busy={closeQ.isPending}
            onSubmit={closeDay}
            onCancel={() => setCloseOpen(false)}
          />
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

// ---- Cash drawer session ----

function SessionCard({
  summary,
  date,
  canOpen,
  onCloseDay,
}: {
  summary: PosDaySummary;
  date: string;
  /** Only today's drawer can be opened. */
  canOpen: boolean;
  onCloseDay: () => void;
}) {
  const toast = useToast();
  const openQ = useOpenDay();
  // Opening / closing the drawer is a manager action (pos.manage); staff still see the numbers.
  const canManage = usePermission('pos.manage');
  const [floatText, setFloatText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const session = summary.session;

  if (!session) {
    if (!canOpen) {
      return (
        <Panel title="Cash drawer">
          <AppText variant="body" color={colors.meta}>
            The cash drawer wasn't opened on this day.
          </AppText>
        </Panel>
      );
    }
    const open = () => {
      const floatPaise = parseRupeesToPaise(floatText);
      if (floatPaise == null || floatPaise < 0) {
        setError('Enter the cash in the drawer (0 if it’s empty)');
        return;
      }
      openQ.mutate(
        { floatPaise, date },
        {
          onSuccess: () => toast.show('Day opened', 'success'),
          onError: (e) => toast.show(errorMessage(e, "Couldn't open the day"), 'error'),
        },
      );
    };
    return (
      <Panel>
        <View style={styles.rowBetween}>
          <AppText variant="bodyMedium" color={colors.ink}>
            Cash drawer not opened
          </AppText>
          <StatusChip label="Not opened" tone="neutral" />
        </View>
        <AppText variant="meta" color={colors.meta}>
          Count the cash in the drawer to start the day. Billing works without it, but opening the
          day lets you match the drawer at close.
        </AppText>
        {canManage ? (
          <>
            <Field
              label="Opening float"
              prefix="₹"
              value={floatText}
              onChangeText={(t) => {
                setFloatText(t);
                setError(null);
              }}
              placeholder="2000"
              keyboardType="numeric"
              error={error}
              boxed
            />
            <PrimaryButton label="Open day" tone="accent" loading={openQ.isPending} onPress={open} />
          </>
        ) : (
          <AppText variant="meta" color={colors.meta}>
            Only the owner or a manager can open the day.
          </AppText>
        )}
      </Panel>
    );
  }

  if (session.status === 'open') {
    return (
      <Panel>
        <View style={styles.rowBetween}>
          <AppText variant="bodyMedium" color={colors.ink}>
            Drawer open
          </AppText>
          <StatusChip label="Open" tone="success" />
        </View>
        <DetailRow label="Opening float" value={formatPaise(session.openingFloatPaise)} />
        <DetailRow label="Expected in drawer" value={formatPaise(expectedCash(summary))} strong />
        {canManage ? (
          <PrimaryButton label="Close day" tone="accent" onPress={onCloseDay} />
        ) : (
          <AppText variant="meta" color={colors.meta}>
            Only the owner or a manager can close the day.
          </AppText>
        )}
      </Panel>
    );
  }

  const counted = session.countedCashPaise;
  const diff =
    session.cashVariancePaise ??
    (counted != null && session.expectedCashPaise != null ? counted - session.expectedCashPaise : null);
  const v = diff != null ? variance(diff) : null;
  return (
    <Panel>
      <View style={styles.rowBetween}>
        <AppText variant="bodyMedium" color={colors.ink}>
          Day closed
        </AppText>
        <StatusChip label="Closed" tone="neutral" />
      </View>
      <DetailRow label="Opening float" value={formatPaise(session.openingFloatPaise)} />
      {session.expectedCashPaise != null ? (
        <DetailRow label="Expected cash" value={formatPaise(session.expectedCashPaise)} />
      ) : null}
      <DetailRow label="Counted cash" value={counted != null ? formatPaise(counted) : '—'} />
      {v ? (
        <View style={styles.rowBetween}>
          <AppText variant="body" color={colors.meta}>
            Variance
          </AppText>
          <AppText variant="bodyMedium" color={v.color}>
            {v.label}
          </AppText>
        </View>
      ) : null}
      <DetailRow label="Closed at" value={formatDateTime(session.closedAt)} tone="muted" />
    </Panel>
  );
}

/** Z-report: counted cash against expected, with a live over/short. Mounted fresh per open. */
function CloseDaySheet({
  expected,
  busy,
  onSubmit,
  onCancel,
}: {
  expected: number;
  busy: boolean;
  onSubmit: (countedPaise: number, note?: string) => void;
  onCancel: () => void;
}) {
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const countedPaise = parseRupeesToPaise(counted);
  const v = countedPaise != null ? variance(countedPaise - expected) : null;

  const submit = () => {
    if (countedPaise == null || countedPaise < 0) {
      setError('Enter the cash you counted');
      return;
    }
    onSubmit(countedPaise, note.trim() || undefined);
  };

  return (
    <SheetSurface style={styles.sheet}>
      <View style={styles.sheetHead}>
        <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
          Close day
        </AppText>
        <AppText variant="meta" color={colors.meta}>
          Count the cash in the drawer and enter the total.
        </AppText>
      </View>
      <View style={styles.expectedBox}>
        <DetailRow label="Expected cash" value={formatPaise(expected)} strong />
      </View>
      <Field
        label="Counted cash"
        prefix="₹"
        value={counted}
        onChangeText={(t) => {
          setCounted(t);
          setError(null);
        }}
        placeholder="0"
        keyboardType="numeric"
        error={error}
        boxed
      />
      {/* Reserved line: the sheet is bottom-anchored, so a line popping in
          would push the field up under the finger. */}
      <AppText variant="bodyMedium" color={v ? v.color : colors.meta}>
        {v ? v.label : 'Enter the cash in the drawer'}
      </AppText>
      <Field
        label="Note (optional)"
        value={note}
        onChangeText={setNote}
        placeholder="e.g. ₹200 paid out for supplies"
        multiline
        maxLength={300}
        style={styles.noteInput}
        boxed
      />
      <View style={styles.sheetButtons}>
        <PrimaryButton label="Cancel" tone="surface" style={styles.flex} disabled={busy} onPress={onCancel} />
        <PrimaryButton label="Close day" tone="accent" style={styles.flex} loading={busy} onPress={submit} />
      </View>
    </SheetSurface>
  );
}

// ---- Numbers ----

interface Tile {
  icon: string;
  label: string;
  value: string;
  hint?: string;
}

function KpiGrid({ s }: { s: PosDaySummary }) {
  const gst = [
    `CGST ${formatPaise(s.cgstPaise)}`,
    `SGST ${formatPaise(s.sgstPaise)}`,
    s.igstPaise > 0 ? `IGST ${formatPaise(s.igstPaise)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const tiles: Tile[] = [
    { icon: 'trending-up-outline', label: 'Net sales', value: money(s.netSalesPaise) },
    { icon: 'receipt-outline', label: 'Bills', value: String(s.saleCount) },
    { icon: 'calculator-outline', label: 'Avg bill', value: formatPaise(s.avgSalePaise) },
    { icon: 'shirt-outline', label: 'Items sold', value: String(s.itemCount) },
    { icon: 'pricetag-outline', label: 'Discounts', value: formatPaise(s.discountsPaise) },
    { icon: 'document-text-outline', label: 'GST collected', value: formatPaise(s.taxPaise), hint: gst },
    {
      icon: 'return-down-back-outline',
      label: 'Refunds',
      value: formatPaise(s.refundsPaise),
      hint: plural(s.returnCount, 'return'),
    },
    {
      icon: 'close-circle-outline',
      label: 'Voids',
      value: String(s.voidCount),
      hint: `${formatPaise(s.voidedPaise)} voided`,
    },
  ];
  const rows: Tile[][] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));
  return (
    <View style={styles.grid}>
      {rows.map((pair) => (
        <View key={pair[0].label} style={styles.gridRow}>
          {pair.map((t) => (
            <View key={t.label} style={styles.tile}>
              <Icon name={t.icon} size={18} color={colors.meta} />
              <AppText
                variant="cardTitle"
                color={colors.ink}
                style={styles.tileValue}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {t.value}
              </AppText>
              <AppText variant="meta" color={colors.meta}>
                {t.label}
              </AppText>
              {t.hint ? (
                <AppText variant="meta" color={colors.meta} numberOfLines={2}>
                  {t.hint}
                </AppText>
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function TenderPanel({ s }: { s: PosDaySummary }) {
  const nets = METHODS.map((m) => ({ method: m, net: s.byTenderNet?.[m]?.net ?? 0 }));
  const total = nets.reduce((sum, x) => sum + Math.max(0, x.net), 0);
  return (
    <Panel title="By payment method">
      {nets.map(({ method, net }) => {
        const pct = total > 0 ? Math.round((Math.max(0, net) / total) * 100) : 0;
        return (
          <View key={method} style={styles.tenderRow}>
            <View style={styles.rowBetween}>
              <AppText variant="body" color={colors.ink}>
                {TENDER_LABEL[method]}
              </AppText>
              <AppText variant="bodyMedium" color={colors.ink}>
                {money(net)}
              </AppText>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct}%` }]} />
            </View>
          </View>
        );
      })}
    </Panel>
  );
}

function DrawerPanel({ s }: { s: PosDaySummary }) {
  const session = s.session;
  return (
    <Panel title="Cash drawer">
      <DetailRow
        label="Opening float"
        value={session ? formatPaise(session.openingFloatPaise) : 'Not opened'}
        tone={session ? 'default' : 'muted'}
      />
      <DetailRow label="Cash sales" value={`+ ${formatPaise(s.cashCollectedPaise)}`} />
      <DetailRow
        label="Cash refunds"
        value={`− ${formatPaise(s.cashRefundedPaise)}`}
        tone={s.cashRefundedPaise > 0 ? 'negative' : 'muted'}
      />
      <Divider />
      <DetailRow label="Expected in drawer" value={formatPaise(expectedCash(s))} strong />
      <DetailRow label="Change given" value={formatPaise(s.changeGivenPaise)} tone="muted" />
    </Panel>
  );
}

function HourlyPanel({ s }: { s: PosDaySummary }) {
  const hours = (s.hourly ?? []).filter((h) => h.revenuePaise > 0).sort((a, b) => a.hour - b.hour);
  const peak = hours.reduce<(typeof hours)[number] | null>(
    (best, h) => (!best || h.revenuePaise > best.revenuePaise ? h : best),
    null,
  );
  const max = peak?.revenuePaise ?? 0;
  return (
    <Panel title="Sales by hour">
      {hours.length && peak ? (
        <>
          <View style={styles.chart}>
            {hours.map((h, i) => {
              const pct = Math.max(4, Math.round((h.revenuePaise / max) * 100));
              // Narrow columns can't fit every "11a": label every other one when crowded.
              const showTick = hours.length <= 10 || i % 2 === 0;
              return (
                <View key={h.hour} style={styles.barCol}>
                  <View style={styles.barArea}>
                    <View
                      style={[styles.bar, { height: `${pct}%` }, h === peak ? null : styles.barMuted]}
                    />
                  </View>
                  <AppText variant="meta" color={colors.meta} style={styles.barLabel} numberOfLines={1}>
                    {showTick ? hourTick(h.hour) : ' '}
                  </AppText>
                </View>
              );
            })}
          </View>
          <AppText variant="meta" color={colors.meta}>
            Busiest at {hourName(peak.hour)} · {formatPaise(peak.revenuePaise)}
          </AppText>
        </>
      ) : (
        <AppText variant="meta" color={colors.meta}>
          No sales yet.
        </AppText>
      )}
    </Panel>
  );
}

function TopProductsPanel({ s }: { s: PosDaySummary }) {
  const top = s.topProducts ?? [];
  return (
    <Panel title="Top products">
      {top.length ? (
        top.map((p, i) => (
          <View key={`${p.name}-${i}`} style={styles.topRow}>
            <View style={styles.rank}>
              <AppText variant="meta" color={colors.ink}>
                {i + 1}
              </AppText>
            </View>
            <View style={styles.flex}>
              <AppText variant="body" color={colors.ink} numberOfLines={1}>
                {p.name}
              </AppText>
              <AppText variant="meta" color={colors.meta}>
                {p.qty} sold
              </AppText>
            </View>
            <AppText variant="bodyMedium" color={colors.ink}>
              {formatPaise(p.revenuePaise)}
            </AppText>
          </View>
        ))
      ) : (
        <AppText variant="meta" color={colors.meta}>
          No sales yet.
        </AppText>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { marginTop: spacing.md },
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  loader: { marginTop: spacing.xl },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },

  grid: { gap: spacing.sm },
  gridRow: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: 2,
  },
  tileValue: { fontSize: 22, lineHeight: 28, marginTop: spacing.xs },

  tenderRow: { gap: spacing.xs, paddingVertical: 2 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.canvas, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },

  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: spacing.xs },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barArea: { height: 110, width: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '100%', maxWidth: 22, borderRadius: 4, backgroundColor: colors.accent },
  barMuted: { backgroundColor: colors.cardGrayGraphic },
  barLabel: { fontSize: 10, lineHeight: 13 },
  noteInput: { maxHeight: 100 },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 2 },
  rank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetHead: { gap: spacing.xs },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
  sheetButtons: { flexDirection: 'row', gap: spacing.sm },
  expectedBox: { backgroundColor: colors.canvas, borderRadius: radii.sm + 4, padding: spacing.md },
});
