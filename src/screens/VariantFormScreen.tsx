import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppImage,
  AppText,
  BackButton,
  BottomSheet,
  Field,
  Icon,
  KeyboardStickyView,
  MockupGeneratorSheet,
  PressableScale,
  PrimaryButton,
  Screen,
  SegmentedControl,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useListing } from '../api/catalogHooks';
import {
  createCustomVariant,
  createGroupVariant,
  deleteVariant,
  patchVariant,
  setDefaultVariant,
} from '../api/catalogManagement';
import { paiseToRupeeInput, parseRupeesToPaise } from '../utils/money';
import { colors, radii, spacing } from '../theme/theme';

export function VariantFormScreen({ navigation, route }: ScreenProps<'VariantForm'>) {
  const { listingId, variantId, mode } = route.params;
  const isEdit = !!variantId;
  const toast = useToast();
  const qc = useQueryClient();
  const listingQ = useListing(listingId);
  const existing = listingQ.data?.variants?.find((v) => v.id === variantId);

  const [label, setLabel] = useState(''); // custom attributesLabel
  const [size, setSize] = useState(''); // color_size
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [compareAt, setCompareAt] = useState('');
  const [stock, setStock] = useState('0');
  const [active, setActive] = useState(true);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [genSheet, setGenSheet] = useState(false);
  const [gallerySheet, setGallerySheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (!isEdit || seeded || !existing) return;
    setLabel(existing.attributesLabel ?? '');
    setSku(existing.sku ?? '');
    setPrice(paiseToRupeeInput(existing.pricePaise));
    setCompareAt(paiseToRupeeInput(existing.compareAtPrice ?? null));
    setStock(String(existing.stock ?? 0));
    setActive(existing.isActive);
    setImageUrls(existing.imageUrls ?? []);
    setSeeded(true);
  }, [isEdit, seeded, existing]);

  // Mockups generate from a hosted apparel image — the listing's first gallery photo.
  const gallery = listingQ.data?.galleryUrls ?? [];
  const apparelSource = gallery[0] ?? null;

  const addImages = (urls: string[]) =>
    setImageUrls((prev) => Array.from(new Set([...prev, ...urls])));
  const removeImage = (i: number) =>
    setImageUrls((prev) => prev.filter((_, idx) => idx !== i));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['listing', listingId] });
    qc.invalidateQueries({ queryKey: ['listings'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    const pricePaise = parseRupeesToPaise(price);
    if (pricePaise == null || pricePaise <= 0) e.price = 'Enter a valid price';
    if (compareAt.trim()) {
      const cp = parseRupeesToPaise(compareAt);
      if (cp == null) e.compareAt = 'Invalid amount';
      else if (pricePaise != null && cp <= pricePaise) e.compareAt = 'MSP must be higher than the current price';
    }
    const st = Number(stock);
    if (!Number.isInteger(st) || st < 0) e.stock = 'Whole number ≥ 0';
    if (!isEdit && mode === 'custom' && !label.trim()) e.label = 'Required';
    if (!isEdit && mode === 'color_size' && !size.trim()) e.size = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    const pricePaise = parseRupeesToPaise(price)!;
    const compareAtPrice = compareAt.trim() ? parseRupeesToPaise(compareAt) : null;
    const stockN = Number(stock);
    const skuVal = sku.trim() || undefined;
    setBusy(true);
    try {
      // Edit sends the current array as-is (so removals persist); create paths only
      // include it when non-empty.
      const imagesForCreate = imageUrls.length ? imageUrls : undefined;
      if (isEdit) {
        await patchVariant(variantId!, {
          pricePaise,
          compareAtPrice,
          stock: stockN,
          sku: sku.trim() ? sku.trim() : null,
          isActive: active,
          imageUrls,
        });
      } else if (mode === 'single') {
        await setDefaultVariant(listingId, {
          sku: skuVal,
          pricePaise,
          compareAtPrice,
          stock: stockN,
          imageUrls: imagesForCreate,
        });
      } else if (mode === 'color_size') {
        const groupId =
          listingQ.data?.variantGroups?.find((g) => g.isDefault)?.id ??
          listingQ.data?.variantGroups?.[0]?.id;
        if (!groupId) throw new Error('No variant group found');
        await createGroupVariant(listingId, groupId, {
          size: size.trim(),
          sku: skuVal,
          pricePaise,
          compareAtPrice,
          stock: stockN,
          imageUrls: imagesForCreate,
        });
      } else {
        await createCustomVariant(listingId, {
          attributes: {},
          attributesLabel: label.trim(),
          sku: skuVal,
          pricePaise,
          compareAtPrice,
          stock: stockN,
          imageUrls: imagesForCreate,
        });
      }
      toast.show(isEdit ? 'Variant updated' : 'Variant added', 'success');
      refresh();
      navigation.goBack();
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not save variant', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!variantId) return;
    setBusy(true);
    try {
      await deleteVariant(variantId);
      toast.show('Variant deleted', 'info');
      refresh();
      navigation.goBack();
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not delete', 'error');
      setBusy(false);
    }
  };

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
          {isEdit ? 'Edit variant' : 'Add variant'}
        </AppText>

        {!isEdit && mode === 'custom' ? (
          <Field label="Variant name" required value={label} onChangeText={setLabel} placeholder="e.g. Red / M" error={errors.label} />
        ) : null}
        {!isEdit && mode === 'color_size' ? (
          <Field label="Size" required value={size} onChangeText={setSize} placeholder="e.g. M" error={errors.size} />
        ) : null}
        {isEdit ? (
          <View style={styles.block}>
            <AppText variant="sectionLabel" color={colors.meta}>Variant</AppText>
            <AppText variant="bodyMedium" color={colors.ink}>{label || 'Default'}</AppText>
          </View>
        ) : null}

        <View style={styles.priceRow}>
          <Field containerStyle={styles.flex} label="Current price" required prefix="₹" keyboardType="decimal-pad" value={price} onChangeText={setPrice} placeholder="499.99" error={errors.price} />
          <Field containerStyle={styles.flex} label="MSP" prefix="₹" keyboardType="decimal-pad" value={compareAt} onChangeText={setCompareAt} placeholder="Higher" error={errors.compareAt} />
        </View>
        <Field label="Stock" required keyboardType="number-pad" value={stock} onChangeText={setStock} placeholder="0" error={errors.stock} />
        <Field label="SKU" value={sku} onChangeText={setSku} placeholder="Auto-generated if blank" autoCapitalize="characters" autoCorrect={false} />

        <View style={styles.block}>
          <AppText variant="sectionLabel" color={colors.meta}>Variant images</AppText>
          {imageUrls.length ? (
            <View style={styles.thumbRow}>
              {imageUrls.map((url, i) => (
                <View key={`${url}-${i}`} style={styles.thumbCell}>
                  <AppImage uri={url} radius={radii.sm} containerStyle={styles.thumb} />
                  <PressableScale
                    onPress={() => removeImage(i)}
                    style={styles.thumbRemove}
                    toScale={0.9}
                  >
                    <Icon name="close" size={12} color={colors.surface} />
                  </PressableScale>
                </View>
              ))}
            </View>
          ) : (
            <AppText variant="meta" color={colors.meta}>No images yet.</AppText>
          )}
          <View style={styles.imgActions}>
            <PressableScale onPress={() => setGenSheet(true)} style={styles.imgBtn} haptic={false}>
              <Icon name="sparkles-outline" size={15} color={colors.ink} />
              <AppText variant="meta" color={colors.ink}>Generate with AI</AppText>
            </PressableScale>
            <PressableScale
              onPress={() => setGallerySheet(true)}
              style={styles.imgBtn}
              haptic={false}
              disabled={gallery.length === 0}
            >
              <Icon name="images-outline" size={15} color={colors.ink} />
              <AppText variant="meta" color={colors.ink}>From gallery</AppText>
            </PressableScale>
          </View>
        </View>

        {isEdit ? (
          <View style={styles.block}>
            <AppText variant="sectionLabel" color={colors.meta}>Visibility</AppText>
            <SegmentedControl<'active' | 'hidden'>
              value={active ? 'active' : 'hidden'}
              onChange={(v) => setActive(v === 'active')}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'hidden', label: 'Hidden' },
              ]}
            />
          </View>
        ) : null}

        {isEdit ? (
          <PrimaryButton label="Delete variant" tone="ghost" loading={busy} onPress={onDelete} />
        ) : null}
      </ScrollView>

      <KeyboardStickyView style={styles.footer} minBottom={spacing.md}>
        <PrimaryButton
          label={isEdit ? 'Save' : 'Add variant'}
          tone="accent"
          loading={busy}
          onPress={onSubmit}
        />
      </KeyboardStickyView>

      <BottomSheet visible={genSheet} onClose={() => setGenSheet(false)}>
        <MockupGeneratorSheet
          apparelImageUrl={apparelSource}
          existing={imageUrls}
          onAdd={(urls) => {
            addImages(urls);
            setGenSheet(false);
            if (urls.length) toast.show(`Added ${urls.length} image${urls.length > 1 ? 's' : ''}`, 'success');
          }}
          onClose={() => setGenSheet(false)}
        />
      </BottomSheet>

      <BottomSheet visible={gallerySheet} onClose={() => setGallerySheet(false)}>
        <GalleryPick
          gallery={gallery}
          existing={imageUrls}
          onConfirm={(urls) => {
            addImages(urls);
            setGallerySheet(false);
          }}
          onClose={() => setGallerySheet(false)}
        />
      </BottomSheet>
    </Screen>
  );
}

