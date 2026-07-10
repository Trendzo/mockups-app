import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { AppImage, AppText, Icon, PrimaryButton, Screen } from '../components';
import { ScreenProps } from '../navigation/types';
import { formatPaise } from '../utils/money';
import { GENDER_LABELS, LISTING_POLICY_LABELS } from '../types/enums';
import { colors, radii, spacing } from '../theme/theme';
import { Haptics } from '../utils/haptics';

/** Success screen — created draft listing + variant (§5.7). */
export function PublishSuccessScreen({
  navigation,
  route,
}: ScreenProps<'PublishSuccess'>) {
  const { listing, variant } = route.params.result;

  useEffect(() => {
    Haptics.success();
  }, []);

  const hero = listing.galleryUrls?.[0];

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Animated.View entering={ZoomIn.springify()} style={styles.badge}>
          <Icon name="checkmark" size={30} color={colors.accentInk} />
        </Animated.View>

        <AppText variant="sectionLabel" color={colors.meta}>
          Draft created
        </AppText>
        <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
          {listing.name}
        </AppText>

        {hero ? (
          <Animated.View entering={FadeInDown.delay(80)}>
            <AppImage
              uri={hero}
              radius={radii.card}
              resizeMode="cover"
              containerStyle={styles.hero}
            />
          </Animated.View>
        ) : null}

        <View style={styles.card}>
          <Row label="Current price" value={formatPaise(variant.pricePaise)} />
          {variant.compareAtPrice != null && (
            <Row label="MSP" value={formatPaise(variant.compareAtPrice)} />
          )}
          <Row label="Status" value={capitalize(listing.status)} />
          <Row label="Gender" value={GENDER_LABELS[listing.gender]} />
          <Row
            label="Policy"
            value={LISTING_POLICY_LABELS[listing.listingPolicy]}
          />
          <Row label="Stock" value={String(variant.stock)} />
          <Row label="Listing ID" value={listing.id} mono />
          <Row label="Variant ID" value={variant.id} mono />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label="Back to home"
          tone="accent"
          onPress={() => navigation.popToTop()}
        />
      </View>
    </Screen>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.row}>
      <AppText variant="meta" color={colors.meta}>
        {label}
      </AppText>
      <AppText
        variant="bodyMedium"
        color={colors.ink}
        numberOfLines={1}
        style={mono ? styles.mono : undefined}
      >
        {value}
      </AppText>
    </View>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.sm },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  h1: { fontSize: 26, lineHeight: 30, marginBottom: spacing.md },
  hero: {
    width: '100%',
    aspectRatio: 3 / 4,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  mono: { fontSize: 13, flexShrink: 1, textAlign: 'right' },
  footer: { paddingVertical: spacing.md },
});
