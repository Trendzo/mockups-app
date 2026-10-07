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
  BottomSheet,
  Divider,
  EmptyState,
  FilterChips,
  Icon,
  IconButton,
  Panel,
  PrimaryButton,
  QtyStepper,
  Screen,
  ScreenHeader,
  SheetSurface,
  StatusChip,
  TimeSelect,
  useToast,
} from '../components';
import type { FilterOption } from '../components';
import { ScreenProps } from '../navigation/types';
import { errorMessage } from '../api/request';
import {
  useAddPickupSlot,
  useDeletePickupSlot,
  usePickupSlots,
} from '../api/storeSettingsHooks';
import { useStoreGate } from '../navigation/useStoreGate';
import { PickupSlot, PickupSlotInput } from '../types/store';
import { usePermissions } from '../utils/usePermission';
import {
  WEEKDAYS,
  WEEKDAYS_LONG,
  formatHm,
  hmToMinutes,
  plural,
} from '../utils/format';
import { colors, radii, spacing } from '../theme/theme';

const READ_ONLY_NOTE = 'Only the owner or a manager can change this.';
const WARNING = '#B8860B';
/** Monday first on screen; the API counts 0 = Sunday … 6 = Saturday. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_CHIPS: FilterOption<string>[] = DAY_ORDER.map(d => ({
  value: String(d),
  label: WEEKDAYS[d],
}));
const NEW_SLOT: PickupSlotInput = {
  dayOfWeek: 1,
  startTime: '10:00',
  endTime: '18:00',
  capacity: 5,
};
const MIN_CAPACITY = 1;
const MAX_CAPACITY = 99;

const slotRange = (s: { startTime: string; endTime: string }) =>
  `${formatHm(s.startTime)} – ${formatHm(s.endTime)}`;

/**
 * Pickup slots: recurring weekly windows customers book for store pickup.
 * There's no edit endpoint — changing a slot means deleting it and adding a new one.
 */
