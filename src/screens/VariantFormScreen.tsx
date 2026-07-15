import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppImage,
  AppText,
  BackButton,
  Field,
  GenerateMockupCards,
  KeyboardStickyView,
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
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [seeded, setSeeded] = useState(false);
  // AI-generated variant images, attached to the variant on save.
  const [genUrls, setGenUrls] = useState<string[]>([]);

  // Source photo for generation: the listing's first gallery image.
  const apparelUrl = listingQ.data?.galleryUrls?.[0];
  const modelGender = listingQ.data?.gender === 'him' ? 'him' : 'her';

  useEffect(() => {
    if (!isEdit || seeded || !existing) return;
    setLabel(existing.attributesLabel ?? '');
    setSku(existing.sku ?? '');
    setPrice(paiseToRupeeInput(existing.pricePaise));
    setCompareAt(paiseToRupeeInput(existing.compareAtPrice ?? null));
    setStock(String(existing.stock ?? 0));
    setActive(existing.isActive);
    setSeeded(true);
  }, [isEdit, seeded, existing]);

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
    // Attach freshly generated images (kept alongside any existing ones).
    const imageUrls = genUrls.length
      ? [...(existing?.imageUrls ?? []), ...genUrls]
      : undefined;
    setBusy(true);
    try {
      if (isEdit) {
        await patchVariant(variantId!, {
          pricePaise,
          compareAtPrice,
          stock: stockN,
          sku: sku.trim() ? sku.trim() : null,
          isActive: active,
          ...(imageUrls ? { imageUrls } : {}),
        });
      } else if (mode === 'single') {
        await setDefaultVariant(listingId, {
          sku: skuVal,
          pricePaise,
          compareAtPrice,
          stock: stockN,
          imageUrls,
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
          imageUrls,
        });
      } else {
        await createCustomVariant(listingId, {
          attributes: {},
          attributesLabel: label.trim(),
          sku: skuVal,
          pricePaise,
          compareAtPrice,
          stock: stockN,
          imageUrls,
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

        {/* AI image generation — product / on-model shots for this variant */}
        <View style={styles.block}>
          <AppText variant="sectionLabel" color={colors.meta}>Generate images</AppText>
          <GenerateMockupCards
            apparelUrl={apparelUrl}
            modelGender={modelGender}
            onGenerated={(urls) => setGenUrls((prev) => [...prev, ...urls])}
          />
          {genUrls.length ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.genThumbs}>
                  {genUrls.map((url) => (
                    <AppImage key={url} uri={url} radius={radii.sm + 4} containerStyle={styles.genThumb} />
                  ))}
                </View>
              </ScrollView>
              <AppText variant="meta" color={colors.meta}>
                {genUrls.length} generated image{genUrls.length > 1 ? 's' : ''} — attached on save.
              </AppText>
            </>
          ) : null}
        </View>

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
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.lg },
  h1: { fontSize: 24, lineHeight: 28 },
  block: { gap: spacing.sm },
  priceRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  genThumbs: { flexDirection: 'row', gap: spacing.sm },
  genThumb: { width: 72, height: 96 },
  footer: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.canvas,
  },
});
