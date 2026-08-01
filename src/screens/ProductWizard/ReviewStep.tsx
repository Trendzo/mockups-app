import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppImage,
  AppText,
  Banner,
  Icon,
  KeyboardStickyView,
  PressableScale,
  PrimaryButton,
  Screen,
} from '../../components';
import { ScreenProps } from '../../navigation/types';
import { useCatalogBrands, useCatalogCategories } from '../../api/catalogHooks';
import { commitProductDraft, validateProductDraft } from '../../api/productCommit';
import { ColorDraft, SingleVariantDraft, useProductDraft } from '../../store/productDraft';
import { formatPaise, parseRupeesToPaise } from '../../utils/money';
import { colors, radii, spacing } from '../../theme/theme';
import { WizardHeader } from './WizardHeader';
import { useExitWizardToHome } from './useExitToHome';

const GENDER_LABEL: Record<string, string> = { her: 'Women', him: 'Men', unisex: 'Unisex' };
const POLICY_LABEL: Record<string, string> = {
  return: 'Return',
  replace: 'Replace',
  final_sale: 'Final sale',
};

export function ReviewStep({ navigation }: ScreenProps<'ProductWizardReview'>) {
  const d = useProductDraft();
  const qc = useQueryClient();
  const exitHome = useExitWizardToHome();
  const brandsQ = useCatalogBrands();
  const categoriesQ = useCatalogCategories();

  const [busy, setBusy] = useState<false | 'draft' | 'publish'>(false);
  const [error, setError] = useState<string | null>(null);

  const brandName = brandsQ.data?.find((b) => b.id === d.brandId)?.name ?? '-';
  // Show the full path ("Tops › T-Shirts") — leaf labels repeat across the taxonomy,
  // so the leaf alone doesn't tell the retailer what they actually picked.
  const categoryLabel = (() => {
    const cat = categoriesQ.data?.find((c) => c.id === d.categoryId);
    if (!cat) return '-';
    const parent = cat.parentId ? categoriesQ.data?.find((c) => c.id === cat.parentId) : undefined;
    return parent ? `${parent.label} › ${cat.label}` : cat.label;
  })();
  const gender = d.genders.length >= 2 ? 'unisex' : d.genders[0] ?? 'unisex';

  const commit = async (publish: boolean) => {
    const problems = validateProductDraft(publish);
    if (problems.length) {
      setError(`Complete these before saving: ${problems.join(', ')}.`);
      return;
    }
    setBusy(publish ? 'publish' : 'draft');
    setError(null);
    try {
      const listing = await commitProductDraft({ publish });
      qc.invalidateQueries({ queryKey: ['listings'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['listing', listing.id] });
      const id = listing.id;
      navigation.reset({
        index: 1,
        routes: [{ name: 'Main' }, { name: 'ProductDetail', params: { id } }],
      });
      // Clear the draft after navigating away so this screen doesn't re-render empty.
      d.startCreate();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save the product');
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top']}>
      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <WizardHeader step={4} onBack={exitHome} />

        {error ? <Banner tone="danger" title="Couldn't save" message={error} /> : null}

        {/* Gallery */}
        {d.gallery.length ? (
          <Section title="Images" onEdit={() => navigation.navigate('ProductWizardBasics')}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {d.gallery.map((url, i) => (
                <View key={`${url}-${i}`} style={styles.galleryCell}>
                  <AppImage uri={url} radius={radii.sm} containerStyle={styles.galleryImg} />
                  {i === 0 ? (
                    <View style={styles.primaryBadge}>
                      <AppText variant="navCounter" color={colors.accentInk}>
                        PRIMARY
                      </AppText>
                    </View>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </Section>
        ) : null}

        {/* Basics */}
        <Section title="Basic information" onEdit={() => navigation.navigate('ProductWizardBasics')}>
          <Row label="Name" value={d.name || '-'} />
          <Row label="Brand" value={brandName} />
          <Row label="Category" value={categoryLabel} />
          <Row label="Gender" value={GENDER_LABEL[gender]} />
        </Section>

        {/* Variants */}
        <Section title="Variants & pricing" onEdit={() => navigation.navigate('ProductWizardVariants')}>
          {d.variantMode === 'single' ? (
            <SingleSummary single={d.single} />
          ) : (
            d.colors.map((c) => <ColorSummary key={c.id} color={c} />)
          )}
        </Section>

        {/* Details */}
        <Section title="Product details" onEdit={() => navigation.navigate('ProductWizardDetails')}>
          <Row label="Return policy" value={POLICY_LABEL[d.listingPolicy] ?? d.listingPolicy} />
          {d.hsn ? <Row label="HSN" value={d.hsn} /> : null}
          {d.occasion.length ? <Row label="Occasion" value={d.occasion.join(', ')} /> : null}
          {d.ageGroups.length ? <Row label="Age groups" value={d.ageGroups.join(', ')} /> : null}
          {d.description ? <Row label="Description" value={d.description} /> : null}
        </Section>
      </ScrollView>

      <KeyboardStickyView style={styles.footer} minBottom={spacing.md}>
        <View style={styles.footerRow}>
          <PrimaryButton
            label={d.mode === 'edit' ? 'Save changes' : 'Save draft'}
            tone={d.mode === 'edit' ? 'accent' : 'surface'}
            style={styles.flex}
            loading={busy === 'draft'}
            disabled={busy === 'publish'}
            onPress={() => commit(false)}
          />
          {d.mode === 'create' || d.editingStatus === 'draft' ? (
            <PrimaryButton
              label="Publish"
              tone="accent"
              style={styles.flex}
              loading={busy === 'publish'}
              disabled={busy === 'draft'}
              onPress={() => commit(true)}
            />
          ) : null}
        </View>
      </KeyboardStickyView>
    </Screen>
  );
}

function Section({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <AppText variant="sectionLabel" color={colors.meta}>
          {title}
        </AppText>
        <PressableScale onPress={onEdit} haptic={false} style={styles.editLink}>
          <Icon name="create-outline" size={15} color={colors.ink} />
          <AppText variant="meta" color={colors.ink}>
            Edit
          </AppText>
        </PressableScale>
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="meta" color={colors.meta}>
        {label}
      </AppText>
      <AppText variant="bodyMedium" color={colors.ink}>
        {value}
      </AppText>
    </View>
  );
}

function priceText(price: string, mrp: string): string {
  const p = parseRupeesToPaise(price);
  const m = mrp.trim() ? parseRupeesToPaise(mrp) : null;
  const base = p != null ? formatPaise(p) : '-';
  return m != null ? `${base}  (MRP ${formatPaise(m)})` : base;
}

function SingleSummary({ single }: { single: SingleVariantDraft }) {
  return (
    <View style={styles.variantLine}>
      <View style={styles.flex}>
        <AppText variant="bodyMedium" color={colors.ink}>
          {priceText(single.price, single.mrp)}
        </AppText>
        <AppText variant="meta" color={colors.meta}>
          Stock {single.stock || '0'}
          {single.sku ? ` · ${single.sku}` : ''}
        </AppText>
      </View>
      <Thumbs urls={single.imageUrls} />
    </View>
  );
}

function ColorSummary({ color }: { color: ColorDraft }) {
  return (
    <View style={styles.colorBlock}>
      <AppText variant="bodyMedium" color={colors.ink}>
        {color.name || 'Color'}
        {color.colorHex ? ` (${color.colorHex})` : ''}
      </AppText>
      {color.sizes.map((row) => (
        <View key={row.id} style={styles.variantLine}>
          <View style={styles.flex}>
            <AppText variant="meta" color={colors.ink}>
              {row.size || '-'} · {priceText(row.price, row.mrp)}
            </AppText>
            <AppText variant="meta" color={colors.meta}>
              Stock {row.stock || '0'}
              {row.sku ? ` · ${row.sku}` : ''}
            </AppText>
          </View>
          <Thumbs urls={row.imageUrls} />
        </View>
      ))}
    </View>
  );
}

function Thumbs({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return (
    <View style={styles.thumbs}>
      {urls.slice(0, 3).map((url, i) => (
        <AppImage key={`${url}-${i}`} uri={url} radius={radii.sm} containerStyle={styles.thumb} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.lg },
  section: { gap: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.md,
  },
  row: { gap: 2 },
  galleryCell: { width: 96, height: 120, marginRight: spacing.sm },
  galleryImg: { width: 96, height: 120 },
  primaryBadge: {
    position: 'absolute',
    left: 4,
    top: 4,
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  variantLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  colorBlock: { gap: spacing.sm },
  thumbs: { flexDirection: 'row', gap: 4 },
  thumb: { width: 40, height: 40 },
  footer: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.canvas,
  },
  footerRow: { flexDirection: 'row', gap: spacing.md },
});
