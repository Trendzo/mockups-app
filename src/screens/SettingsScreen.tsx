import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ListRow, Screen, ScreenHeader, SectionHeader, StatusChip } from '../components';
import { ScreenProps } from '../navigation/types';
import { useStoreGate } from '../navigation/useStoreGate';
import { usePermissions } from '../utils/usePermission';
import { spacing } from '../theme/theme';

/** App preferences and assistants. Account/store management stays on Profile. */
export function SettingsScreen({ navigation }: ScreenProps<'Settings'>) {
  const { can } = usePermissions();
  const gate = useStoreGate();
  // Chat creates and edits product drafts, so it follows the same rule as the product wizard.
  const canUseChatbot = can('listings.create') && can('listings.edit') && gate.abilities.editCatalog;

  return (
    <Screen edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenHeader overline="Account" title="Settings" onBack={() => navigation.goBack()} />

        <View style={styles.group}>
          <SectionHeader label="Preferences" />
          <ListRow
            icon="notifications-outline"
            label="Notification settings"
            hint="Channels, language and dashboard tiles"
            onPress={() => navigation.navigate('NotificationSettings')}
          />
        </View>

        <View style={styles.group}>
          <SectionHeader label="Assistants" />
          <ListRow
            icon="chatbubbles-outline"
            label="Chatbot"
            hint={
              canUseChatbot
                ? 'Add a product by chatting'
                : 'Needs permission to create and edit products'
            }
            right={<StatusChip label="BETA" tone="neutral" />}
            onPress={canUseChatbot ? () => navigation.navigate('ProductChat') : undefined}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.screenH, paddingBottom: spacing.xl, gap: spacing.lg },
  group: { gap: spacing.sm },
});
