import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppImage,
  AppText,
  BottomSheet,
  Field,
  Icon,
  KeyboardStickyView,
  PressableScale,
  PrimaryButton,
  Screen,
  SegmentedControl,
  useToast,
} from '../../components';
import { ScreenProps } from '../../navigation/types';
import {
  ColorDraft,
  SingleVariantDraft,
  SizeRow,
  useProductDraft,
  VariantTarget,
} from '../../store/productDraft';
import { parseRupeesToPaise } from '../../utils/money';
import { colors, radii, spacing } from '../../theme/theme';
import { pickAndUploadImages } from './pickImages';
import { WizardHeader } from './WizardHeader';

/** Validate one variant's money + stock. Returns keyed errors ('' prefix). */
function variantErrors(
  prefix: string,
  v: { price: string; mrp: string; stock: string },
): Record<string, string> {
  const e: Record<string, string> = {};
  const price = parseRupeesToPaise(v.price);
  if (price == null || price <= 0) e[`${prefix}price`] = 'Valid price';
  if (v.mrp.trim()) {
    const mrp = parseRupeesToPaise(v.mrp);
    if (mrp == null) e[`${prefix}mrp`] = 'Invalid';
    else if (price != null && mrp <= price) e[`${prefix}mrp`] = 'MRP > price';
  }
  const st = Number(v.stock);
  if (!Number.isInteger(st) || st < 0) e[`${prefix}stock`] = '≥ 0';
  return e;
}

export function VariantsStep({ navigation }: ScreenProps<'ProductWizardVariants'>) {
  const d = useProductDraft();
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Steps are freely navigable: highlight any problems but never block the move.
  const onNext = () => {
    const e: Record<string, string> = {};
    if (d.variantMode === 'single') {
      Object.assign(e, variantErrors('single.', d.single));
    } else {
      d.colors.forEach((c) => {
        c.sizes.forEach((row) => {
          if (!row.size.trim()) e[`${row.id}.size`] = 'Required';
          Object.assign(e, variantErrors(`${row.id}.`, row));
        });
      });
    }
    setErrors(e);
    navigation.navigate('ProductWizardDetails');
  };

  return (
    <Screen edges={['top']}>
      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <WizardHeader step={2} onBack={() => navigation.goBack()} />

        {d.mode === 'edit' ? (
          <View style={styles.lockRow}>
            <Icon name="lock-closed" size={14} color={colors.meta} />
            <AppText variant="meta" color={colors.meta}>
              Type: {d.variantMode === 'single' ? 'Single product' : 'Color variants'} (locked while
              editing)
            </AppText>
          </View>
        ) : (
          <SegmentedControl<'single' | 'color_size'>
            value={d.variantMode}
            onChange={d.setVariantMode}
            options={[
              { value: 'single', label: 'Single product' },
              { value: 'color_size', label: 'Color variants' },
            ]}
          />
        )}

        {d.variantMode === 'single' ? (
          <SingleEditor value={d.single} onChange={d.setSingle} errors={errors} />
        ) : (
          <ColorVariantsEditor errors={errors} />
        )}

        {errors.general ? (
          <AppText variant="meta" color={colors.danger}>
            {errors.general}
          </AppText>
        ) : null}
      </ScrollView>

      <KeyboardStickyView style={styles.footer} minBottom={spacing.md}>
        <PrimaryButton label="Next · Details" tone="accent" onPress={onNext} />
      </KeyboardStickyView>
    </Screen>
  );
}

function SingleEditor({
  value,
  onChange,
  errors,
}: {
  value: SingleVariantDraft;
  onChange: (patch: Partial<SingleVariantDraft>) => void;
  errors: Record<string, string>;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.priceRow}>
        <Field
          containerStyle={styles.flex}
          label="MRP"
          prefix="₹"
          keyboardType="decimal-pad"
          value={value.mrp}
          onChangeText={(v) => onChange({ mrp: v })}
          placeholder="Higher"
          error={errors['single.mrp']}
        />
        <Field
          containerStyle={styles.flex}
          label="Selling price"
          required
          prefix="₹"
          keyboardType="decimal-pad"
          value={value.price}
          onChangeText={(v) => onChange({ price: v })}
          placeholder="499.99"
          error={errors['single.price']}
        />
      </View>
      <View style={styles.priceRow}>
        <Field
          containerStyle={styles.flex}
          label="Size"
          value={value.size}
          onChangeText={(v) => onChange({ size: v })}
          placeholder="M / Free Size"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Field
          containerStyle={styles.flex}
          label="Stock"
          required
          keyboardType="number-pad"
          value={value.stock}
          onChangeText={(v) => onChange({ stock: v })}
          placeholder="0"
          error={errors['single.stock']}
        />
      </View>
      <Field
        label="SKU"
        value={value.sku}
        onChangeText={(v) => onChange({ sku: v })}
        placeholder="Auto-generated if blank"
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <VariantImages target="single" imageUrls={value.imageUrls} />
    </View>
  );
}

