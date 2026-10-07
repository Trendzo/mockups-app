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
import { usePushPermission } from '../services/push';
import {
  DASHBOARD_TILES,
  DashboardTile,
  LANGUAGE_LABEL,
  NotificationLanguage,
  NotificationPrefs,
} from '../types/notifications';
import { colors, spacing } from '../theme/theme';

const LANGUAGES = Object.keys(LANGUAGE_LABEL) as NotificationLanguage[];
const KNOWN_TILES = new Set<string>(DASHBOARD_TILES.map((t) => t.id));

/** Same settings regardless of the order the dashboard tiles were ticked in. */
function samePrefs(a: NotificationPrefs, b: NotificationPrefs): boolean {
  const norm = (p: NotificationPrefs) => JSON.stringify({ ...p, dashboardTiles: [...p.dashboardTiles].sort() });
  return norm(a) === norm(b);
}

/** How the store hears about orders, payouts and Trendzo updates, and what the dashboard shows. */
export function NotificationSettingsScreen({ navigation }: ScreenProps<'NotificationSettings'>) {
  const toast = useToast();
  const prefsQ = useNotificationPrefs();
  const save = useSaveNotificationPrefs();
  const perm = usePushPermission();
  const [draft, setDraft] = useState<NotificationPrefs | null>(null);

  useEffect(() => {
    if (prefsQ.data && !draft) setDraft(prefsQ.data);
  }, [prefsQ.data, draft]);

  const set = (patch: Partial<NotificationPrefs>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const dirty = !!draft && !!prefsQ.data && !samePrefs(draft, prefsQ.data);
  const noChannel = !!draft && !draft.pushEnabled && !draft.emailEnabled && !draft.smsEnabled;
  const noTiles = !!draft && !draft.dashboardTiles.some((t) => KNOWN_TILES.has(t));

  const onPush = (on: boolean) => {
    set({ pushEnabled: on });
    // Turning push on while the phone has notifications off: ask now if the OS still lets us.
    if (on && perm.state !== 'granted' && perm.state !== 'loading' && perm.canPrompt) void perm.request();
  };

  const toggleTile = (id: DashboardTile) => {
    if (!draft) return;
    const on = new Set(draft.dashboardTiles);
    if (on.has(id)) on.delete(id);
    else on.add(id);
    // Known tiles in the portal's order, then any ids this app doesn't know (kept, never dropped).
    const known = DASHBOARD_TILES.map((t) => t.id).filter((t) => on.has(t));
    const extra = draft.dashboardTiles.filter((t) => !KNOWN_TILES.has(t));
    set({ dashboardTiles: [...known, ...extra] });
  };

  const onSave = () => {
    if (!draft || noChannel || noTiles) return;
    save.mutate(draft, {
      onSuccess: () => toast.show('Notification settings saved', 'success'),
      onError: (e) => toast.show(errorMessage(e, 'Could not save settings'), 'error'),
    });
  };

  const langKey = draft ? String(draft.language).split('-')[0] : '';

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
                hint="New orders and updates on this phone, even when the app is closed"
                value={draft.pushEnabled}
                onChange={onPush}
              />
              <PhonePermission perm={perm} pushWanted={draft.pushEnabled} />
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

            <Panel title="Home dashboard">
              <AppText variant="meta" color={colors.meta}>
                Pick the tiles that show on your home screen.
              </AppText>
              {DASHBOARD_TILES.map((t, i) => (
                <React.Fragment key={t.id}>
                  {i > 0 ? <Divider /> : null}
                  <ToggleRow
                    label={t.label}
                    hint={t.hint}
                    value={draft.dashboardTiles.includes(t.id)}
                    onChange={() => toggleTile(t.id)}
                  />
                </React.Fragment>
              ))}
              {noTiles ? (
                <AppText variant="meta" color={colors.danger}>
                  Select at least one tile.
                </AppText>
              ) : null}
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
                    selected={langKey === l}
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
            disabled={!dirty || noChannel || noTiles}
            onPress={onSave}
          />
        </KeyboardStickyView>
      ) : null}
    </Screen>
  );
}

/**
 * What the OS says about notifications for this app, with the one action that fixes it:
 * the OS prompt while it can still appear, otherwise the phone's notification settings.
 */
function PhonePermission({
  perm,
  pushWanted,
}: {
  perm: ReturnType<typeof usePushPermission>;
  pushWanted: boolean;
}) {
  if (perm.state === 'loading') return null;

  if (perm.state === 'granted') {
    return (
      <View style={styles.permRow}>
        <AppText variant="meta" color={colors.success}>
          Allowed on this phone
        </AppText>
        {perm.unavailableReason ? (
          <AppText variant="meta" color={colors.meta}>
            Alerts while the app is closed aren't set up in this version yet. You'll still hear new orders while the
            app is open.
          </AppText>
        ) : null}
      </View>
    );
  }

  if (perm.state === 'unavailable') {
    return (
      <View style={styles.permRow}>
        <AppText variant="meta" color={colors.meta}>
          Phone alerts aren't available in this version. You'll still see new orders while the app is open.
        </AppText>
      </View>
    );
  }

  return (
    <Banner
      tone={pushWanted ? 'warning' : 'neutral'}
      title="Notifications are off on this phone"
      message={
        perm.canPrompt
          ? 'Allow notifications so a new order rings even when the app is closed.'
          : 'Turn them on in your phone settings so a new order rings even when the app is closed.'
      }
      actionLabel={perm.canPrompt ? 'Allow notifications' : 'Open phone settings'}
      onAction={() => {
        if (perm.canPrompt) void perm.request();
        else void perm.openSettings();
      }}
      style={styles.permBanner}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl, gap: spacing.md },
  loader: { marginTop: spacing.xl },
  staticRow: { gap: 2, paddingVertical: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  permRow: { gap: 2, paddingBottom: spacing.xs },
  permBanner: { marginVertical: spacing.xs },
  footer: { paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.hairline },
});
