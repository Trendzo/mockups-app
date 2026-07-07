import React, { useRef } from 'react';
import {
  NativeSyntheticEvent,
  StyleSheet,
  TextInput,
  TextInputKeyPressEventData,
  View,
} from 'react-native';
import { colors, radii, spacing } from '../theme/theme';

/**
 * Segmented OTP input — one box per digit. Digits only, capped at `length`.
 * Typing auto-advances; Backspace on an empty box steps back; pasting / SMS-autofill
 * of the full code fills every box; editing any single box replaces only that position.
 */
export function OtpInput({
  value,
  onChange,
  length = 4,
  autoFocus = false,
  disabled = false,
  onComplete,
}: {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  onComplete?: (code: string) => void;
}) {
  const refs = useRef<Array<TextInput | null>>([]);
  const digits = value.replace(/\D/g, '').slice(0, length).split('');
  const focus = (i: number) => refs.current[i]?.focus();

  function commit(next: string) {
    const clean = next.replace(/\D/g, '').slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    return clean;
  }

  function setAt(i: number, d: string) {
    const arr = value.replace(/\D/g, '').slice(0, length).split('');
    while (arr.length < length) arr.push('');
    arr[i] = d;
    return commit(arr.join(''));
  }

  function handleChange(i: number, raw: string) {
    const d = raw.replace(/\D/g, '');
    if (d.length > 1) {
      // Paste or SMS autofill of the whole code.
      const clean = commit(d);
      focus(Math.min(clean.length, length - 1));
      return;
    }
    if (!d) return;
    setAt(i, d);
    if (i < length - 1) focus(i + 1);
  }

  function handleKey(i: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (e.nativeEvent.key === 'Backspace') {
      if (digits[i]) {
        setAt(i, '');
      } else if (i > 0) {
        setAt(i - 1, '');
        focus(i - 1);
      }
    }
  }

  return (
    <View style={styles.row}>
      {Array.from({ length }, (_, i) => (
        <TextInput
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={digits[i] ?? ''}
          onChangeText={(t) => handleChange(i, t)}
          onKeyPress={(e) => handleKey(i, e)}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={length}
          editable={!disabled}
          autoFocus={autoFocus && i === 0}
          selectTextOnFocus
          style={[styles.box, digits[i] ? styles.boxFilled : null]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  box: {
    flex: 1,
    height: 56,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
  },
  boxFilled: { borderColor: colors.ink },
});