/** Compact multi-select over the listing's gallery URLs. */
function GalleryPick({
  gallery,
  existing,
  onConfirm,
  onClose,
}: {
  gallery: string[];
  existing: string[];
  onConfirm: (urls: string[]) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (url: string) =>
    setPicked((p) => (p.includes(url) ? p.filter((u) => u !== url) : [...p, url]));

  return (
    <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
      <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
        Choose from gallery
      </AppText>
      {gallery.length === 0 ? (
        <AppText variant="meta" color={colors.meta}>No gallery images on this product yet.</AppText>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickScroll}>
          {gallery.map((url, i) => {
            const already = existing.includes(url);
            const on = picked.includes(url);
            return (
              <PressableScale
                key={`${url}-${i}`}
                onPress={() => !already && toggle(url)}
                disabled={already}
                style={styles.pickCell}
              >
                <AppImage uri={url} radius={radii.sm} containerStyle={styles.pickImg} />
                {already || on ? (
                  <View style={[styles.pickBadge, already ? styles.pickBadgeMuted : null]}>
                    <Icon name="checkmark" size={14} color={colors.accentInk} />
                  </View>
                ) : null}
              </PressableScale>
            );
          })}
        </ScrollView>
      )}
      <View style={styles.sheetRow}>
        <PrimaryButton label="Cancel" tone="surface" style={styles.flex} onPress={onClose} />
        <PrimaryButton
          label={`Add ${picked.length || ''}`.trim()}
          tone="accent"
          style={styles.flex}
          disabled={picked.length === 0}
          onPress={() => onConfirm(picked)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.lg },
  h1: { fontSize: 24, lineHeight: 28 },
  block: { gap: spacing.sm },
  priceRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  footer: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.canvas,
  },
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbCell: { position: 'relative' },
  thumb: { width: 72, height: 72 },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    padding: 3,
  },
  imgActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  imgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTitle: { marginBottom: spacing.xs },
  pickScroll: { marginTop: spacing.xs },
  pickCell: { marginRight: spacing.sm, position: 'relative' },
  pickImg: { width: 96, height: 120 },
  pickBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs + spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    padding: 3,
  },
  pickBadgeMuted: { backgroundColor: colors.hairline },
  sheetRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
});
