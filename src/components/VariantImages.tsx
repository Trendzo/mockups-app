import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppImage } from './AppImage';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { ImageViewer } from './ImageViewer';
import { PressableScale } from './PressableScale';
import { SegmentedControl } from './SegmentedControl';
import { StatusTicker } from './StatusTicker';
import { useToast } from './Toast';
import { RootStackParamList } from '../navigation/types';
import { createMockupsFromUrl } from '../api/mockups';
import { uploadLocalImage } from '../screens/ProductWizard/pickImages';
import { setCameraSink } from '../screens/ProductWizard/cameraSink';
import { Mode } from '../types/enums';
import { colors, radii, spacing } from '../theme/theme';

/** Generate a product-only shot, or on a male / female model. */
type ModelKind = 'product' | 'him' | 'her';

// Status copy shown while a variant mockup generates (like the Generating screen).
const GEN_STATUS = [
  'Reading your garment…',
  'Setting the studio light…',
  'Rendering the front view…',
  'Almost there - polishing pixels…',
];

/** Front + back. Two slots is the whole product contract for a variant. */
export const VARIANT_MAX_PHOTOS = 2;

/**
 * A variant's photos: two 3:4 slots (tap an empty one to shoot it), plus
 * optional AI mockup generation from the first photo.
 *
 * The caller owns both the photos and the generated-but-unadopted preview, so
 * the wizard can park the preview in its draft (surviving step navigation)
 * while simpler screens keep it in local state.
 */
