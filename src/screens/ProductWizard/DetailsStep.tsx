import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import {
  Field,
  KeyboardStickyView,
  PrimaryButton,
  Screen,
  Select,
} from '../../components';
import { ScreenProps } from '../../navigation/types';
import { useProductDraft } from '../../store/productDraft';
import { AGE_GROUP_VALUES, ListingPolicy } from '../../types/catalog';
import { colors, spacing } from '../../theme/theme';
import { WizardHeader } from './WizardHeader';
import { useExitWizardToHome } from './useExitToHome';

const OCCASIONS = ['Casual', 'Formal', 'Party', 'Sport', 'Festive'];
const POLICIES: { value: ListingPolicy; label: string }[] = [
  { value: 'return', label: 'Return' },
  { value: 'replace', label: 'Replace' },
  { value: 'final_sale', label: 'Final sale' },
];

export function DetailsStep({ navigation }: ScreenProps<'ProductWizardDetails'>) {
  const d = useProductDraft();
  const exitHome = useExitWizardToHome();

  return (
    <Screen edges={['top']}>
      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <WizardHeader step={3} onBack={exitHome} />

        <Field
          label="Description"
          value={d.description}
          onChangeText={(v) => d.setDetails({ description: v })}
          placeholder="Short product description"
          multiline
        />
        <Field
          label="Full description"
          value={d.descriptionLong}
          onChangeText={(v) => d.setDetails({ descriptionLong: v })}
          placeholder="Longer details, fabric, care…"
          multiline
        />
        <Select
          label="Return policy"
          options={POLICIES}
          selected={[d.listingPolicy]}
          onChange={(v) => d.setDetails({ listingPolicy: (v[0] as ListingPolicy) ?? 'return' })}
        />
        <Select
          label="Occasion"
          multiple
          placeholder="Select occasions"
          options={OCCASIONS.map((o) => ({ value: o, label: o }))}
          selected={d.occasion}
          onChange={(v) => d.setDetails({ occasion: v })}
        />
        <Select
          label="Age groups"
          multiple
          placeholder="Select age groups"
          options={AGE_GROUP_VALUES.map((a) => ({ value: a, label: a }))}
          selected={d.ageGroups}
          onChange={(v) => d.setDetails({ ageGroups: v })}
        />
        <Field
          label="HSN code"
          value={d.hsn}
          onChangeText={(v) => d.setDetails({ hsn: v })}
          placeholder="e.g. 6109"
          keyboardType="number-pad"
        />
      </ScrollView>

      <KeyboardStickyView style={styles.footer} minBottom={spacing.md}>
        <PrimaryButton
          label="Next · Review"
          tone="accent"
          onPress={() => navigation.navigate('ProductWizardReview')}
        />
      </KeyboardStickyView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.lg },
  footer: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.canvas,
  },
});
