import React, { useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { colors, radii, spacing } from '../theme/theme';

// Concrete cap for the option list (percentage max-heights don't resolve inside
// the sheet's auto-height animated wrapper).
const OPTIONS_MAX_HEIGHT = Dimensions.get('window').height * 0.5;

export interface SelectOption {
  label: string;
  /** Optional colour swatch shown next to the label (e.g. colour pickers). */
  swatch?: string;
  value: string;
}

interface SelectProps {
  label: string;
  options: SelectOption[];
  selected: string[]; // always an array (single = 0/1 items)
  onChange: (next: string[]) => void;
  multiple?: boolean;
  required?: boolean;
  placeholder?: string;
  clearable?: boolean; // single-select: offer a "None" row
  error?: string | null;
  loading?: boolean;
  /** Visible hairline border — for triggers sitting on a white card. */
  boxed?: boolean;
}

/** Dropdown selector (single or multi) rendered as a bottom sheet. */
export function Select({
  label,
  options,
  selected,
  onChange,
  multiple = false,
  required = false,
  placeholder = 'Select',
  clearable = false,
  error,
  loading = false,
  boxed = false,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const summary =
    selected.length === 0
      ? placeholder
      : options
          .filter((o) => selected.includes(o.value))
          .map((o) => o.label)
          .join(', ') || placeholder;

  const toggle = (value: string) => {
    if (multiple) {
      onChange(
        selected.includes(value)
          ? selected.filter((v) => v !== value)
          : [...selected, value],
      );
    } else {
      onChange([value]);
      setOpen(false);
    }
  };

  const empty = selected.length === 0;

  return (
    <View style={styles.wrap}>
      <AppText variant="sectionLabel" color={colors.meta} style={styles.label}>
        {label}
        {required ? ' *' : ''}
      </AppText>

      <PressableScale
        onPress={() => !loading && setOpen(true)}
        toScale={0.99}
        style={[
          styles.trigger,
          boxed ? styles.triggerBoxed : null,
          error ? styles.triggerError : null,
        ]}
      >
        <View style={styles.triggerLeft}>
          {/* Selected colour swatch (single-select options that carry one). */}
          {!multiple && !empty
            ? (() => {
                const sel = options.find((o) => selected.includes(o.value));
                return sel?.swatch ? (
                  <View style={[styles.dot, { backgroundColor: sel.swatch }]} />
                ) : null;
              })()
            : null}
          <AppText
            variant="bodyMedium"
            color={empty ? colors.inkMuted : colors.ink}
            numberOfLines={1}
            style={styles.triggerText}
          >
            {loading ? 'Loading…' : summary}
          </AppText>
        </View>
        <Icon name="chevron-down" size={18} color={colors.meta} />
      </PressableScale>

      {error ? (
        <AppText variant="meta" color={colors.danger} style={styles.error}>
          {error}
        </AppText>
      ) : null}

      <BottomSheet visible={open} onClose={() => setOpen(false)}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHeader}>
              <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
                {label}
              </AppText>
              <PressableScale onPress={() => setOpen(false)} toScale={0.9}>
                <Icon name="close" size={22} color={colors.ink} />
              </PressableScale>
            </View>

            <ScrollView
              style={styles.optionScroll}
              showsVerticalScrollIndicator={false}
            >
              {clearable && !multiple ? (
                <OptionRow
                  label="None"
                  selected={empty}
                  onPress={() => {
                    onChange([]);
                    setOpen(false);
                  }}
                />
              ) : null}
              {options.map((o) => (
                <OptionRow
                  key={o.value}
                  label={o.label}
                  swatch={o.swatch}
                  selected={selected.includes(o.value)}
                  onPress={() => toggle(o.value)}
                />
              ))}
            </ScrollView>

            {multiple ? (
              <PressableScale
                onPress={() => setOpen(false)}
                style={styles.doneBtn}
              >
                <AppText variant="button" color={colors.accentInk}>
                  Done
                </AppText>
              </PressableScale>
            ) : null}
        </View>
      </BottomSheet>
    </View>
  );
}

function OptionRow({
  label,
  swatch,
  selected,
  onPress,
}: {
  label: string;
  swatch?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} toScale={0.99} style={styles.optionRow}>
      <View style={styles.optionLeft}>
        {swatch ? <View style={[styles.dot, { backgroundColor: swatch }]} /> : null}
        <AppText
          variant="bodyMedium"
          color={selected ? colors.ink : colors.meta}
        >
          {label}
        </AppText>
      </View>
      {selected ? <Icon name="checkmark" size={20} color={colors.ink} /> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { marginLeft: 2 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radii.sm + 4,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  triggerBoxed: { borderColor: colors.hairline },
  triggerError: { borderColor: colors.danger },
  triggerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  optionLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  triggerText: { flex: 1, marginRight: spacing.sm },
  error: { marginLeft: 2 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
  optionScroll: { flexGrow: 0, maxHeight: OPTIONS_MAX_HEIGHT },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  doneBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
});
