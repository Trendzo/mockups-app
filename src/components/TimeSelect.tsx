import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText } from './AppText';
import { BottomSheet, SheetSurface } from './BottomSheet';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { formatHm, minutesToHm } from '../utils/format';
import { colors, radii, spacing } from '../theme/theme';

/**
 * Wall-clock time picker ("HH:MM", 24h) without a native picker dependency:
 * a field-style trigger that opens a sheet of fixed steps (30 min default).
 * In `compact` mode the label isn't drawn above the pill — it only titles the
 * sheet (e.g. "Monday opens").
 */
export function TimeSelect({
  label,
  value,
  onChange,
  stepMinutes = 30,
  compact,
}: {
  label?: string;
  value: string | null;
  onChange: (hm: string) => void;
  stepMinutes?: number;
  /** Small inline pill instead of a full-width field. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const maxH = useWindowDimensions().height * 0.5;
  const options = useMemo(() => {
    const out: string[] = [];
    for (let m = 0; m < 24 * 60; m += stepMinutes) out.push(minutesToHm(m));
    return out;
  }, [stepMinutes]);

  return (
    <View style={compact ? null : styles.wrap}>
      {label && !compact ? (
        <AppText variant="sectionLabel" color={colors.meta} style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <PressableScale
        onPress={() => setOpen(true)}
        toScale={0.97}
        haptic={false}
        style={compact ? styles.pill : styles.field}
      >
        <AppText
          variant="bodyMedium"
          color={value ? colors.ink : colors.inkMuted}
          style={styles.valueText}
          numberOfLines={1}
        >
          {value ? formatHm(value) : 'Select'}
        </AppText>
        {compact ? null : <Icon name="time-outline" size={18} color={colors.meta} />}
      </PressableScale>

      <BottomSheet visible={open} onClose={() => setOpen(false)}>
        <SheetSurface style={styles.sheet}>
          <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
            {label ?? 'Select time'}
          </AppText>
          <ScrollView style={{ maxHeight: maxH }} showsVerticalScrollIndicator={false}>
            <View style={styles.grid}>
              {options.map((hm) => {
                const active = hm === value;
                return (
                  <PressableScale
                    key={hm}
                    onPress={() => {
                      onChange(hm);
                      setOpen(false);
                    }}
                    toScale={0.95}
                    haptic={false}
                    style={[styles.cell, active ? styles.cellActive : null]}
                  >
                    <AppText variant="bodyMedium" color={active ? colors.accentInk : colors.ink}>
                      {formatHm(hm)}
                    </AppText>
                  </PressableScale>
                );
              })}
            </View>
          </ScrollView>
        </SheetSurface>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, flex: 1 },
  label: { marginLeft: 2 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radii.sm + 4,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  // Fixed width (fits "12:30 PM"), so rows of pills line up and don't shift
  // sideways when a time changes.
  pill: {
    minWidth: 104,
    alignItems: 'center',
    backgroundColor: colors.canvas,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  valueText: { fontVariant: ['tabular-nums'] },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm },
  cell: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.canvas,
  },
  cellActive: { backgroundColor: colors.accent },
});