export function VariantImages({
  imageUrls,
  onAddImages,
  onRemoveImage,
  allowMockup = false,
  generated = [],
  onGeneratedChange,
  onPickFromGallery,
  galleryDisabled = false,
}: {
  imageUrls: string[];
  onAddImages: (urls: string[]) => void;
  onRemoveImage: (i: number) => void;
  /** Show the mockup generator. */
  allowMockup?: boolean;
  /** Generated mockups awaiting "Use these". */
  generated?: string[];
  onGeneratedChange?: (urls: string[]) => void;
  /** Show a "From gallery" action (copies the product's photos into a slot). */
  onPickFromGallery?: () => void;
  galleryDisabled?: boolean;
}) {
  const toast = useToast();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [shooting, setShooting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [modelKind, setModelKind] = useState<ModelKind>('product');
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const setGenerated = (urls: string[]) => onGeneratedChange?.(urls);

  const addImages = (urls: string[]) => {
    const capped = urls.slice(0, Math.max(0, VARIANT_MAX_PHOTOS - imageUrls.length));
    if (capped.length) onAddImages(capped);
  };
  // Replace all photos with a new set (used to promote generated mockups).
  const replaceImages = (urls: string[]) => {
    for (let i = imageUrls.length - 1; i >= 0; i--) onRemoveImage(i);
    onAddImages(urls.slice(0, VARIANT_MAX_PHOTOS));
    // These are now the variant's photos - clear the preview so the card doesn't
    // keep offering to re-adopt mockups it already applied.
    setGenerated([]);
  };

  // Slots fill in order (front, then back). Capturing the front camera opens it
  // labelled FRONT; the back slot opens it labelled BACK.
  const shoot = (slotIndex: number) => {
    if (shooting || slotIndex >= VARIANT_MAX_PHOTOS) return;
    setCameraSink(async (uri) => {
      setShooting(true); // spinner shows during upload only (camera cancel = no-op)
      try {
        const url = await uploadLocalImage(uri);
        addImages([url]); // appends into slotIndex (the first empty)
      } catch (e: any) {
        toast.show(e?.message ?? 'Upload failed', 'error');
      } finally {
        setShooting(false);
      }
    });
    navigation.navigate('Capture', { slot: slotIndex === 0 ? 'front' : 'back', sink: 'custom' });
  };

  // Generate mockups from the first photo. Product = flat (no model); Him/Her
  // = on a male/female model. Front views only - no back / hanger / flat-lay.
  const generate = async () => {
    const source = imageUrls[0];
    if (generating || !source) return;
    setGenerating(true);
    try {
      const useModel = modelKind !== 'product';
      const images = await createMockupsFromUrl(
        source,
        useModel ? Mode.WithModel : Mode.WithoutModel,
        useModel ? (modelKind as 'him' | 'her') : undefined,
      );
      const fronts = images.filter((im) => !/back|hanger|flat/i.test(im.name));
      const urls = (fronts.length ? fronts : images).map((im) => im.url).slice(0, 2);
      if (!urls.length) throw new Error('No mockups returned');
      // Drop the source photo we generated from - the mockups take its place.
      const srcIdx = imageUrls.indexOf(source);
      if (srcIdx >= 0) onRemoveImage(srcIdx);
      setGenerated(urls);
      toast.show('Mockup ready', 'success');
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not generate mockups', 'error');
    } finally {
      setGenerating(false);
    }
  };

  // Needs a source photo and room for the result. Once both slots are full the
  // photos are final - hide it.
  const canGenerate =
    allowMockup && imageUrls.length > 0 && imageUrls.length < VARIANT_MAX_PHOTOS;

  return (
    <View style={styles.imgBlock}>
      <AppText variant="sectionLabel" color={colors.meta}>
        Photos · front & back (max {VARIANT_MAX_PHOTOS})
      </AppText>
      {/* Two 3:4 slots; an empty slot opens the camera. */}
      <View style={styles.photoSlotRow}>
        {[0, 1].map((i) => {
          const url = imageUrls[i];
          if (url) {
            return (
              <PressableScale
                key={`${url}-${i}`}
                onPress={() => setViewerIndex(i)}
                toScale={0.98}
                style={styles.photoSlot}
              >
                <AppImage
                  uri={url}
                  radius={radii.sm}
                  resizeMode="contain"
                  containerStyle={styles.photoSlotFill}
                />
                <PressableScale
                  onPress={() => onRemoveImage(i)}
                  style={styles.thumbRemove}
                  toScale={0.9}
                >
                  <Icon name="close" size={12} color={colors.surface} />
                </PressableScale>
              </PressableScale>
            );
          }
          // Only the first empty slot is active; fill front before back so a
          // capture never lands in two slots and the label always matches.
          const active = i === imageUrls.length;
          return (
            <PressableScale
              key={`empty-${i}`}
              onPress={() => shoot(i)}
              haptic={false}
              disabled={!active || shooting}
              style={[
                styles.photoSlot,
                styles.photoSlotEmpty,
                !active && styles.photoSlotMuted,
              ]}
            >
              {shooting && active ? (
                <ActivityIndicator size="small" color={colors.ink} />
              ) : (
                <>
                  <Icon name="camera-outline" size={22} color={colors.inkMuted} />
                  <AppText variant="meta" color={colors.meta}>
                    {i === 0 ? 'Front' : 'Back'}
                  </AppText>
                </>
              )}
            </PressableScale>
          );
        })}
      </View>

      {onPickFromGallery ? (
        <PressableScale
          onPress={onPickFromGallery}
          style={styles.galleryBtn}
          haptic={false}
          disabled={galleryDisabled || imageUrls.length >= VARIANT_MAX_PHOTOS}
        >
          <Icon name="images-outline" size={15} color={colors.ink} />
          <AppText variant="meta" color={colors.ink}>
            From gallery
          </AppText>
        </PressableScale>
      ) : null}

      {/* Mockup generation: pick the subject, then the black CTA. */}
      {canGenerate ? (
        <>
          <SegmentedControl<ModelKind>
            compact
            value={modelKind}
            onChange={setModelKind}
            options={[
              { value: 'product', label: 'Product' },
              { value: 'him', label: 'Him' },
              { value: 'her', label: 'Her' },
            ]}
          />
          <PressableScale onPress={generate} disabled={generating} style={styles.genCta}>
            {generating ? (
              <ActivityIndicator color={colors.accentInk} />
            ) : (
              <>
                <Icon name="sparkles" size={18} color={colors.accentInk} />
                <AppText variant="bodyMedium" color={colors.accentInk}>
                  Generate mockup
                </AppText>
              </>
            )}
          </PressableScale>
        </>
      ) : null}

      {/* Status copy while generating (mirrors the Generating screen). */}
      {generating ? (
        <StatusTicker
          messages={GEN_STATUS}
          color={colors.meta}
          style={styles.genStatus}
        />
      ) : null}

      {/* Generated mockups - tap to open full-screen; "Use these" sets them as
          the variant photos. */}
      {allowMockup && generated.length ? (
        <View style={styles.genBlock}>
          <View style={styles.genHead}>
            <AppText variant="sectionLabel" color={colors.meta}>
              Generated mockup{generated.length > 1 ? 's' : ''}
            </AppText>
            <PressableScale onPress={() => replaceImages(generated)} haptic={false}>
              <AppText variant="meta" color={colors.ink}>
                Use these
              </AppText>
            </PressableScale>
          </View>
          <View style={styles.photoSlotRow}>
            {generated.map((url, i) => (
              <PressableScale
                key={`${url}-${i}`}
                onPress={() => setViewerIndex(imageUrls.length + i)}
                toScale={0.98}
                style={styles.photoSlot}
              >
                <AppImage
                  uri={url}
                  radius={radii.sm}
                  resizeMode="contain"
                  containerStyle={styles.photoSlotFill}
                />
              </PressableScale>
            ))}
          </View>
        </View>
      ) : null}

      {/* One viewer over the variant's photos AND the generated preview, so
          either can be opened full-screen. */}
      <ImageViewer
        visible={viewerIndex != null}
        images={[...imageUrls, ...generated].map((url) => ({ url }))}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  galleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
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
});
