import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  BackButton,
  Field,
  PrimaryButton,
  Screen,
  SegmentedControl,
  Select,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useBrands, useCategories, usePublishSubmission } from '../api/hooks';
import { useSession } from '../store/session';
import {
  Gender,
  GENDER_LABELS,
  ListingPolicy,
  LISTING_POLICY_LABELS,
  SubmissionStatus,
} from '../types/enums';
import { PublishInput } from '../types/api';
import { parseRupeesToPaise } from '../utils/money';
import { colors, spacing } from '../theme/theme';

const OCCASIONS = ['Casual', 'Formal', 'Party', 'Sport', 'Festive'];
// Backend age-range enum (validation_error otherwise).
const AGE_GROUPS = ['0-2', '3-7', '8-12', '13-17', '18-24', '25-40', '40+'];

/** Publish accepted submission → draft product (§5.7). */
export function PublishScreen({ navigation, route }: ScreenProps<'Publish'>) {
  const { submission } = route.params;
  const toast = useToast();
  const categoriesQ = useCategories();
  const brandsQ = useBrands();
  const publish = usePublishSubmission();
  const setName_ = useSession((s) => s.setName);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [gender, setGender] = useState<Gender>(Gender.Unisex);
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [brandId, setBrandId] = useState<string | null>(null);
  // Multi-select: e.g. return + replace can both apply.
  const [listingPolicies, setListingPolicies] = useState<string[]>([
    ListingPolicy.Return,
  ]);
  const [stock, setStock] = useState('0');
  const [compareAt, setCompareAt] = useState('');
  const [occasion, setOccasion] = useState<string[]>([]);
  const [ageGroups, setAgeGroups] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const canPublish = submission.status === SubmissionStatus.Accepted;
  const pricePaise = useMemo(() => parseRupeesToPaise(price), [price]);
  const comparePaise = useMemo(() => parseRupeesToPaise(compareAt), [compareAt]);

  const categoryOptions = useMemo(
    () => (categoriesQ.data ?? []).map((c) => ({ label: c.label, value: c.id })),
    [categoriesQ.data],
  );
  const brandOptions = useMemo(
    () => (brandsQ.data ?? []).map((b) => ({ label: b.name, value: b.id })),
    [brandsQ.data],
  );
  const occasionOptions = OCCASIONS.map((o) => ({ label: o, value: o }));
  const ageOptions = AGE_GROUPS.map((a) => ({ label: a, value: a }));
  const policyOptions = [
    ListingPolicy.Return,
    ListingPolicy.Replace,
    ListingPolicy.FinalSale,
  ].map((p) => ({ value: p, label: LISTING_POLICY_LABELS[p] }));

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Required';
    if (!categoryId) e.category = 'Pick a category';
    if (!brandId) e.brand = 'Pick a brand';
    if (pricePaise == null || pricePaise <= 0) e.price = 'Enter a valid price';
    if (compareAt.trim()) {
      if (comparePaise == null) e.compareAt = 'Invalid amount';
      else if (pricePaise != null && comparePaise <= pricePaise)
        e.compareAt = 'Must be higher than price';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = () => {
    if (!canPublish) {
      toast.show('Submission must be accepted first', 'error');
      return;
    }
    if (!validate()) return;

    const input: PublishInput = {
      name: name.trim(),
      categoryId: categoryId!,
      gender,
      pricePaise: pricePaise!,
      description: description.trim() || undefined,
      brandId: brandId ?? undefined,
      listingPolicy: (listingPolicies[0] as ListingPolicy) ?? ListingPolicy.Return,
      stock: Number(stock) || 0,
      compareAtPrice: comparePaise ?? undefined,
      occasion,
      ageGroups,
      galleryUrls: submission.outputUrls,
    };

    publish.mutate(
      { id: submission.id, input },
      {
        onSuccess: (result) => {
          setName_(submission.id, input.name);
          navigation.replace('PublishSuccess', { result });
        },
        onError: (err) => {
          // Surface backend field errors inline where possible.
          const msg = err.error.toLowerCase();
          if (msg.includes('name')) setErrors((p) => ({ ...p, name: err.error }));
          else if (msg.includes('categor'))
            setErrors((p) => ({ ...p, category: err.error }));
          else if (msg.includes('price'))
            setErrors((p) => ({ ...p, price: err.error }));
          toast.show(err.error, 'error');
        },
      },
    );
  };

  return (
    <Screen edges={['top']} padded={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <BackButton onPress={() => navigation.goBack()} />
        <AppText variant="sectionLabel" color={colors.meta}>
          Step 4 · Publish
        </AppText>
        <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
          Create the listing
        </AppText>

        <Field
          label="Product name"
          required
          value={name}
          onChangeText={setName}
          placeholder="e.g. Oversized Cotton Tee"
          error={errors.name}
        />

        <Select
          label="Category"
          required
          placeholder="Choose a category"
          loading={categoriesQ.isLoading}
          options={categoryOptions}
          selected={categoryId ? [categoryId] : []}
          onChange={(v) => setCategoryId(v[0] ?? null)}
          error={errors.category}
        />

        {/* Gender */}
        <View style={styles.block}>
          <AppText variant="sectionLabel" color={colors.meta}>
            Gender *
          </AppText>
          <SegmentedControl<Gender>
            value={gender}
            onChange={setGender}
            options={[Gender.Her, Gender.Him, Gender.Unisex].map((g) => ({
              value: g,
              label: GENDER_LABELS[g],
            }))}
          />
        </View>

        <Field
          label="Price"
          required
          prefix="₹"
          keyboardType="decimal-pad"
          value={price}
          onChangeText={setPrice}
          placeholder="499.99"
          error={errors.price}
        />

        <Field
          label="Compare at (optional)"
          prefix="₹"
          keyboardType="decimal-pad"
          value={compareAt}
          onChangeText={setCompareAt}
          placeholder="Higher than price"
          error={errors.compareAt}
        />

        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Short product description"
          multiline
        />

        <Select
          label="Brand"
          required
          placeholder="Choose a brand"
          loading={brandsQ.isLoading}
          options={brandOptions}
          selected={brandId ? [brandId] : []}
          onChange={(v) => setBrandId(v[0] ?? null)}
          error={errors.brand}
        />

        <Select
          label="Listing policy"
          multiple
          placeholder="Select policies"
          options={policyOptions}
          selected={listingPolicies}
          onChange={setListingPolicies}
        />

        <Field
          label="Stock"
          keyboardType="number-pad"
          value={stock}
          onChangeText={setStock}
          placeholder="0"
        />

        <Select
          label="Occasion"
          multiple
          placeholder="Select occasions"
          options={occasionOptions}
          selected={occasion}
          onChange={setOccasion}
        />

        <Select
          label="Age groups"
          multiple
          placeholder="Select age groups"
          options={ageOptions}
          selected={ageGroups}
          onChange={setAgeGroups}
        />

        <AppText variant="meta" color={colors.meta} style={styles.galleryNote}>
          {submission.outputUrls.length} approved mockups will be used as the
          gallery.
        </AppText>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label="Publish draft"
          tone="accent"
          loading={publish.isPending}
          disabled={!canPublish}
          onPress={onSubmit}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.screenH,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  h1: { fontSize: 24, lineHeight: 28 },
  block: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  galleryNote: { marginTop: spacing.xs },
  footer: {
    paddingHorizontal: spacing.screenH,
    paddingVertical: spacing.md,
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
