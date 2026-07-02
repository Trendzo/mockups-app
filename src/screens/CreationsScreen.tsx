import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  AppImage,
  AppText,
  Icon,
  PressableScale,
  PrimaryButton,
  Screen,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { RecentSubmission, useSession } from '../store/session';
import { SubmissionStatus, prettyView } from '../types/enums';
import { colors, radii, spacing } from '../theme/theme';

const STATUS_LABEL: Record<string, string> = {
  [SubmissionStatus.ReadyForReview]: 'Ready for review',
  [SubmissionStatus.Accepted]: 'Accepted',
  [SubmissionStatus.Rejected]: 'Rejected',
  [SubmissionStatus.Failed]: 'Failed',
  [SubmissionStatus.Submitted]: 'Processing',
  [SubmissionStatus.Processing]: 'Processing',
  [SubmissionStatus.Regenerating]: 'Regenerating',
};

/** History of everything generated (persisted in the session store). */
export function CreationsScreen({ navigation }: ScreenProps<'Creations'>) {
  const recent = useSession((s) => s.recent);
  const remove = useSession((s) => s.remove);

  const open = (item: RecentSubmission) => {
    navigation.navigate('ReviewResults', {
      submission: {
        id: item.id,
        mode: item.mode,
        status: item.status,
        rawPhotos: item.rawPhotos,
        outputUrls: item.outputUrls,
      },
    });
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.header}>
        <PressableScale onPress={() => navigation.goBack()} style={styles.back}>
          <Icon name="chevron-back" size={24} color={colors.ink} />
        </PressableScale>
        <View>
          <AppText variant="sectionLabel" color={colors.meta}>
            Your work
          </AppText>
          <AppText variant="cardTitle" color={colors.ink} style={styles.title}>
            Creations
          </AppText>
        </View>
        <View style={styles.back} />
      </View>

      {recent.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="images" size={44} color={colors.inkMuted} />
          <AppText variant="body" color={colors.meta} style={styles.emptyText}>
            Nothing yet. Generate your first mockup and it'll show up here.
          </AppText>
          <PrimaryButton
            label="New mockup"
            tone="accent"
            fullWidth={false}
            onPress={() => navigation.navigate('SelectPhotos')}
          />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        >
          {recent.map((item) => (
            <PressableScale
              key={item.id}
              onPress={() => open(item)}
              toScale={0.98}
              style={styles.row}
            >
              <AppImage
                uri={item.outputUrls[0] ?? item.rawPhotos[0]}
                radius={radii.sm + 4}
                containerStyle={styles.thumb}
              />
              <View style={styles.rowText}>
                <AppText variant="bodyMedium" color={colors.ink} numberOfLines={1}>
                  {item.name ?? prettyView(item.mode.replace('_', '-'))}
                </AppText>
                <AppText variant="meta" color={colors.meta}>
                  {STATUS_LABEL[item.status] ?? item.status} ·{' '}
                  {item.outputUrls.length} image
                  {item.outputUrls.length === 1 ? '' : 's'}
                </AppText>
              </View>
              <PressableScale
                onPress={() => remove(item.id)}
                toScale={0.9}
                style={styles.remove}
              >
                <Icon name="trash-outline" size={18} color={colors.meta} />
              </PressableScale>
            </PressableScale>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    marginBottom: spacing.lg,
  },
  back: { width: 40, alignItems: 'flex-start' },
  title: { fontSize: 24, lineHeight: 28, textAlign: 'center' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  emptyText: { textAlign: 'center' },
  list: { gap: spacing.md, paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.sm + 2,
  },
  thumb: { width: 64, height: 80 },
  rowText: { flex: 1, gap: 2 },
  remove: { padding: spacing.sm },
});
