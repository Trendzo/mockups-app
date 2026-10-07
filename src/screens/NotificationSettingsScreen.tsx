import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  Banner,
  Chip,
  Divider,
  KeyboardStickyView,
  Panel,
  PrimaryButton,
  Screen,
  ScreenHeader,
  ToggleRow,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useNotificationPrefs, useSaveNotificationPrefs } from '../api/notifications';
import { errorMessage } from '../api/request';
import {
  LANGUAGE_LABEL,
  NotificationLanguage,
  NotificationPrefs,
} from '../types/notifications';
import { colors, spacing } from '../theme/theme';

const LANGUAGES = Object.keys(LANGUAGE_LABEL) as NotificationLanguage[];

/** How the store hears about orders, payouts and Trendzo updates. */
export function NotificationSettingsScreen({ navigation }: ScreenProps<'NotificationSettings'>) {
  const toast = useToast();
  const prefsQ = useNotificationPrefs();
  const save = useSaveNotificationPrefs();
  const [draft, setDraft] = useState<NotificationPrefs | null>(null);

  useEffect(() => {
    if (prefsQ.data && !draft) setDraft(prefsQ.data);
  }, [prefsQ.data, draft]);

  const set = (patch: Partial<NotificationPrefs>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const dirty = !!draft && !!prefsQ.data && JSON.stringify(draft) !== JSON.stringify(prefsQ.data);
  const noChannel = !!draft && !draft.pushEnabled && !draft.emailEnabled && !draft.smsEnabled;

  const onSave = () => {
    if (!draft || noChannel) return;
    save.mutate(draft, {
      onSuccess: () => toast.show('Notification settings saved', 'success'),
      onError: (e) => toast.show(errorMessage(e, 'Could not save settings'), 'error'),
    });
  };

  return (
    <Screen edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <ScreenHeader overline="Notifications" title="Alert settings" onBack={() => navigation.goBack()} />

        {prefsQ.isLoading ? (
          <ActivityIndicator color={colors.ink} style={styles.loader} />
        ) : prefsQ.isError || !draft ? (
          <Banner
            tone="danger"
            title="Couldn't load your settings"
            message={errorMessage(prefsQ.error)}
            actionLabel="Retry"
            onAction={() => prefsQ.refetch()}
          />
        ) : (
          <>
            <Panel title="Channels">
              <View style={styles.staticRow}>
                <AppText variant="bodyMedium" color={colors.ink}>
                  In-app inbox
                </AppText>
                <AppText variant="meta" color={colors.meta}>
                  Always on — the bell on your home screen
                </AppText>
              </View>
              <Divider />
              <ToggleRow
                label="Push notifications"
                hint="New orders and updates on this phone"
                value={draft.pushEnabled}
                onChange={(v) => set({ pushEnabled: v })}
              />
              <ToggleRow
                label="Email"
                hint="Sent to the owner email"
                value={draft.emailEnabled}
                onChange={(v) => set({ emailEnabled: v })}
              />
              <ToggleRow
                label="SMS"
                hint="Charged at carrier rates"
                value={draft.smsEnabled}
                onChange={(v) => set({ smsEnabled: v })}
              />
              {noChannel ? (
                <AppText variant="meta" color={colors.danger}>
                  Keep at least one of push, email or SMS on so you don't miss orders.
                </AppText>
              ) : null}
            </Panel>

            <Panel title="Summary">
              <ToggleRow
                label="Daily digest"
                hint="One morning email summarising yesterday's sales and orders"
                value={draft.dailyDigestEnabled}
                onChange={(v) => set({ dailyDigestEnabled: v })}
              />
            </Panel>

            <Panel title="Language">
              <AppText variant="meta" color={colors.meta}>
                Used for SMS and email alerts.
              </AppText>
              <View style={styles.chips}>
                {LANGUAGES.map((l) => (
                  <Chip
                    key={l}
                    label={LANGUAGE_LABEL[l]}
                    selected={draft.language === l}
                    onPress={() => set({ language: l })}
                  />
                ))}
              </View>
            </Panel>
          </>
        )}
      </ScrollView>

      {draft ? (
        <KeyboardStickyView style={styles.footer} minBottom={spacing.sm}>
          <PrimaryButton
            label="Save settings"
            tone="accent"
            loading={save.isPending}
            disabled={!dirty || noChannel}
            onPress={onSave}
          />
        </KeyboardStickyView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl, gap: spacing.md },
  loader: { marginTop: spacing.xl },
  staticRow: { gap: 2, paddingVertical: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: { paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.hairline },
});
