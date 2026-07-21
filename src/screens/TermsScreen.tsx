import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WebView } from 'react-native-webview';
import { AppText, BackButton, Banner, Icon, PressableScale, PrimaryButton, Screen, useToast } from '../components';
import { ScreenProps } from '../navigation/types';
import { PRIVACY_URL, TERMS_URL } from '../config/legal';
import {
  acceptPrivacy,
  acceptTerms,
  declinePrivacy,
  declineTerms,
  getPrivacy,
  getPublicLegal,
  getTerms,
} from '../api/onboarding';
import { useRetailerMe } from '../api/onboardingHooks';
import { useAuth } from '../store/auth';
import { colors, radii, spacing } from '../theme/theme';

type LegalKind = 'terms' | 'privacy';

const COPY: Record<LegalKind, { docName: string; agree: string }> = {
  terms: {
    docName: 'Retailer Terms & Conditions',
    agree: 'I have read and accept the Retailer Terms & Conditions.',
  },
  privacy: {
    docName: 'Privacy Policy',
    agree: 'I have read and accept the Privacy Policy.',
  },
};

const API: Record<
  LegalKind,
  {
    get: typeof getTerms;
    accept: typeof acceptTerms;
    decline: typeof declineTerms;
  }
> = {
  terms: { get: getTerms, accept: acceptTerms, decline: declineTerms },
  privacy: { get: getPrivacy, accept: acceptPrivacy, decline: declinePrivacy },
};

/**
 * Legal gate - a store cannot go live until BOTH the Retailer Terms and the
 * Privacy Policy (whichever are outstanding) are accepted. One screen shows every
 * outstanding doc with a switcher so the retailer reads both without the gate
 * bouncing them between two separate prompts. Kept as `TermsScreen`/`PrivacyScreen`
 * exports for back-compat; both render the same unified gate.
 */
export function TermsScreen() {
  return <LegalGateScreen />;
}
export function PrivacyScreen() {
  return <LegalGateScreen />;
}

// Public HTML fallbacks — served by the backend's public legal routes. Used
// when the authed retailer endpoint isn't available on the deployed backend
// (e.g. /retailer/privacy is newer than the current deployment).
const PUBLIC_URL: Record<LegalKind, string> = {
  terms: TERMS_URL,
  privacy: PRIVACY_URL,
};

/**
 * Read-only viewer for the backend-published legal docs — opened from the Profile
 * page's "Terms of Service" / "Privacy Policy" rows AND the signup consent links.
 * Fetches the PUBLIC content endpoint (no auth), so it works logged-out too.
 * No accept/decline: consent is recorded at signup / the legal gate.
 */
export function LegalDocViewerScreen({ navigation, route }: ScreenProps<'LegalDoc'>) {
  const { kind } = route.params;
  const copy = COPY[kind];
  const q = useQuery({
    queryKey: ['public-legal', kind],
    queryFn: () => getPublicLegal(kind),
    retry: false,
  });

  // Endpoint missing on this backend deployment → show the public HTML page instead.
  const notFound =
    (q.error as { status?: number; response?: { status?: number } } | null)?.status === 404 ||
    (q.error as { response?: { status?: number } } | null)?.response?.status === 404;

  return (
    <Screen edges={['top', 'bottom']}>
      <BackButton onPress={() => navigation.goBack()} />
      <AppText variant="cardTitle">{copy.docName}</AppText>
      {q.data ? (
        <AppText variant="meta" color={colors.meta} style={styles.sub}>
          Version {q.data.label}
        </AppText>
      ) : null}
      {q.isError && notFound ? (
        <View style={styles.box}>
          <WebView source={{ uri: PUBLIC_URL[kind] }} style={styles.web} />
        </View>
      ) : q.isError ? (
        <Banner
          tone="danger"
          title="Couldn't load the document"
          message={(q.error as { message?: string })?.message}
          actionLabel="Retry"
          onAction={() => q.refetch()}
        />
      ) : (
        <ScrollView style={styles.box} contentContainerStyle={styles.boxInner}>
          <AppText variant="body">{q.data?.shortText ?? 'Loading…'}</AppText>
        </ScrollView>
      )}
    </Screen>
  );
}

/**
 * Unified legal gate. Reads `me` for which docs are still outstanding, shows them
 * in ONE screen with a switcher (when both are due), a single agreement checkbox,
 * and one Accept that records every outstanding doc. Declining any logs the user
 * out (re-prompted next login).
 */