function ColorVariantsEditor({ errors }: { errors: Record<string, string> }) {
  const d = useProductDraft();
  const [genOpen, setGenOpen] = useState(false);

  return (
    <View style={styles.block}>
      <PressableScale onPress={() => setGenOpen((o) => !o)} haptic={false} style={styles.genToggle}>
        <Icon name="grid-outline" size={16} color={colors.ink} />
        <AppText variant="bodyMedium" color={colors.ink}>
          Quick generate grid
        </AppText>
        <Icon name={genOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.meta} />
      </PressableScale>
      {genOpen ? <QuickGenerate onDone={() => setGenOpen(false)} /> : null}

      {d.colors.map((color, ci) => (
        <ColorCard key={color.id} color={color} index={ci} errors={errors} />
      ))}

      <PressableScale onPress={d.addColor} style={styles.addColorBtn}>
        <Icon name="add" size={18} color={colors.ink} />
        <AppText variant="bodyMedium" color={colors.ink}>
          Add color
        </AppText>
      </PressableScale>
    </View>
  );
}

function QuickGenerate({ onDone }: { onDone: () => void }) {
  const generateMatrix = useProductDraft((s) => s.generateMatrix);
  const [colorsText, setColorsText] = useState('');
  const [sizesText, setSizesText] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('0');

  const generate = () => {
    const colorNames = colorsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const sizes = sizesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    generateMatrix({
      colors: (colorNames.length ? colorNames : ['']).map((name) => ({ name })),
      sizes,
      base: { price, stock },
    });
    onDone();
  };

  return (
    <View style={styles.card}>
      <Field
        label="Colors (comma separated)"
        value={colorsText}
        onChangeText={setColorsText}
        placeholder="Red, Blue, Black"
      />
      <Field
        label="Sizes (comma separated)"
        value={sizesText}
        onChangeText={setSizesText}
        placeholder="S, M, L, XL"
      />
      <View style={styles.priceRow}>
        <Field
          containerStyle={styles.flex}
          label="Base price"
          prefix="₹"
          keyboardType="decimal-pad"
          value={price}
          onChangeText={setPrice}
          placeholder="499"
        />
        <Field
          containerStyle={styles.flex}
          label="Base stock"
          keyboardType="number-pad"
          value={stock}
          onChangeText={setStock}
          placeholder="0"
        />
      </View>
      <PrimaryButton label="Generate grid" tone="ink" onPress={generate} />
    </View>
  );
}

function ColorCard({
  color,
  index,
  errors,
}: {
  color: ColorDraft;
  index: number;
  errors: Record<string, string>;
}) {
  const d = useProductDraft();
  return (
    <View style={styles.card}>
      <View style={styles.colorHead}>
        <AppText variant="sectionLabel" color={colors.meta}>
          Color {index + 1}
        </AppText>
        <PressableScale onPress={() => d.removeColor(color.id)} haptic={false}>
          <Icon name="trash-outline" size={18} color={colors.danger} />
        </PressableScale>
      </View>
      <View style={styles.priceRow}>
        <Field
          containerStyle={styles.flex}
          label="Color name"
          value={color.name}
          onChangeText={(v) => d.updateColor(color.id, { name: v })}
          placeholder="e.g. Red"
        />
        <Field
          containerStyle={styles.flex}
          label="Hex (optional)"
          value={color.colorHex ?? ''}
          onChangeText={(v) => d.updateColor(color.id, { colorHex: v || undefined })}
          placeholder="#E5484D"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {color.sizes.map((row) => (
        <SizeRowEditor key={row.id} colorId={color.id} row={row} errors={errors} />
      ))}

      <PressableScale
        onPress={() => d.addSizeRow(color.id)}
        haptic={false}
        style={styles.addSizeBtn}
      >
        <Icon name="add" size={16} color={colors.ink} />
        <AppText variant="meta" color={colors.ink}>
          Add size
        </AppText>
      </PressableScale>
    </View>
  );
}

