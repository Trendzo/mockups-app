import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppImage,
  AppText,
  Banner,
  BackButton,
  BottomSheet,
  Icon,
  ImageViewer,
  PressableScale,
  PrimaryButton,
  Screen,
  StatusChip,
  toneForStatus,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useListing } from '../api/catalogHooks';
import { deleteListing, updateListing } from '../api/catalogManagement';
import { useProductDraft } from '../store/productDraft';
import { useAuth } from '../store/auth';
import { canWriteCatalog, Variant } from '../types/catalog';
import { formatPaise } from '../utils/money';
import { shareRemoteImage } from '../utils/gallery';
import { colors, radii, spacing } from '../theme/theme';

const GENDER_LABEL: Record<string, string> = { her: 'Women', him: 'Men', unisex: 'Unisex' };
const POLICY_LABEL: Record<string, string> = {
  return: 'Return',
  replace: 'Replace',
  final_sale: 'Final sale',
};

export function ProductDetailScreen({ navigation, route }: ScreenProps<'ProductDetail'>) {
  const { id } = route.params;
  const toast = useToast();
  const qc = useQueryClient();
  const listingQ = useListing(id);
  const listing = listingQ.data;
  const canWrite = canWriteCatalog(useAuth((s) => s.retailer?.subRole));

  const [busy, setBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['listing', id] });
    qc.invalidateQueries({ queryKey: ['listings'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  const setStatus = async (status: 'active' | 'draft' | 'retired', okMsg: string) => {
    setBusy(true);
    try {
      await updateListing(id, { status });
      toast.show(okMsg, 'success');
      refresh();
      setMoreOpen(false);
    } catch (e: any) {
      // cannot_publish_incomplete lists what's missing in the message
      toast.show(e?.message ?? 'Could not update', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    setBusy(true);
    try {
      await deleteListing(id);
      toast.show('Product deleted', 'info');
      qc.invalidateQueries({ queryKey: ['listings'] });
      navigation.goBack();
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not delete', 'error');
      setBusy(false);
    }
  };

  if (listingQ.isLoading || !listing) {
    return (
      <Screen edges={['top', 'bottom']}>
        <BackButton onPress={() => navigation.goBack()} />
        {listingQ.isError ? (
          <Banner
            tone="danger"
            title="Couldn't load product"
            message={(listingQ.error as any)?.message}
            actionLabel="Retry"
            onAction={() => listingQ.refetch()}
          />
        ) : (
          <ActivityIndicator color={colors.ink} style={styles.loader} />
        )}
      </Screen>
    );
  }

  const variants = listing.variants ?? [];
  const gallery = listing.galleryUrls ?? [];

  return (
    <Screen edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <BackButton onPress={() => navigation.goBack()} />

        {gallery.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gallery}>
            {gallery.map((url, i) => (
              <PressableScale
                key={`${url}-${i}`}
                onPress={() => setViewerIndex(i)}
                toScale={0.98}
                style={styles.galleryImg}
              >
                <AppImage
                  uri={url}
                  radius={radii.card}
                  resizeMode="contain"
                  containerStyle={styles.galleryFill}
                />
              </PressableScale>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.titleRow}>
          <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
            {listing.name}
          </AppText>
          <StatusChip label={listing.status.replace(/_/g, ' ')} tone={toneForStatus(listing.status)} />
        </View>

        {listing.status === 'taken_down' && listing.takedownReason ? (
          <Banner tone="danger" title="Taken down" message={listing.takedownReason} />
        ) : null}

        <View style={styles.card}>
          <InfoRow label="Brand" value={listing.brand?.name ?? '-'} />
          <InfoRow label="Category" value={listing.category?.label ?? '-'} />
          <InfoRow label="Gender" value={GENDER_LABEL[listing.gender] ?? listing.gender} />
          <InfoRow label="Policy" value={POLICY_LABEL[listing.listingPolicy] ?? listing.listingPolicy} />
          {listing.hsn ? <InfoRow label="HSN" value={listing.hsn} /> : null}
          {listing.description ? <InfoRow label="Description" value={listing.description} /> : null}
          {listing.occasion?.length ? <InfoRow label="Occasion" value={listing.occasion.join(', ')} /> : null}
          {listing.ageGroups?.length ? <InfoRow label="Age groups" value={listing.ageGroups.join(', ')} /> : null}
        </View>

        {/* Variants */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText variant="sectionLabel" color={colors.meta}>
              Variants ({variants.length})
            </AppText>
            {canWrite ? (
              <PressableScale
                onPress={() => {
                  useProductDraft.getState().startEdit(listing);
                  navigation.navigate('ProductWizardVariants');
                }}
              >
                <AppText variant="bodyMedium" color={colors.ink}>
                  + Add
                </AppText>
              </PressableScale>
            ) : null}
          </View>
          {variants.length === 0 ? (
            <AppText variant="meta" color={colors.meta}>
              No variants yet. Add one with a price and stock to publish.
            </AppText>
          ) : (
            variants.map((v) => (
              <VariantRow
                key={v.id}
                variant={v}
                onPress={() =>
                  canWrite &&
                  navigation.navigate('VariantForm', {
                    listingId: id,
                    variantId: v.id,
                    mode: listing.variantMode,
                  })
                }
              />
            ))
          )}
        </View>

      </ScrollView>

      {canWrite ? (
        <View style={styles.footer}>
          {listing.status === 'draft' || listing.status === 'retired' ? (
            <PrimaryButton
              label="Publish"
              tone="accent"
              loading={busy}
              onPress={() => setStatus('active', 'Published')}
            />
          ) : listing.status === 'active' ? (
            <PrimaryButton
              label="Unpublish (to draft)"
              tone="surface"
              loading={busy}
              onPress={() => setStatus('draft', 'Moved to draft')}
            />
          ) : null}
          <View style={styles.footerRow}>
            <PrimaryButton
              label="Edit details"
              tone="ghost"
              style={styles.flex}
              onPress={() => {
                useProductDraft.getState().startEdit(listing);
                navigation.navigate('ProductWizardBasics');
              }}
            />
            <PrimaryButton
              label="More"
              tone="ghost"
              style={styles.flex}
              onPress={() => setMoreOpen(true)}
            />
          </View>
        </View>
      ) : null}

      <BottomSheet visible={moreOpen} onClose={() => setMoreOpen(false)}>
        <View style={styles.sheet}>
          <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
            Manage product
          </AppText>
          {listing.status !== 'retired' ? (
            <SheetAction icon="archive-outline" label="Retire" onPress={() => setStatus('retired', 'Retired')} />
          ) : null}
          {listing.status === 'draft' ? (
            <SheetAction icon="trash-outline" label="Delete draft" danger onPress={onDelete} />
          ) : null}
          <PrimaryButton label="Cancel" tone="surface" onPress={() => setMoreOpen(false)} />
        </View>
      </BottomSheet>

      <ImageViewer
        visible={viewerIndex != null}
        images={gallery.map((url) => ({ url }))}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
        onShare={(i) => shareRemoteImage(gallery[i]).catch(() => {})}
      />
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <AppText variant="meta" color={colors.meta}>
        {label}
      </AppText>
      <AppText variant="bodyMedium" color={colors.ink}>
        {value}
      </AppText>
    </View>
  );
}

function VariantRow({ variant, onPress }: { variant: Variant; onPress: () => void }) {
  const available = variant.stock - variant.reserved;
  return (
    <PressableScale onPress={onPress} toScale={0.99} style={styles.variantRow}>
      <View style={styles.flex}>
        <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
          {variant.attributesLabel || 'Default'}
        </AppText>
        <View style={styles.priceLine}>
          <AppText variant="meta" color={colors.ink}>
            {formatPaise(variant.pricePaise)}
          </AppText>
          {variant.compareAtPrice ? (
            <AppText variant="meta" color={colors.meta} style={styles.strike}>
              {formatPaise(variant.compareAtPrice)}
            </AppText>
          ) : null}
          {variant.sku ? (
            <AppText variant="meta" color={colors.meta}>
              · {variant.sku}
            </AppText>
          ) : null}
        </View>
      </View>
      <View style={styles.variantStock}>
        <AppText variant="bodyMedium" color={available <= 0 ? colors.danger : colors.ink}>
          {available}
        </AppText>
        <AppText variant="meta" color={colors.meta}>
          avail
        </AppText>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.meta} />
    </PressableScale>
  );
}

function SheetAction({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: string;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} toScale={0.98} style={styles.sheetAction}>
      <Icon name={icon} size={20} color={danger ? colors.danger : colors.ink} />
      <AppText variant="bodyMedium" color={danger ? colors.danger : colors.ink}>
        {label}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  loader: { marginTop: spacing.xl },
  gallery: { marginTop: spacing.xs },
  galleryImg: { width: 150, height: 190, marginRight: spacing.sm },
  galleryFill: { width: '100%', height: '100%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  h1: { flex: 1, fontSize: 24, lineHeight: 28 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.md,
  },
  infoRow: { gap: 2 },
  section: { gap: spacing.sm },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  variantStock: { alignItems: 'flex-end' },
  priceLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  strike: { textDecorationLine: 'line-through' },
  flex: { flex: 1 },
  footer: {
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  footerRow: { flexDirection: 'row', gap: spacing.md },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.canvas,
    borderRadius: radii.card,
    padding: spacing.md,
  },
});
