import React, { useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  UIManager,
  View,
} from 'react-native';
import {
  AppText,
  Field,
  Icon,
  KeyboardStickyView,
  PressableScale,
  PrimaryButton,
  Screen,
  Select,
  useToast,
} from '../../components';
import { ScreenProps } from '../../navigation/types';
import { useCatalogBrands, useCatalogCategories, useCreateBrand } from '../../api/catalogHooks';
import { useProductDraft } from '../../store/productDraft';
import { useCaptureDraft } from '../../store/captureDraft';
import { colors, radii, spacing } from '../../theme/theme';
import { pickAndUploadImages } from './pickImages';
import { SortableGallery } from './SortableGallery';
import { WizardHeader } from './WizardHeader';

const GENDER_PILLS: { value: 'her' | 'him'; label: string }[] = [
  { value: 'her', label: 'Women' },
  { value: 'him', label: 'Men' },
];
const MAX_IMAGES = 20;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
/** Smooth height expand/collapse when toggling inline sections. */
const easeLayout = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

export function BasicsStep({ navigation }: ScreenProps<'ProductWizardBasics'>) {
  const toast = useToast();
  const brandsQ = useCatalogBrands();
  const categoriesQ = useCatalogCategories();
  const createBrand = useCreateBrand();

  const d = useProductDraft();
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [newBrand, setNewBrand] = useState('');

  const brandOptions = (brandsQ.data ?? []).map((b) => ({ value: b.id, label: b.name }));
  const categoryOptions = (categoriesQ.data ?? []).map((c) => ({ value: c.id, label: c.label }));

  const addImages = async () => {
    if (d.gallery.length >= MAX_IMAGES) {
      toast.show(`Up to ${MAX_IMAGES} images`, 'info');
      return;
    }
    setUploading(true);
    try {
      const urls = await pickAndUploadImages(0);
      if (urls.length) d.addGalleryUrls(urls.slice(0, MAX_IMAGES - d.gallery.length));
    } catch (e: any) {
      toast.show(e?.message ?? 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  // Detour into the AI mockup generator; keep the draft so nothing is re-typed.
  const generateMockup = () => {
    d.setPendingMockup(true);
    useCaptureDraft.getState().clear();
    navigation.navigate('SelectPhotos');
  };

  const onCreateBrand = async () => {
    const name = newBrand.trim();
    if (!name) return;
    try {
      const brand = await createBrand.mutateAsync({ name });
      d.setBasics({ brandId: brand.id });
      easeLayout();
      setBrandOpen(false);
      setNewBrand('');
      toast.show('Brand created', 'success');
    } catch (e: any) {
      // Log the full server error (status + raw body) so the failure is visible.
      console.error(
        `[createBrand] POST /catalog/brands failed → ${e?.status ?? '?'}: ${e?.message}`,
        e?.detail ?? e,
      );
      const detail = e?.detail ? ` — ${e.detail}` : '';
      toast.show(`${e?.message ?? 'Could not create brand'}${detail}`, 'error');
    }
  };

  return (
    <Screen edges={['top']}>
      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!dragging}
        contentContainerStyle={styles.content}
      >
        <WizardHeader step={1} onBack={() => navigation.goBack()} />

        <Field
          label="Product name"
          required
          value={d.name}
          onChangeText={(v) => d.setBasics({ name: v })}
          placeholder="e.g. Oversized Cotton Tee"
        />

        <View style={styles.block}>
          <Select
            label="Brand"
            required
            placeholder="Choose a brand"
            loading={brandsQ.isLoading}
            options={brandOptions}
            selected={d.brandId ? [d.brandId] : []}
            onChange={(v) => d.setBasics({ brandId: v[0] ?? null })}
          />
          <PressableScale
            onPress={() => {
              easeLayout();
              setBrandOpen((o) => !o);
            }}
            haptic={false}
            style={styles.inlineAction}
          >
            <Icon name={brandOpen ? 'close' : 'add'} size={16} color={colors.ink} />
            <AppText variant="meta" color={colors.ink}>
              {brandOpen ? 'Cancel new brand' : 'Create new brand'}
            </AppText>
          </PressableScale>
          {brandOpen ? (
            <View style={styles.brandCreate}>
              <Field
                label="New brand name"
                value={newBrand}
                onChangeText={setNewBrand}
                placeholder="e.g. Trendzo Originals"
              />
              <PrimaryButton
                label="Create & select"
                tone="accent"
                loading={createBrand.isPending}
                onPress={onCreateBrand}
              />
            </View>
          ) : null}
        </View>

        <Select
          label="Category"
          required
          placeholder="Choose a category"
          loading={categoriesQ.isLoading}
          options={categoryOptions}
          selected={d.categoryId ? [d.categoryId] : []}
          onChange={(v) => d.setBasics({ categoryId: v[0] ?? null })}
        />

        <View style={styles.block}>
          <AppText variant="sectionLabel" color={colors.meta}>
            Gender *
          </AppText>
          <View style={styles.pillRow}>
            {GENDER_PILLS.map((p) => {
              const on = d.genders.includes(p.value);
              return (
                <PressableScale
                  key={p.value}
                  onPress={() => d.toggleGender(p.value)}
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
        </View>

        {/* Gallery */}
        <View style={styles.block}>
          <AppText variant="sectionLabel" color={colors.meta}>
            Gallery images
          </AppText>
          {d.gallery.length ? (
            <>
              <AppText variant="meta" color={colors.meta}>
                Hold &amp; drag to reorder · the first image is the primary.
              </AppText>
              <SortableGallery
                urls={d.gallery}
                onReorder={d.setGallery}
                onRemove={d.removeGalleryUrl}
                onDragStart={() => setDragging(true)}
                onDragEnd={() => setDragging(false)}
              />
            </>
          ) : (
            <AppText variant="meta" color={colors.meta}>
              Add images or generate an AI mockup to build the gallery.
            </AppText>
          )}
          <View style={styles.galleryActions}>
            <PressableScale onPress={addImages} style={styles.addBtn} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <>
                  <Icon name="images-outline" size={18} color={colors.ink} />
                  <AppText variant="bodyMedium" color={colors.ink}>
                    Add images
                  </AppText>
                </>
              )}
            </PressableScale>
            <PressableScale onPress={generateMockup} style={styles.mockupBtn}>
              <Icon name="sparkles" size={18} color={colors.accentInk} />
              <AppText variant="bodyMedium" color={colors.accentInk}>
                Generate mockup
              </AppText>
            </PressableScale>
          </View>
        </View>
      </ScrollView>

      <KeyboardStickyView style={styles.footer} minBottom={spacing.md}>
        <PrimaryButton
          label="Next · Variants"
          tone="accent"
          onPress={() => navigation.navigate('ProductWizardVariants')}
        />
      </KeyboardStickyView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.lg },
  block: { gap: spacing.sm },
  inlineAction: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginLeft: 2 },
  brandCreate: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
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
  galleryActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 48,
    borderRadius: radii.sm + 4,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
  },
  mockupBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 48,
    borderRadius: radii.sm + 4,
    backgroundColor: colors.accent,
  },
  footer: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.canvas,
  },
});
