import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { colors, radii, spacing, type as typeScale } from '../theme/theme';

export interface SelectOption {
  label: string;
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
}: SelectProps) {
  const [open, setOpen] = useState(false);

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
        style={[styles.trigger, error ? styles.triggerError : null]}
      >
        <AppText
          variant="bodyMedium"
          color={empty ? colors.inkMuted : colors.ink}
          numberOfLines={1}
          style={styles.triggerText}
        >
          {loading ? 'Loading…' : summary}
        </AppText>
        <Icon name="chevron-down" size={18} color={colors.meta} />
      </PressableScale>

      {error ? (
        <AppText variant="meta" color={colors.danger} style={styles.error}>
          {error}
        </AppText>
      ) : null}

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
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
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function OptionRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} toScale={0.99} style={styles.optionRow}>
      <AppText
        variant="bodyMedium"
        color={selected ? colors.ink : colors.meta}
      >
        {label}
      </AppText>
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
  triggerError: { borderColor: colors.danger },
  triggerText: { flex: 1, marginRight: spacing.sm },
  error: { marginLeft: 2 },
  backdrop: { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    maxHeight: '70%',
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
  optionScroll: { flexGrow: 0 },
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
