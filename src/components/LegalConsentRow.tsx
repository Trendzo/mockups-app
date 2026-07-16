import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { PRIVACY_URL, TERMS_URL } from '../config/legal';
import { colors, radii, spacing } from '../theme/theme';

/**
 * Signup-form legal consent — one checkbox covering the Retailer T&C and the Privacy
 * Policy (each label opens the full public document). Rendered via the wizard's
 * `consentSlot` on the last step; the screen gates submit on `agreed` and sends
 * `acceptLegal: true`, which the backend pins to the current document versions.
 */
export function LegalConsentRow({
  agreed,
  onToggle,
}: {
  agreed: boolean;
  onToggle: () => void;
}) {
  return (
    <PressableScale onPress={onToggle} haptic={false} style={styles.row}>
      <View style={[styles.check, agreed && styles.checkOn]}>
        {agreed && <Icon name="checkmark" size={14} color={colors.accentInk} />}
      </View>
      <AppText variant="meta" color={colors.meta} style={styles.text}>
        I agree to the{' '}
        <AppText
          variant="meta"
          color={colors.ink}
          style={styles.link}
          onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
        >
          Terms &amp; Conditions
        </AppText>{' '}
        and the{' '}
        <AppText
          variant="meta"
          color={colors.ink}
          style={styles.link}
          onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}
        >
          Privacy Policy
        </AppText>
        .
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  text: { flex: 1 },
  link: { textDecorationLine: 'underline' },
});