function SizeRowEditor({
  colorId,
  row,
  errors,
}: {
  colorId: string;
  row: SizeRow;
  errors: Record<string, string>;
}) {
  const d = useProductDraft();
  const update = (patch: Partial<SizeRow>) => d.updateSizeRow(colorId, row.id, patch);
  return (
    <View style={styles.sizeRow}>
      <View style={styles.sizeHead}>
        <Field
          containerStyle={styles.flex}
          label="Size"
          required
          value={row.size}
          onChangeText={(v) => update({ size: v })}
          placeholder="M"
          error={errors[`${row.id}.size`]}
        />
        <PressableScale
          onPress={() => d.removeSizeRow(colorId, row.id)}
          haptic={false}
          style={styles.sizeRemove}
        >
          <Icon name="close" size={16} color={colors.meta} />
        </PressableScale>
      </View>
      <View style={styles.priceRow}>
        <Field
          containerStyle={styles.flex}
          label="MRP"
          prefix="₹"
          keyboardType="decimal-pad"
          value={row.mrp}
          onChangeText={(v) => update({ mrp: v })}
          placeholder="Higher"
          error={errors[`${row.id}.mrp`]}
        />
        <Field
          containerStyle={styles.flex}
          label="Price"
          required
          prefix="₹"
          keyboardType="decimal-pad"
          value={row.price}
          onChangeText={(v) => update({ price: v })}
          placeholder="499"
          error={errors[`${row.id}.price`]}
        />
      </View>
      <View style={styles.priceRow}>
        <Field
          containerStyle={styles.flex}
          label="Stock"
          required
          keyboardType="number-pad"
          value={row.stock}
          onChangeText={(v) => update({ stock: v })}
          placeholder="0"
          error={errors[`${row.id}.stock`]}
        />
        <Field
          containerStyle={styles.flex}
          label="SKU"
          value={row.sku}
          onChangeText={(v) => update({ sku: v })}
          placeholder="Optional"
          autoCapitalize="characters"
          autoCorrect={false}
        />
      </View>
      <VariantImages target={{ colorId, rowId: row.id }} imageUrls={row.imageUrls} />
    </View>
  );
}

/** Per-variant image control: thumbs + choose-from-gallery + upload. */
function VariantImages({ target, imageUrls }: { target: VariantTarget; imageUrls: string[] }) {
  const d = useProductDraft();
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const [uploading, setUploading] = useState(false);

  const upload = async () => {
    setUploading(true);
    try {
      const urls = await pickAndUploadImages(0);
      if (urls.length) d.addVariantImages(target, urls);
    } catch (e: any) {
      toast.show(e?.message ?? 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.imgBlock}>
      <AppText variant="sectionLabel" color={colors.meta}>
        Variant images
      </AppText>
      <View style={styles.thumbRow}>
        {imageUrls.map((url, i) => (
          <View key={`${url}-${i}`} style={styles.thumbCell}>
            <AppImage uri={url} radius={radii.sm} containerStyle={styles.thumb} />
            <PressableScale
              onPress={() => d.removeVariantImage(target, i)}
              style={styles.thumbRemove}
              toScale={0.9}
            >
              <Icon name="close" size={12} color={colors.surface} />
            </PressableScale>
          </View>
        ))}
      </View>
      <View style={styles.imgActions}>
        <PressableScale onPress={() => setSheet(true)} style={styles.imgBtn} haptic={false}>
          <Icon name="images-outline" size={15} color={colors.ink} />
          <AppText variant="meta" color={colors.ink}>
            From gallery
          </AppText>
        </PressableScale>
        <PressableScale onPress={upload} style={styles.imgBtn} haptic={false} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator size="small" color={colors.ink} />
          ) : (
            <>
              <Icon name="cloud-upload-outline" size={15} color={colors.ink} />
              <AppText variant="meta" color={colors.ink}>
                Upload
              </AppText>
            </>
          )}
        </PressableScale>
      </View>

      <BottomSheet visible={sheet} onClose={() => setSheet(false)}>
        <GalleryPickerSheet
          gallery={d.gallery}
          existing={imageUrls}
          onConfirm={(urls) => {
            d.addVariantImages(target, urls);
            setSheet(false);
          }}
          onClose={() => setSheet(false)}
        />
      </BottomSheet>
    </View>
  );
}

function GalleryPickerSheet({
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
        <AppText variant="meta" color={colors.meta}>
          No gallery images yet. Add or generate images in Step 1 first.
        </AppText>
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
  block: { gap: spacing.md },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.md,
  },
  priceRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  genToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  colorHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addColorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 48,
    borderRadius: radii.sm + 4,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderStyle: 'dashed',
  },
  sizeRow: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  sizeHead: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  sizeRemove: {
    width: 40,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSizeBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' },
  imgBlock: { gap: spacing.sm },
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbCell: { width: 56, height: 56 },
  thumb: { width: 56, height: 56 },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgActions: { flexDirection: 'row', gap: spacing.sm },
  imgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  footer: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.canvas,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
  sheetRow: { flexDirection: 'row', gap: spacing.md },
  pickScroll: { flexGrow: 0 },
  pickCell: { width: 88, height: 88, marginRight: spacing.sm },
  pickImg: { width: 88, height: 88 },
  pickBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickBadgeMuted: { backgroundColor: colors.meta },
});
