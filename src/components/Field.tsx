import React, { useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { colors, radii, spacing, type as typeScale } from '../theme/theme';

interface FieldProps extends TextInputProps {
  label: string;
  required?: boolean;
  error?: string | null;
  prefix?: string;
  containerStyle?: StyleProp<ViewStyle>;
  /** Visible hairline border — for inputs sitting on a white card. */
  boxed?: boolean;
}

/** Labeled text input with inline error (used across Publish). */
export function Field({
  label,
  required,
  error,
  prefix,
  containerStyle,
  boxed,
  secureTextEntry,
  ...inputProps
}: FieldProps) {
  // Password fields get a tap-to-reveal eye toggle everywhere.
  const isSecure = !!secureTextEntry;
  const [hidden, setHidden] = useState(true);
  // A non-editable field reads as visibly locked: grey fill, muted text, a lock
  // glyph — so it's clearly not editable without having to tap it.
  const locked = inputProps.editable === false;
  return (
    <View style={[styles.wrap, containerStyle]}>
      <AppText variant="sectionLabel" color={colors.meta} style={styles.label}>
        {label}
        {required ? ' *' : ''}
      </AppText>
      <View
        style={[
          styles.inputRow,
          boxed ? styles.inputBoxed : null,
          locked ? styles.inputLocked : null,
          error ? styles.inputError : null,
        ]}
      >
        {prefix ? (
          <AppText variant="bodyMedium" color={locked ? colors.meta : colors.ink} style={styles.prefix}>
            {prefix}
          </AppText>
        ) : null}
        <TextInput
          placeholderTextColor={colors.inkMuted}
          {...inputProps}
          secureTextEntry={isSecure && hidden}
          style={[styles.input, locked ? styles.inputLockedText : null, inputProps.style]}
        />
        {locked ? (
          <Icon name="lock-closed" size={18} color={colors.inkMuted} style={styles.lock} />
        ) : isSecure ? (
          <PressableScale
            haptic={false}
            hitSlop={10}
            onPress={() => setHidden((h) => !h)}
            style={styles.eye}
          >
            <Icon
              name={hidden ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color={colors.meta}
            />
          </PressableScale>
        ) : null}
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
  inputBoxed: { borderColor: colors.hairline },
  inputLocked: { backgroundColor: colors.canvas, borderColor: colors.hairline },
  inputLockedText: { color: colors.meta },
  prefix: { marginRight: 4 },
  eye: { paddingLeft: spacing.sm, paddingVertical: spacing.sm },
  lock: { paddingLeft: spacing.sm },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    color: colors.ink,
    fontFamily: typeScale.bodyMedium.fontFamily,
    fontSize: typeScale.bodyMedium.fontSize,
  },
  errorText: { marginLeft: 2 },
});
