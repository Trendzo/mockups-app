import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppImage,
  AppText,
  BackButton,
  Field,
  Icon,
  KeyboardStickyView,
  PressableScale,
  PrimaryButton,
  Screen,
  Select,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useCatalogBrands, useCatalogCategories, useListing } from '../api/catalogHooks';
import { createListing, updateListing, uploadImage } from '../api/catalogManagement';
import {
  AGE_GROUP_VALUES,
  CatalogGender,
  ListingPolicy,
  UpdateListingInput,
} from '../types/catalog';
import { inferMimeType } from '../utils/image';
import { colors, radii, spacing } from '../theme/theme';

const OCCASIONS = ['Casual', 'Formal', 'Party', 'Sport', 'Festive'];
// Multi-select pills; both = unisex, one = her/him.
const GENDER_PILLS: { value: 'her' | 'him'; label: string }[] = [
  { value: 'her', label: 'Women' },
  { value: 'him', label: 'Men' },
];
const POLICIES: { value: ListingPolicy; label: string }[] = [
  { value: 'return', label: 'Return' },
  { value: 'replace', label: 'Replace' },
  { value: 'final_sale', label: 'Final sale' },
];

export function ProductFormScreen({ navigation, route }: ScreenProps<'ProductForm'>) {
  const editId = route.params?.id;
  const isEdit = !!editId;
  const toast = useToast();
  const qc = useQueryClient();
  const brandsQ = useCatalogBrands();
  const categoriesQ = useCatalogCategories();
  const listingQ = useListing(editId);

  const [name, setName] = useState('');
  const [brandId, setBrandId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [genders, setGenders] = useState<Array<'her' | 'him'>>([]);
  const [description, setDescription] = useState('');
  const [descriptionLong, setDescriptionLong] = useState('');
  const [policy, setPolicy] = useState<ListingPolicy>('return');
  const [occasion, setOccasion] = useState<string[]>([]);
  const [ageGroups, setAgeGroups] = useState<string[]>([]);
  const [gallery, setGallery] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [seeded, setSeeded] = useState(false);

  // Seed the form from the listing when editing.
  useEffect(() => {
    if (!isEdit || seeded || !listingQ.data) return;
    const l = listingQ.data;
    setName(l.name);
    setBrandId(l.brandId ?? null);
    setCategoryId(l.categoryId);
    setGenders(l.gender === 'unisex' ? ['her', 'him'] : [l.gender as 'her' | 'him']);
    setDescription(l.description ?? '');
    setDescriptionLong(l.descriptionLong ?? '');
    setPolicy(l.listingPolicy);
    setOccasion(l.occasion ?? []);
    setAgeGroups(l.ageGroups ?? []);
    setGallery(l.galleryUrls ?? []);
    setSeeded(true);
  }, [isEdit, seeded, listingQ.data]);

  const brandOptions = (brandsQ.data ?? []).map((b) => ({ value: b.id, label: b.name }));
  const categoryOptions = (categoriesQ.data ?? []).map((c) => ({ value: c.id, label: c.label }));

  const addImage = async () => {
    if (gallery.length >= 20) {
      toast.show('Up to 20 images', 'info');
      return;
    }
    const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 0.9 });
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    setUploading(true);
    try {
      const url = await uploadImage({
        uri: asset.uri,
        name: asset.fileName ?? `img_${Date.now()}.jpg`,
        type: asset.type ?? inferMimeType(asset.uri),
      });
      setGallery((g) => [...g, url]);
    } catch (e: any) {
      toast.show(e?.message ?? 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const toggleGender = (v: 'her' | 'him') =>
    setGenders((g) => (g.includes(v) ? g.filter((x) => x !== v) : [...g, v]));

  // Both pills = unisex; one = her/him.
  const derivedGender: CatalogGender =
    genders.length >= 2 ? 'unisex' : (genders[0] as CatalogGender) ?? 'unisex';

  const validate = () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 1 || name.trim().length > 200) e.name = '1–200 characters';
    if (!brandId) e.brand = 'Pick a brand';
    if (!categoryId) e.category = 'Pick a category';
    if (genders.length === 0) e.gender = 'Select at least one';
    if (description.length > 2000) e.description = 'Max 2000 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      if (isEdit) {
        const body: UpdateListingInput = {
          name: name.trim(),
          brandId: brandId!,
          categoryId: categoryId!,
          gender: derivedGender,
          description: description.trim() || undefined,
          descriptionLong: descriptionLong.trim() || undefined,
          listingPolicy: policy,
          occasion,
          ageGroups,
          galleryUrls: gallery,
        };
        await updateListing(editId!, body);
        toast.show('Product updated', 'success');
        qc.invalidateQueries({ queryKey: ['listing', editId] });
        qc.invalidateQueries({ queryKey: ['listings'] });
        navigation.goBack();
      } else {
        const created = await createListing({
          name: name.trim(),
          brandId: brandId!,
          categoryId: categoryId!,
          gender: derivedGender,
          description: description.trim() || undefined,
          descriptionLong: descriptionLong.trim() || undefined,
          listingPolicy: policy,
          occasion,
          ageGroups,
          galleryUrls: gallery,
        });
        toast.show('Draft created — add a variant to publish', 'success');
        qc.invalidateQueries({ queryKey: ['listings'] });
        navigation.replace('ProductDetail', { id: created.id });
      }
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not save', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (isEdit && !seeded && listingQ.isLoading) {
    return (
      <Screen edges={['top', 'bottom']}>
        <BackButton onPress={() => navigation.goBack()} />
        <ActivityIndicator color={colors.ink} style={styles.loader} />
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.content}
      >
        <BackButton onPress={() => navigation.goBack()} />
        <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
          {isEdit ? 'Edit product' : 'New product'}
        </AppText>

        <Field label="Product name" required value={name} onChangeText={setName} placeholder="e.g. Oversized Cotton Tee" error={errors.name} />
        <Select label="Brand" required placeholder="Choose a brand" loading={brandsQ.isLoading} options={brandOptions} selected={brandId ? [brandId] : []} onChange={(v) => setBrandId(v[0] ?? null)} error={errors.brand} />
        <Select label="Category" required placeholder="Choose a category" loading={categoriesQ.isLoading} options={categoryOptions} selected={categoryId ? [categoryId] : []} onChange={(v) => setCategoryId(v[0] ?? null)} error={errors.category} />

        <View style={styles.block}>
          <AppText variant="sectionLabel" color={colors.meta}>Gender *</AppText>
          <View style={styles.pillRow}>
            {GENDER_PILLS.map((p) => {
              const on = genders.includes(p.value);
              return (
                <PressableScale
                  key={p.value}
                  onPress={() => toggleGender(p.value)}
                  toScale={0.97}
                  style={[styles.pill, on ? styles.pillOn : null]}
                >
                  {on ? <Icon name="checkmark" size={15} color={colors.accentInk} /> : null}
                  <AppText variant="bodyMedium" color={on ? colors.accentInk : colors.ink}>
                    {p.label}
                  </AppText>
                </PressableScale>
              );
            })}
          </View>
          {errors.gender ? (
            <AppText variant="meta" color={colors.danger}>
              {errors.gender}
            </AppText>
          ) : null}
        </View>

        <Field label="Description" value={description} onChangeText={setDescription} placeholder="Short product description" multiline error={errors.description} />
        <Field label="Full description" value={descriptionLong} onChangeText={setDescriptionLong} placeholder="Longer details (optional)" multiline />
        <Select label="Listing policy" options={POLICIES} selected={[policy]} onChange={(v) => setPolicy((v[0] as ListingPolicy) ?? 'return')} />
        <Select label="Occasion" multiple placeholder="Select occasions" options={OCCASIONS.map((o) => ({ value: o, label: o }))} selected={occasion} onChange={setOccasion} />
        <Select label="Age groups" multiple placeholder="Select age groups" options={AGE_GROUP_VALUES.map((a) => ({ value: a, label: a }))} selected={ageGroups} onChange={setAgeGroups} />

        {/* Gallery */}
        <View style={styles.block}>
          <AppText variant="sectionLabel" color={colors.meta}>Gallery images</AppText>
          <View style={styles.galleryRow}>
            {gallery.map((url, i) => (
              <View key={`${url}-${i}`} style={styles.galleryCell}>
                <AppImage uri={url} radius={radii.sm} containerStyle={styles.galleryImg} />
                <PressableScale
                  onPress={() => setGallery((g) => g.filter((_, idx) => idx !== i))}
                  style={styles.removeChip}
                  toScale={0.9}
                >
                  <Icon name="close" size={14} color={colors.surface} />
                </PressableScale>
              </View>
            ))}
            <PressableScale onPress={addImage} style={styles.addCell} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <Icon name="add" size={26} color={colors.inkMuted} />
              )}
            </PressableScale>
          </View>
        </View>
      </ScrollView>

      <KeyboardStickyView style={styles.footer} minBottom={spacing.md}>
        <PrimaryButton
          label={isEdit ? 'Save changes' : 'Create draft'}
          tone="accent"
          loading={busy}
          onPress={onSubmit}
        />
      </KeyboardStickyView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.lg },
  loader: { marginTop: spacing.xl },
  h1: { fontSize: 24, lineHeight: 28 },
  block: { gap: spacing.sm },
  pillRow: { flexDirection: 'row', gap: spacing.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  pillOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  galleryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  galleryCell: { width: 76, height: 76 },
  galleryImg: { width: 76, height: 76 },
  removeChip: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCell: {
    width: 76,
    height: 76,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.canvas,
  },
});
