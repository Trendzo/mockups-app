import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  AppText,
  Banner,
  CalendarMonth,
  Divider,
  EmptyState,
  Field,
  Icon,
  Panel,
  PressableScale,
  PrimaryButton,
  Screen,
  ScreenHeader,
  SectionHeader,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { errorMessage } from '../api/request';
import { useAddHoliday, useHolidays, useRemoveHoliday } from '../api/storeSettingsHooks';
import { useStoreGate } from '../navigation/useStoreGate';
import { HolidayClosure } from '../types/store';
import { usePermissions } from '../utils/usePermission';
import { formatYmd, todayYmd } from '../utils/format';
import { colors, spacing } from '../theme/theme';

const READ_ONLY_NOTE = 'Only the owner or a manager can change this.';

/**
 * Holiday calendar: one-off closed days (festivals, stock-takes) on which new
 * orders are blocked. Each closed day is its own record, removed by its date.
 */
export function HolidayCalendarScreen({ navigation }: ScreenProps<'HolidayCalendar'>) {
  const toast = useToast();
  const { can } = usePermissions();
  const gate = useStoreGate();
  // store.holidays_edit, and not on a read-only (terminated / closed) account.
  const canManage = can('store.holidays_edit') && !gate.readOnly;
  const holidaysQ = useHolidays();
  const addHoliday = useAddHoliday();
  const removeHoliday = useRemoveHoliday();

  const [picked, setPicked] = useState<string[]>([]);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const today = todayYmd();
  // Oldest first; keep just the day in case the server sends a full timestamp.
  const closures = useMemo(
    () =>
      (holidaysQ.data ?? [])
        .map((c) => ({ ...c, date: c.date.slice(0, 10) }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [holidaysQ.data],
  );
  const closedDates = useMemo(() => closures.map((c) => c.date), [closures]);
  const upcoming = closures.filter((c) => c.date >= today);
  const past = closures.filter((c) => c.date < today).reverse();
  const removingDate = removeHoliday.isPending ? removeHoliday.variables : null;
  const count = picked.length;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await holidaysQ.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const reopenDay = (date: string) =>
    removeHoliday.mutate(date, {
      onSuccess: () => toast.show('Holiday removed', 'success'),
      onError: (e) => toast.show(errorMessage(e, "Couldn't remove the holiday"), 'error'),
    });

  const confirmRemove = (closure: HolidayClosure) =>
    Alert.alert('Remove this closure?', `${formatYmd(closure.date)} will be open for orders again.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => reopenDay(closure.date) },
    ]);

  const onDayPress = (ymd: string) => {
    // The save loop rewrites the selection when it finishes — don't let taps race it.
    if (saving) return;
    const closure = closures.find((c) => c.date === ymd);
    if (closure) {
      // Already closed: offer to reopen rather than closing the same day twice.
      Alert.alert(
        formatYmd(ymd),
        closure.reason ? `Closed · ${closure.reason}` : 'Your store is closed on this day.',
        [
          { text: 'Keep closed', style: 'cancel' },
          { text: 'Reopen this day', style: 'destructive', onPress: () => reopenDay(ymd) },
        ],
      );
      return;
    }
    setPicked((list) => (list.includes(ymd) ? list.filter((d) => d !== ymd) : [...list, ymd]));
  };

  const saveDays = async () => {
    const closed = new Set(closedDates);
    const dates = picked.filter((d) => !closed.has(d)).sort();
    if (!dates.length || saving) return;
    setSaving(true);
    // One day per call. Keep going past a failure so one bad date doesn't sink the rest.
    const failed: string[] = [];
    let lastError: unknown;
    for (const date of dates) {
      try {
        await addHoliday.mutateAsync({ date, reason: label });
      } catch (e) {
        failed.push(date);
        lastError = e;
      }
    }
    setSaving(false);
    setPicked(failed); // leave the failures selected so a retry is one tap
    const saved = dates.length - failed.length;
    if (!failed.length) {
      setLabel('');
      toast.show(saved === 1 ? 'Holiday saved' : `${saved} holidays saved`, 'success');
      return;
    }
    Alert.alert(
      saved ? `${saved} of ${dates.length} days saved` : "Couldn't save these days",
      `Still open:\n${failed.map((d) => formatYmd(d)).join('\n')}\n\n${errorMessage(
        lastError,
        'Please try again.',
      )}`,
    );
  };

  return (
    <Screen edges={['top']}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />
        }
      >
        <ScreenHeader
          overline="Store operations"
          title="Holiday calendar"
          onBack={() => navigation.goBack()}
        />
        <AppText variant="body" color={colors.meta}>
          Mark days your store is closed. New orders are blocked on these dates.
        </AppText>

        {holidaysQ.isLoading ? (
          <ActivityIndicator color={colors.ink} style={styles.loader} />
        ) : holidaysQ.isError && !holidaysQ.data ? (
          <Banner
            tone="danger"
            title="Couldn't load your holidays"
            message={errorMessage(holidaysQ.error, 'Check your connection and try again.')}
            actionLabel="Retry"
            onAction={() => holidaysQ.refetch()}
          />
        ) : (
          <>
            {canManage ? (
              <Panel>
                <CalendarMonth
                  selected={picked}
                  marked={closedDates}
                  minYmd={today}
                  onPress={onDayPress}
                />
                <View style={styles.legend}>
                  <LegendItem kind="picked" label="Selected" />
                  <LegendItem kind="closed" label="Closed" />
                  {count ? (
                    <PressableScale
                      onPress={() => setPicked([])}
                      haptic={false}
                      style={styles.clear}
                    >
                      <AppText variant="meta" color={colors.ink}>
                        Clear
                      </AppText>
                    </PressableScale>
                  ) : null}
                </View>
                <Divider />
                <Field
                  label="Label (optional)"
                  boxed
                  value={label}
                  onChangeText={setLabel}
                  placeholder="e.g. Diwali — closed all day"
                  maxLength={80}
                />
                <PrimaryButton
                  label={
                    count ? `Close store on ${count} day${count === 1 ? '' : 's'}` : 'Pick days to close'
                  }
                  tone="accent"
                  disabled={!count}
                  loading={saving}
                  onPress={saveDays}
                />
              </Panel>
            ) : (
              <ReadOnlyNote />
            )}

            <SectionHeader label="Upcoming closures" style={styles.sectionGap} />
            {upcoming.length ? (
              <Panel>
                {upcoming.map((c, i) => (
                  <React.Fragment key={c.date}>
                    {i > 0 ? <Divider /> : null}
                    <ClosureRow
                      closure={c}
                      isToday={c.date === today}
                      removing={removingDate === c.date}
                      disabled={removeHoliday.isPending}
                      onRemove={canManage ? () => confirmRemove(c) : undefined}
                    />
                  </React.Fragment>
                ))}
              </Panel>
            ) : (
              <EmptyState
                icon="calendar-outline"
                title="No upcoming closures"
                message={
                  canManage
                    ? 'Tap dates on the calendar to close for a festival or a day off.'
                    : undefined
                }
              />
            )}

            {past.length ? (
              <>
                <PressableScale
                  onPress={() => setShowPast((v) => !v)}
                  haptic={false}
                  style={styles.pastHead}
                >
                  <AppText variant="sectionLabel" color={colors.meta} style={styles.flex}>
                    Past closures · {past.length}
                  </AppText>
                  <Icon
                    name={showPast ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.meta}
                  />
                </PressableScale>
                {showPast ? (
                  <Panel>
                    {past.map((c, i) => (
                      <React.Fragment key={c.date}>
                        {i > 0 ? <Divider /> : null}
                        <ClosureRow closure={c} />
                      </React.Fragment>
                    ))}
                  </Panel>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function ClosureRow({
  closure,
  isToday,
  removing,
  disabled,
  onRemove,
}: {
  closure: HolidayClosure;
  isToday?: boolean;
  removing?: boolean;
  disabled?: boolean;
  onRemove?: () => void;
}) {
  return (
    <View style={styles.closureRow}>
      <View style={styles.flex}>
        <AppText variant="bodyMedium" color={colors.ink}>
          {isToday ? `Today · ${formatYmd(closure.date)}` : formatYmd(closure.date)}
        </AppText>
        {closure.reason ? (
          <AppText variant="meta" color={colors.meta}>
            {closure.reason}
          </AppText>
        ) : null}
      </View>
      {removing ? (
        <ActivityIndicator color={colors.ink} />
      ) : onRemove ? (
        <PressableScale
          onPress={onRemove}
          disabled={disabled}
          haptic={false}
          style={styles.removeBtn}
        >
          <AppText variant="meta" color={colors.danger}>
            Remove
          </AppText>
        </PressableScale>
      ) : null}
    </View>
  );
}

function LegendItem({ kind, label }: { kind: 'picked' | 'closed'; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, kind === 'picked' ? styles.legendPicked : styles.legendClosed]} />
      <AppText variant="meta" color={colors.meta}>
        {label}
      </AppText>
    </View>
  );
}

function ReadOnlyNote() {
  return (
    <View style={styles.readOnly}>
      <Icon name="lock-closed-outline" size={14} color={colors.meta} style={styles.readOnlyIcon} />
      <AppText variant="meta" color={colors.meta} style={styles.flex}>
        {READ_ONLY_NOTE}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: spacing.xxl, gap: spacing.md },
  loader: { marginTop: spacing.xl },
  sectionGap: { marginTop: spacing.sm },
  readOnly: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  readOnlyIcon: { marginTop: 1 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 14, height: 14, borderRadius: 7 },
  legendPicked: { backgroundColor: colors.accent },
  legendClosed: { borderWidth: 1.5, borderColor: colors.danger },
  clear: { marginLeft: 'auto' },
  closureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  removeBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  pastHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
  },
});
