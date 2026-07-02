import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  AppText,
  Card,
  FloatingNavBar,
  HeroHeadline,
  Icon,
  Screen,
  TwoCardGrid,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useSession } from '../store/session';
import { useCaptureDraft } from '../store/captureDraft';
import { colors, radii, spacing } from '../theme/theme';

/** Home (§5.1): stacked hero + signature two-card grid + floating nav. */
export function HomeScreen({ navigation }: ScreenProps<'Home'>) {
  const creations = useSession((s) => s.recent.length);
  const clearDraft = useCaptureDraft((s) => s.clear);

  const startNewMockup = () => {
    clearDraft();
    navigation.navigate('SelectPhotos');
  };

  return (
    <Screen edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.headerRow}>
          <AppText variant="sectionLabel" color={colors.meta}>
            Trenzo Studio
          </AppText>
        </View>

        <HeroHeadline
          align="center"
          fontSize={38}
          style={styles.headline}
          lines={[
            { text: 'Create' },
            { text: 'Mockups' },
            { text: 'Try It On', muted: true },
          ]}
        />

        <Animated.View entering={FadeInDown.delay(80).springify()}>
          <TwoCardGrid>
            <Card
              tone="yellow"
              titleTop="New"
              titleBottom="Mockup"
              meta="Capture → generate"
              onPress={startNewMockup}
              graphic={
                <Icon name="tshirt-crew" set="mci" size={60} color={colors.accentInk} />
              }
            />
            <Card
              tone="gray"
              titleTop="Virtual"
              titleBottom="Try-On"
              meta="Person + garments"
              onPress={() => navigation.navigate('TryOn')}
              graphic={
                <Icon name="hanger" set="mci" size={60} color={colors.cardGrayGraphic} />
              }
            />
          </TwoCardGrid>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).springify()}>
          <Card
            tone="surface"
            titleTop="Quick"
            titleBottom="Mockups"
            meta="Product + model, no review"
            height={150}
            onPress={startNewMockup}
            graphic={
              <Icon name="auto-fix" set="mci" size={40} color={colors.cardGrayGraphic} />
            }
          />
        </Animated.View>
      </ScrollView>

      <FloatingNavBar
        left={{
          icon: 'settings',
          muted: true,
          onPress: () => navigation.navigate('DevSettings'),
        }}
        center={{
          label: 'Creations',
          counter: creations,
          onPress: () => navigation.navigate('Creations'),
        }}
        right={{ icon: 'add', onPress: startNewMockup }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.lg,
    paddingBottom: 140,
    gap: spacing.md,
  },
  headerRow: { marginBottom: spacing.xs },
  headline: { marginBottom: spacing.lg },
});
