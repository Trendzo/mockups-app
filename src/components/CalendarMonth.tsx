import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { MONTHS_LONG, WEEKDAYS, toYmd } from '../utils/format';
import { colors, radii, spacing } from '../theme/theme';

/**
 * Month grid date picker (no native dependency). Dates are local "YYYY-MM-DD"
 * strings. `selected` are the retailer's current picks (black); `marked` are
 * dates that already mean something (e.g. existing closures — outlined).
 * Days before `minYmd` are disabled.
 */
export function CalendarMonth({
  selected,
  marked,
  minYmd,
  onPress,
}: {
  selected: string[];
  marked?: string[];
  minYmd?: string;
  onPress: (ymd: string) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const weeks = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const daysInMonth = new Date(
      cursor.getFullYear(),
      cursor.getMonth() + 1,
      0,
    ).getDate();
    const out: (string | null)[] = Array(first.getDay()).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      out.push(toYmd(new Date(cursor.getFullYear(), cursor.getMonth(), d)));
    }
    // Always 6 weeks, so paging months never changes the grid's height.
    while (out.length < 42) out.push(null);
    const weeks: (string | null)[][] = [];
    for (let i = 0; i < out.length; i += 7) weeks.push(out.slice(i, i + 7));
    return weeks;
  }, [cursor]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const markedSet = useMemo(() => new Set(marked ?? []), [marked]);
  const today = toYmd(new Date());
  const shift = (months: number) =>
    setCursor(c => new Date(c.getFullYear(), c.getMonth() + months, 1));

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <PressableScale
          onPress={() => shift(-1)}
          style={styles.nav}
          toScale={0.9}
        >
          <Icon name="chevron-back" size={18} color={colors.ink} />
        </PressableScale>
        <AppText variant="bodyMedium" color={colors.ink}>
          {MONTHS_LONG[cursor.getMonth()]} {cursor.getFullYear()}
        </AppText>
        <PressableScale
          onPress={() => shift(1)}
          style={styles.nav}
          toScale={0.9}
        >
          <Icon name="chevron-forward" size={18} color={colors.ink} />
        </PressableScale>
      </View>

      <View style={styles.week}>
        {WEEKDAYS.map(w => (
          <AppText
            key={w}
            variant="meta"
            color={colors.meta}
            style={styles.weekday}
          >
            {w.slice(0, 2)}
          </AppText>
        ))}
      </View>

      {/* One row per week (flex cells): percentage widths in a wrapping row
          rounded past 100% on some phones and wrapped to 6 columns. */}
      {weeks.map((week, w) => (
        <View key={`w${w}`} style={styles.week}>
          {week.map((ymd, i) => {
            if (!ymd) return <View key={`e${w}-${i}`} style={styles.cell} />;
            const disabled = !!minYmd && ymd < minYmd;
            const isSel = selectedSet.has(ymd);
            const isMarked = markedSet.has(ymd);
            return (
              <View key={ymd} style={styles.cell}>
                <PressableScale
                  onPress={() => onPress(ymd)}
                  disabled={disabled}
                  haptic={false}
                  toScale={0.9}
                  style={[
                    styles.day,
                    isMarked && !isSel ? styles.dayMarked : null,
                    isSel ? styles.daySelected : null,
                    ymd === today && !isSel ? styles.dayToday : null,
                  ]}
                >
                  <AppText
                    variant="bodyMedium"
                    color={
                      isSel
                        ? colors.accentInk
                        : disabled
                        ? colors.inkMuted
                        : colors.ink
                    }
                    style={styles.dayText}
                  >
                    {Number(ymd.slice(8, 10))}
                  </AppText>
                </PressableScale>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nav: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center' },
  cell: { flex: 1, aspectRatio: 1, padding: 3 },
  day: {
    flex: 1,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: { backgroundColor: colors.canvas },
  dayMarked: { borderWidth: 1.5, borderColor: colors.danger },
  daySelected: { backgroundColor: colors.accent },
  dayText: { fontSize: 14, lineHeight: 18 },
});
