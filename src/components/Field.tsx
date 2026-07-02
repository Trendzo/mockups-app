import React from 'react';
import {
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { AppText } from './AppText';
import { colors, radii, spacing, type as typeScale } from '../theme/theme';

interface FieldProps extends TextInputProps {
  label: string;
  required?: boolean;
  error?: string | null;
  prefix?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

/** Labeled text input with inline error (used across Publish). */
export function Field({
  label,
  required,
  error,
  prefix,
  containerStyle,
  ...inputProps
}: FieldProps) {
  return (
    <View style={[styles.wrap, containerStyle]}>
      <AppText variant="sectionLabel" color={colors.meta} style={styles.label}>
        {label}
        {required ? ' *' : ''}
      </AppText>
      <View style={[styles.inputRow, error ? styles.inputError : null]}>
        {prefix ? (
          <AppText variant="bodyMedium" color={colors.ink} style={styles.prefix}>
            {prefix}
          </AppText>
        ) : null}
        <TextInput
          placeholderTextColor={colors.inkMuted}
          {...inputProps}
          style={[styles.input, inputProps.style]}
        />
      </View>
      {error ? (
        <AppText variant="meta" color={colors.danger} style={styles.errorText}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { marginLeft: 2 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.sm + 4,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: spacing.md,
  },
  inputError: { borderColor: colors.danger },
  prefix: { marginRight: 4 },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    color: colors.ink,
    fontFamily: typeScale.bodyMedium.fontFamily,
    fontSize: typeScale.bodyMedium.fontSize,
  },
  errorText: { marginLeft: 2 },
});