export function PickupSlotsScreen({ navigation }: ScreenProps<'PickupSlots'>) {
  const toast = useToast();
  const { can } = usePermissions();
  const gate = useStoreGate();
  // store.edit_profile, and not on a read-only (terminated / closed) account.
  const canManage = can('store.edit_profile') && !gate.readOnly;
  const slotsQ = usePickupSlots();
  const addSlot = useAddPickupSlot();
  const deleteSlot = useDeletePickupSlot();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<PickupSlotInput>(NEW_SLOT);
  const [refreshing, setRefreshing] = useState(false);

  const slots = useMemo(() => slotsQ.data ?? [], [slotsQ.data]);
  const groups = useMemo(
    () =>
      DAY_ORDER.map(day => ({
        day,
        slots: slots
          .filter(s => s.dayOfWeek === day)
          .sort((a, b) => hmToMinutes(a.startTime) - hmToMinutes(b.startTime)),
      })).filter(g => g.slots.length > 0),
    [slots],
  );
  const deletingId = deleteSlot.isPending ? deleteSlot.variables : null;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await slotsQ.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const openAdd = (dayOfWeek = NEW_SLOT.dayOfWeek) => {
    setDraft({ ...NEW_SLOT, dayOfWeek });
    setSheetOpen(true);
  };

  const closeSheet = () => {
    if (!addSlot.isPending) setSheetOpen(false);
  };

  const confirmDelete = (slot: PickupSlot) =>
    Alert.alert(
      'Delete this slot?',
      `${WEEKDAYS_LONG[slot.dayOfWeek]}, ${slotRange(
        slot,
      )}. Customers can't book it after this.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteSlot.mutate(slot.id, {
              onSuccess: () => toast.show('Pickup slot deleted', 'success'),
              onError: e =>
                toast.show(
                  errorMessage(e, "Couldn't delete the slot"),
                  'error',
                ),
            }),
        },
      ],
    );

  // Sheet validation. Overlaps are only flagged, never blocked.
  const start = hmToMinutes(draft.startTime);
  const end = hmToMinutes(draft.endTime);
  const timeError =
    start < end ? null : 'End time must be after the start time';
  const capacityOk =
    Number.isInteger(draft.capacity) &&
    draft.capacity >= MIN_CAPACITY &&
    draft.capacity <= MAX_CAPACITY;
  const overlaps = timeError
    ? []
    : slots.filter(
        s =>
          s.dayOfWeek === draft.dayOfWeek &&
          hmToMinutes(s.startTime) < end &&
          start < hmToMinutes(s.endTime),
      );

  const save = () => {
    if (timeError || !capacityOk || addSlot.isPending) return;
    addSlot.mutate(draft, {
      onSuccess: () => {
        setSheetOpen(false);
        toast.show('Pickup slot added', 'success');
      },
      onError: e =>
        toast.show(errorMessage(e, "Couldn't add the slot"), 'error'),
    });
  };

  return (
    <Screen edges={['top']}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.ink}
          />
        }
      >
        <ScreenHeader
          overline="Store operations"
          title="Pickup slots"
          onBack={() => navigation.goBack()}
          right={
            canManage ? (
              <IconButton icon="add" tone="ink" onPress={() => openAdd()} />
            ) : undefined
          }
        />
        <AppText variant="body" color={colors.meta}>
          Customers who choose store pickup book one of these weekly windows.
          Capacity is how many pickups you can hand over in that window.
        </AppText>

        {slotsQ.isLoading ? (
          <ActivityIndicator color={colors.ink} style={styles.loader} />
        ) : slotsQ.isError && !slotsQ.data ? (
          <Banner
            tone="danger"
            title="Couldn't load pickup slots"
            message={errorMessage(
              slotsQ.error,
              'Check your connection and try again.',
            )}
            actionLabel="Retry"
            onAction={() => slotsQ.refetch()}
          />
        ) : groups.length === 0 ? (
          <EmptyState
            icon="bag-handle-outline"
            title="No pickup slots yet"
            message={
              canManage
                ? 'Add a weekly window so customers can collect orders from your store.'
                : READ_ONLY_NOTE
            }
            actionLabel={canManage ? 'Add slot' : undefined}
            onAction={canManage ? () => openAdd() : undefined}
          />
        ) : (
          <>
            {groups.map(g => (
              <Panel
                key={g.day}
                title={WEEKDAYS_LONG[g.day]}
                actionLabel={canManage ? 'Add' : undefined}
                onAction={canManage ? () => openAdd(g.day) : undefined}
              >
                {g.slots.map((slot, i) => (
                  <React.Fragment key={slot.id}>
                    {i > 0 ? <Divider /> : null}
                    <SlotRow
                      slot={slot}
                      deleting={deletingId === slot.id}
                      disabled={deleteSlot.isPending}
                      onDelete={
                        canManage ? () => confirmDelete(slot) : undefined
                      }
                    />
                  </React.Fragment>
                ))}
              </Panel>
            ))}
            {canManage ? (
              <PrimaryButton
                label="Add slot"
                tone="accent"
                icon={<Icon name="add" size={18} color={colors.accentInk} />}
                onPress={() => openAdd()}
              />
            ) : (
              <ReadOnlyNote />
            )}
          </>
        )}
      </ScrollView>

      <BottomSheet
        visible={sheetOpen}
        onClose={closeSheet}
        dismissable={!addSlot.isPending}
      >
        <SheetSurface style={styles.sheet}>
          <AppText
            variant="cardTitle"
            color={colors.ink}
            style={styles.sheetTitle}
          >
            Add pickup slot
          </AppText>

          {/* Messages live under the title: the sheet grows upward from the
              bottom, so anything appearing here leaves the day chips, times and
              stepper below exactly where the finger is. */}
          {timeError ? (
            <AppText variant="meta" color={colors.danger}>
              {timeError}
            </AppText>
          ) : null}
          {overlaps.length ? (
            <View style={styles.warn}>
              <Icon name="warning" size={16} color={WARNING} />
              <AppText variant="meta" color={WARNING} style={styles.flex}>
                Overlaps {overlaps.map(slotRange).join(', ')} on{' '}
                {WEEKDAYS_LONG[draft.dayOfWeek]}. You can still save it.
              </AppText>
            </View>
          ) : null}

          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.block}>
              <AppText variant="sectionLabel" color={colors.meta}>
                Day
              </AppText>
              <FilterChips
                options={DAY_CHIPS}
                value={String(draft.dayOfWeek)}
                onChange={v => setDraft(d => ({ ...d, dayOfWeek: Number(v) }))}
              />
            </View>

            <View style={styles.timeRow}>
              <TimeSelect
                label="Starts"
                value={draft.startTime}
                onChange={startTime => setDraft(d => ({ ...d, startTime }))}
              />
              <TimeSelect
                label="Ends"
                value={draft.endTime}
                onChange={endTime => setDraft(d => ({ ...d, endTime }))}
              />
            </View>

            <View style={styles.capacityRow}>
              <View style={styles.flex}>
                <AppText variant="bodyMedium" color={colors.ink}>
                  Capacity
                </AppText>
                <AppText variant="meta" color={colors.meta}>
                  Pickups you can hand over in this window
                </AppText>
              </View>
              <QtyStepper
                value={draft.capacity}
                min={MIN_CAPACITY}
                max={MAX_CAPACITY}
                onChange={capacity => setDraft(d => ({ ...d, capacity }))}
              />
            </View>
          </ScrollView>

          <AppText variant="meta" color={colors.meta}>
            To change a slot, delete it and add a new one.
          </AppText>
          <PrimaryButton
            label="Save slot"
            tone="accent"
            disabled={!!timeError || !capacityOk}
            loading={addSlot.isPending}
            onPress={save}
          />
          <PrimaryButton
            label="Cancel"
            tone="surface"
            disabled={addSlot.isPending}
            onPress={closeSheet}
          />
        </SheetSurface>
      </BottomSheet>
    </Screen>
  );
}

function SlotRow({
  slot,
  deleting,
  disabled,
  onDelete,
}: {
  slot: PickupSlot;
  deleting: boolean;
  disabled: boolean;
  onDelete?: () => void;
}) {
  return (
    <View style={styles.slotRow}>
      <View style={styles.flex}>
        <View style={styles.slotTitle}>
          <AppText variant="bodyMedium" color={colors.ink}>
            {slotRange(slot)}
          </AppText>
          {slot.isActive ? null : <StatusChip label="Paused" tone="warning" />}
        </View>
        <AppText variant="meta" color={colors.meta}>
          Up to {plural(slot.capacity, 'pickup')}
        </AppText>
      </View>
      {deleting ? (
        <ActivityIndicator color={colors.ink} />
      ) : onDelete ? (
        <IconButton
          icon="trash-outline"
          size={36}
          disabled={disabled}
          onPress={onDelete}
          style={styles.trash}
        />
      ) : null}
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
  readOnly: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  readOnlyIcon: { marginTop: 1 },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  slotTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  trash: { backgroundColor: colors.canvas },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
  sheetScroll: { flexShrink: 1 },
  sheetScrollContent: { gap: spacing.md },
  block: { gap: spacing.sm },
  timeRow: { flexDirection: 'row', gap: spacing.md },
  capacityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  warn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(200,140,0,0.12)',
  },
});
