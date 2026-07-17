import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  Chip,
  Field,
  Icon,
  KeyboardStickyView,
  PressableScale,
  PrimaryButton,
  Screen,
  SegmentedControl,
  Select,
  VariantImages,
} from '../../components';
import { ScreenProps } from '../../navigation/types';
import { ColorDraft, SingleVariantDraft, useProductDraft } from '../../store/productDraft';
import { useCatalogSizeScales } from '../../api/catalogHooks';
import { SizeScale } from '../../types/catalog';
import { parseRupeesToPaise } from '../../utils/money';
import { colors, radii, spacing } from '../../theme/theme';
import { WizardHeader } from './WizardHeader';
import { useExitWizardToHome } from './useExitToHome';
import { ColorPickerSheet } from './ColorPickerSheet';

// Colour choices offered in the dropdown (plus "Custom…" → full picker).
const COLOR_PALETTE: { name: string; hex: string }[] = [
  { name: 'Black', hex: '#111111' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Grey', hex: '#9AA0A6' },
  { name: 'Navy', hex: '#1F2A44' },
  { name: 'Blue', hex: '#2563EB' },
  { name: 'Red', hex: '#E5484D' },
  { name: 'Green', hex: '#2E7D32' },
  { name: 'Olive', hex: '#6B7A3A' },
  { name: 'Yellow', hex: '#F5C518' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Purple', hex: '#7C3AED' },
  { name: 'Brown', hex: '#7B4B2A' },
  { name: 'Beige', hex: '#D9C6A5' },
];
const CUSTOM_COLOR = 'custom';

// Carousel geometry: full-bleed track with gutters equal to the screen's
// standard padding, so the centred card is EXACTLY as wide as every other
// card; neighbours peek in the gutters and the "+" floats at the right edge.
const SCREEN_W = Dimensions.get('window').width;
const SIDE = spacing.screenH; // gutters match the normal screen padding
const CARD_GAP = spacing.sm;
const CARD_W = SCREEN_W - SIDE * 2;

/** Validate one variant's stock + optional price override ('' = use base). */
function variantErrors(
  prefix: string,
  v: { price: string; stock: string },
): Record<string, string> {
  const e: Record<string, string> = {};
  if (v.price.trim()) {
    const price = parseRupeesToPaise(v.price);
    if (price == null || price <= 0) e[`${prefix}price`] = 'Valid price';
  }
  const st = Number(v.stock);
  if (!Number.isInteger(st) || st < 0) e[`${prefix}stock`] = '≥ 0';
  return e;
}

export function VariantsStep({ navigation }: ScreenProps<'ProductWizardVariants'>) {
  const d = useProductDraft();
  const exitHome = useExitWizardToHome();
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
    // padded={false}: the ScrollView must span the full screen width, otherwise
    // it clips the full-bleed carousel (and swallows the "+" button). The
    // standard horizontal padding moves onto the scroll content instead.
    <Screen edges={['top']} padded={false}>
      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <WizardHeader step={2} onBack={exitHome} />

        <SegmentedControl<'single' | 'color_size'>
          compact
          value={d.variantMode}
          onChange={d.setVariantMode}
          options={[
            { value: 'single', label: 'Single product' },
            { value: 'color_size', label: 'Color variants' },
          ]}
        />
        {d.mode === 'edit' && d.editingVariantMode && d.variantMode !== d.editingVariantMode ? (
          <View style={styles.lockRow}>
            <Icon name="information-circle-outline" size={14} color={colors.meta} />
            <AppText variant="meta" color={colors.meta} style={styles.flex}>
              Switching the type replaces this product's existing variants when you save.
            </AppText>
          </View>
        ) : null}

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

      {/* Page-level floating "+" to add a colour variant (colour mode only). */}
      {d.variantMode === 'color_size' ? (
        <PressableScale onPress={d.addColor} style={styles.pageFab}>
          <Icon name="add" size={28} color={colors.accentInk} />
        </PressableScale>
      ) : null}

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
      {/* Pricing lives in Basics (step 1); this card is size/stock/photos only. */}
      <View style={styles.priceRow}>
        <Field
          containerStyle={styles.flex}
          boxed
          label="Size"
          value={value.size}
          onChangeText={(v) => onChange({ size: v })}
          placeholder="M / Free Size"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Field
          containerStyle={styles.flex}
          boxed
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
        boxed
        value={value.sku}
        onChangeText={(v) => onChange({ sku: v })}
        placeholder="Auto-generated if blank"
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {/* No per-variant photo slots for a single product - its images come from
          the main gallery in Basics (step 1). */}
    </View>
  );
}

/**
 * Colour variants as a horizontal carousel: one card per colour, swipe left /
 * right between them, and a floating "+" (vertically centred at the right
 * edge) slides the current card out and brings in a fresh one.
 */
function ColorVariantsEditor({ errors }: { errors: Record<string, string> }) {
  const d = useProductDraft();
  // Category-aware size scales from the backend (same /catalog/size-scales the
  // web portal wizard uses); universal scales come back even without a category.
  const scalesQ = useCatalogSizeScales(d.categoryId);
  const scales = scalesQ.data ?? [];
  const scrollRef = useRef<ScrollView>(null);
  const [active, setActive] = useState(0);

  const goTo = (idx: number) => {
    scrollRef.current?.scrollTo({ x: idx * (CARD_W + CARD_GAP), animated: true });
    setActive(idx);
  };

  // When a variant is added (from the page "+"), slide the carousel to it.
  const count = d.colors.length;
  const prevCount = useRef(count);
  useEffect(() => {
    if (count > prevCount.current) setTimeout(() => goTo(count - 1), 80);
    prevCount.current = count;
  }, [count]);

  return (
    <View style={styles.block}>
      {/* Size options follow the category picked in Basics (no manual picker). */}
      <View style={styles.carouselWrap}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_W + CARD_GAP}
          decelerationRate="fast"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.carouselContent}
          onMomentumScrollEnd={(e) =>
            setActive(Math.round(e.nativeEvent.contentOffset.x / (CARD_W + CARD_GAP)))
          }
        >
          {d.colors.map((color, ci) => (
            <View key={color.id} style={styles.cardSlot}>
              <ColorCard color={color} index={ci} errors={errors} scales={scales} />
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Position dots - which variant you're on. */}
      {d.colors.length > 1 ? (
        <View style={styles.dotsRow}>
          {d.colors.map((c, i) => (
            <PressableScale key={c.id} onPress={() => goTo(i)} haptic={false} hitSlop={6}>
              <View style={[styles.dot, i === active && styles.dotOn]} />
            </PressableScale>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ColorCard({
  color,
  index,
  errors,
  scales,
}: {
  color: ColorDraft;
  index: number;
  errors: Record<string, string>;
  scales: SizeScale[];
}) {
  const d = useProductDraft();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customSize, setCustomSize] = useState('');
  // Which scale's chips show (Letter/Waist for apparel, UK/US/EU for footwear…).
  const [scaleId, setScaleId] = useState<string | null>(null);
  const activeScale = scales.find((s) => s.id === scaleId) ?? scales[0];
  const first = color.sizes[0];
  const price = first?.price ?? '';
  const chosen = color.sizes.map((r) => r.size).filter(Boolean);
  // A custom colour = a hex that isn't one of the presets.
  const isCustom =
    !!color.colorHex &&
    !COLOR_PALETTE.some((c) => c.hex.toUpperCase() === color.colorHex!.toUpperCase());
  const isSel = (label: string) => chosen.some((s) => s.toUpperCase() === label.toUpperCase());

  const toggleSize = (label: string) => {
    const has = isSel(label);
    const labels = has
      ? chosen.filter((s) => s.toUpperCase() !== label.toUpperCase())
      : [...chosen, label];
    d.setColorSizes(color.id, labels, { price, mrp: '' });
  };

  const onColorChange = (v: string[]) => {
    const val = v[0];
    if (!val) return;
    if (val === CUSTOM_COLOR) {
      setPickerOpen(true);
      return;
    }
    const c = COLOR_PALETTE.find((p) => p.hex === val);
    d.updateColor(color.id, { name: c?.name ?? '', colorHex: val });
  };

  // Colour images = the same set on every size of this colour.
  const imgs = first?.imageUrls ?? [];
  const addImgs = (urls: string[]) =>
    color.sizes.forEach((r) => d.addVariantImages({ colorId: color.id, rowId: r.id }, urls));
  const removeImg = (i: number) =>
    color.sizes.forEach((r) => d.removeVariantImage({ colorId: color.id, rowId: r.id }, i));

  return (
    <View style={styles.card}>
      <View style={styles.colorHead}>
        <View style={styles.colorHeadLeft}>
          <View style={[styles.swatchLg, { backgroundColor: color.colorHex || colors.canvas }]} />
          <AppText variant="bodyMedium" color={colors.ink}>
            {color.name || `Variant ${index + 1}`}
          </AppText>
        </View>
        <PressableScale onPress={() => d.removeColor(color.id)} haptic={false}>
          <Icon name="trash-outline" size={18} color={colors.danger} />
        </PressableScale>
      </View>

      {/* Left: colour dropdown · right: this colour's selling price
          (MRP + default price live in Basics; empty here = use the default). */}
      <View style={styles.priceRow}>
        <View style={styles.flex}>
          <Select
            label="Color"
            boxed
            placeholder="Choose"
            options={[
              // Real swatches in the sheet + on the field itself.
              ...COLOR_PALETTE.map((c) => ({ value: c.hex, label: c.name, swatch: c.hex })),
              {
                value: CUSTOM_COLOR,
                label: 'Custom color…',
                swatch: isCustom ? color.colorHex : undefined,
              },
            ]}
            selected={color.colorHex ? [isCustom ? CUSTOM_COLOR : color.colorHex] : []}
            onChange={onColorChange}
          />
        </View>
        <Field
          containerStyle={styles.flex}
          boxed
          label="Selling price"
          prefix="₹"
          keyboardType="decimal-pad"
          value={price}
          onChangeText={(v) => d.setColorPricing(color.id, { price: v, mrp: '' })}
          placeholder="Default"
          error={errors[`${first?.id}.price`]}
        />
      </View>

      <ColorPickerSheet
        visible={pickerOpen}
        initialHex={color.colorHex}
        onClose={() => setPickerOpen(false)}
        onPick={(hex) => {
          d.updateColor(color.id, { colorHex: hex, name: color.name || 'Custom' });
          setPickerOpen(false);
        }}
      />

      {/* Sizes as toggle chips - options follow the category's size scales. */}
      <AppText variant="sectionLabel" color={colors.meta}>Sizes</AppText>
      {scales.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chipsRow}
        >
          {scales.map((s) => (
            <Chip
              key={s.id}
              label={s.name}
              selected={s.id === activeScale?.id}
              onPress={() => setScaleId(s.id)}
            />
          ))}
        </ScrollView>
      ) : null}
      {activeScale && activeScale.values.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chipsRow}
        >
          {activeScale.values.map((label) => (
            <Chip key={label} label={label} selected={isSel(label)} onPress={() => toggleSize(label)} />
          ))}
        </ScrollView>
      ) : null}
      {/* Type a size and hit return - no extra "+" button. */}
      <Field
        boxed
        label="Add a custom size"
        value={customSize}
        onChangeText={setCustomSize}
        placeholder="e.g. 4XL"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={() => {
          const s = customSize.trim();
          if (s && !isSel(s)) toggleSize(s);
          setCustomSize('');
        }}
      />

      {chosen.length > 0 ? (
        <View style={styles.stockList}>
          {color.sizes
            .filter((r) => r.size)
            .map((r) => (
              <View key={r.id} style={styles.stockRow}>
                <View style={styles.sizePill}>
                  <AppText variant="meta" color={colors.ink}>{r.size}</AppText>
                </View>
                <Field
                  containerStyle={styles.flex}
                  boxed
                  label="Stock"
                  keyboardType="number-pad"
                  value={r.stock}
                  onChangeText={(v) => d.updateSizeRow(color.id, r.id, { stock: v })}
                  placeholder="0"
                  error={errors[`${r.id}.stock`]}
                />
              </View>
            ))}
        </View>
      ) : (
        <AppText variant="meta" color={colors.meta}>Tap sizes above to add them.</AppText>
      )}

      {/* The generated preview lives in the draft (keyed by colour) so it
          survives a detour to Details and back - local state would be lost. */}
      <VariantImages
        imageUrls={imgs}
        onAddImages={addImgs}
        onRemoveImage={removeImg}
        allowMockup
        generated={d.variantMockups[color.id] ?? []}
        onGeneratedChange={(urls) => d.setVariantMockups(color.id, urls)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // paddingTop must match Basics/Details/Review exactly - a different value
  // makes the shared header jump when hopping between wizard steps. Horizontal
  // padding lives here (not on Screen) so the carousel can break out full-bleed.
  content: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.screenH,
    gap: spacing.md,
  },
  block: { gap: spacing.md },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.sm + 2,
    gap: spacing.sm,
  },
  priceRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  colorHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  colorHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  swatchLg: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  // Carousel - break out of the screen's horizontal padding on BOTH sides so
  // the centred card has equal gutters left and right.
  carouselWrap: { marginHorizontal: -spacing.screenH },
  carouselContent: { paddingHorizontal: SIDE },
  cardSlot: { width: CARD_W, marginRight: CARD_GAP },
  // Screen-level FAB: fixed bottom-right of the page, floating above the footer.
  pageFab: {
    position: 'absolute',
    right: spacing.screenH,
    bottom: 132, // clear of the "Next" footer button
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.inkMuted,
  },
  dotOn: { width: 16, backgroundColor: colors.ink },
  chipsRow: { flexDirection: 'row', gap: spacing.xs + 2, paddingRight: spacing.sm },
  stockList: { gap: spacing.xs + 2 },
  stockRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  sizePill: {
    minWidth: 44,
    height: 48,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm + 2,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imgBlock: { gap: spacing.xs + 2 },
  photoSlotRow: { flexDirection: 'row', gap: spacing.sm },
  photoSlot: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: radii.sm + 4,
    overflow: 'hidden',
    backgroundColor: colors.canvas,
  },
  photoSlotFill: { width: '100%', height: '100%' },
  photoSlotEmpty: {
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  photoSlotMuted: { opacity: 0.45 },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: radii.sm + 4,
    backgroundColor: colors.ink,
  },
  genBlock: { gap: spacing.xs + 2 },
  genHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  genStatus: { textAlign: 'center', fontSize: 13 },
  footer: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.screenH, // Screen is unpadded on this step
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.canvas,
  },
});
