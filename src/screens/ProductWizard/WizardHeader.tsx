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
 * Shared wizard header: nav-bar row (back button + step heading centred on the
 * same line) over a slim tappable 4-step bar (jump to any step freely).
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
      {/* Nav-bar row: back on the left, heading dead-centre. */}
      <View style={styles.topRow}>
        <BackButton onPress={onBack} />
        <AppText
          variant="bodyMedium"
          color={colors.ink}
          numberOfLines={1}
          style={styles.topTitle}
        >
          {TITLES[step - 1]}
        </AppText>
        {/* Same footprint as the back button so the title stays centred. */}
        <View style={styles.spacer} />
      </View>

      {/* Slim step tabs — tap to jump. */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17 },
  spacer: { width: 40, height: 40 },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    padding: 3,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
  },
  tabOn: { backgroundColor: colors.accent },
  tabLabel: { textAlign: 'center' },
});