function LegalGateScreen() {
  const qc = useQueryClient();
  const toast = useToast();
  const logout = useAuth((s) => s.logout);
  const me = useRetailerMe();
  const [agreed, setAgreed] = useState(false);

  // Which docs are outstanding, in a stable order (terms first).
  const required: LegalKind[] = [];
  if (me.data?.termsAcceptanceRequired) required.push('terms');
  if (me.data?.privacyAcceptanceRequired) required.push('privacy');

  const [active, setActive] = useState<LegalKind>(required[0] ?? 'terms');
  // Keep the active tab valid as docs get accepted (required shrinks).
  React.useEffect(() => {
    if (required.length && !required.includes(active)) setActive(required[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [required.join(',')]);

  const termsQ = useQuery({
    queryKey: ['retailer-legal', 'terms'],
    queryFn: getTerms,
    enabled: required.includes('terms'),
  });
  const privacyQ = useQuery({
    queryKey: ['retailer-legal', 'privacy'],
    queryFn: getPrivacy,
    enabled: required.includes('privacy'),
  });
  const docByKind: Record<LegalKind, { version: string; shortText: string } | undefined> = {
    terms: termsQ.data,
    privacy: privacyQ.data,
  };
  const activeDoc = docByKind[active];
  const bothRequired = required.length > 1;
  const allLoaded = required.every((k) => docByKind[k]?.version);

  // Accept every outstanding doc in one go, then refetch `me` to release the gate.
  const accept = useMutation({
    mutationFn: async () => {
      for (const k of required) {
        const v = docByKind[k]?.version;
        if (v) await API[k].accept(v);
      }
    },
    onSuccess: async () => {
      toast.show(
        bothRequired ? 'Terms & Privacy Policy accepted' : `${COPY[active].docName} accepted`,
        'success',
      );
      await qc.refetchQueries({ queryKey: ['retailer-me'] });
    },
    onError: (e: unknown) =>
      toast.show((e as { message?: string })?.message ?? 'Could not record acceptance', 'error'),
  });

  // Declining any outstanding doc is recorded, then the user is logged out.
  const decline = useMutation({
    mutationFn: async () => {
      for (const k of required) {
        const v = docByKind[k]?.version;
        if (v) await API[k].decline(v);
      }
    },
    onSettled: () => logout(),
  });
  function onDecline() {
    const what = bothRequired
      ? 'the Terms & Conditions and Privacy Policy'
      : COPY[active].docName;
    Alert.alert(
      'Decline?',
      `Declining ${what} will log you out. You must accept to use your store.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Decline & log out', style: 'destructive', onPress: () => decline.mutate() },
      ],
    );
  }

  const agreeLabel = bothRequired
    ? 'I have read and accept the Retailer Terms & Conditions and Privacy Policy.'
    : COPY[active].agree;

  return (
    <Screen>
      <AppText variant="cardTitle">
        {bothRequired ? 'Review & accept' : COPY[active].docName}
      </AppText>
      <AppText variant="meta" color={colors.meta} style={styles.sub}>
        Accept to activate your store and start selling.
      </AppText>

      {/* Doc switcher — only when more than one doc is outstanding. */}
      {bothRequired ? (
        <View style={styles.tabs}>
          {required.map((k) => {
            const on = k === active;
            return (
              <PressableScale
                key={k}
                onPress={() => setActive(k)}
                haptic={false}
                style={[styles.tab, on && styles.tabOn]}
              >
                <AppText variant="bodyMedium" color={on ? colors.accentInk : colors.ink}>
                  {k === 'terms' ? 'Terms & Conditions' : 'Privacy Policy'}
                </AppText>
              </PressableScale>
            );
          })}
        </View>
      ) : null}

      <ScrollView
        style={styles.box}
        contentContainerStyle={styles.boxInner}
        showsVerticalScrollIndicator
        nestedScrollEnabled
      >
        <AppText variant="body">{activeDoc?.shortText ?? 'Loading…'}</AppText>
      </ScrollView>

      {/* Note above the buttons naming both docs (when both are due). */}
      {bothRequired ? (
        <AppText variant="meta" color={colors.meta} style={styles.note}>
          You're accepting both documents. Tap a title above to read either one.
        </AppText>
      ) : null}

      <PressableScale onPress={() => setAgreed((a) => !a)} style={styles.row}>
        <View style={[styles.check, agreed && styles.checkOn]}>
          {agreed && <Icon name="checkmark" size={16} color={colors.accentInk} />}
        </View>
        <AppText variant="body" style={styles.rowText}>
          {agreeLabel}
        </AppText>
      </PressableScale>

      <PrimaryButton
        label="Accept & continue"
        disabled={!agreed || !allLoaded}
        loading={accept.isPending}
        onPress={() => accept.mutate()}
      />
      <PrimaryButton
        label="Decline & log out"
        tone="danger"
        style={styles.declineBtn}
        loading={decline.isPending}
        onPress={onDecline}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: spacing.xs, marginBottom: spacing.md },
  tabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    padding: 4,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  tabOn: { backgroundColor: colors.accent },
  note: { marginBottom: spacing.sm },
  box: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.card,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  web: { flex: 1, backgroundColor: 'transparent' },
  boxInner: { padding: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  rowText: { flex: 1 },
  check: {
    width: 22,
    height: 22,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  declineBtn: { marginTop: spacing.sm },
});
