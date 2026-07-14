import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppText, BackButton, PressableScale } from '../../components';
import { RootStackParamList } from '../../navigation/types';
import { colors, radii, spacing } from '../../theme/theme';

const TITLES = ['Basic information', 'Variants & pricing', 'Product details', 'Review & publish'];
const SHORT = ['Basics', 'Variants', 'Details', 'Review'];

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Shared wizard header: back control + a tappable 4-step bar (jump to any step
 * freely) + step title. Owns navigation so each step can jump without a prop.
 */
export function WizardHeader({
  step,
  onBack,
}: {
  step: 1 | 2 | 3 | 4;
  onBack: () => void;
}) {
  const nav = useNavigation<Nav>();
  const go = (i: number) => {
    switch (i) {
      case 1:
        nav.navigate('ProductWizardBasics');
        break;
      case 2:
        nav.navigate('ProductWizardVariants');
        break;
      case 3:
        nav.navigate('ProductWizardDetails');
        break;
      default:
        nav.navigate('ProductWizardReview');
    }
  };

  return (
    <View style={styles.wrap}>
      <BackButton onPress={onBack} />
      {/* Tappable step tabs — styled as buttons so it's clear you can switch. */}
      <View style={styles.tabs}>
        {([1, 2, 3, 4] as const).map((i) => {
          const current = i === step;
          return (
            <PressableScale
              key={i}
              onPress={() => go(i)}
              haptic={false}
              toScale={0.95}
              style={[styles.tab, current ? styles.tabOn : null]}
            >
              <AppText
                variant="meta"
                color={current ? colors.accentInk : colors.ink}
                numberOfLines={1}
                style={styles.tabLabel}
              >
                {SHORT[i - 1]}
              </AppText>
            </PressableScale>
          );
        })}
      </View>
      <AppText variant="cardTitle" color={colors.ink} style={styles.title}>
        {TITLES[step - 1]}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    padding: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  tabOn: { backgroundColor: colors.accent },
  tabLabel: { textAlign: 'center' },
  title: { fontSize: 24, lineHeight: 28 },
});
