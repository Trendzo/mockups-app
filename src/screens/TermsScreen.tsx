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
 * Legal gate - a store cannot go live until the Retailer Terms are accepted.
 * Shown from RootNavigator when `me.termsAcceptanceRequired` is true. Accepting
 * records the version + IP server-side, then re-fetches `me` to release the gate.
 */
export function TermsScreen() {
  return <LegalDocScreen kind="terms" />;
}

/** Same gate for the Privacy Policy — shown once the terms are in (`me.privacyAcceptanceRequired`). */
export function PrivacyScreen() {
  return <LegalDocScreen kind="privacy" />;
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

function LegalDocScreen({ kind }: { kind: LegalKind }) {
  const copy = COPY[kind];
  const calls = API[kind];
  const qc = useQueryClient();
  const toast = useToast();
  const logout = useAuth((s) => s.logout);
  const [agreed, setAgreed] = useState(false);

  const { data: doc } = useQuery({ queryKey: ['retailer-legal', kind], queryFn: calls.get });

  React.useEffect(() => {
    console.log(`[legal:${kind}] doc loaded`, doc);
  }, [kind, doc]);

  const accept = useMutation({
    mutationFn: () => {
      console.log(`[legal:${kind}] accept → POST /retailer/${kind}/accept`, { version: doc?.version });
      return calls.accept(doc!.version);
    },
    onSuccess: async (res) => {
      console.log(`[legal:${kind}] accept succeeded`, res);
      toast.show(`${copy.docName} accepted`, 'success');
      // Explicit refetch (not just invalidate) so we can log the fresh gate
      // values immediately, instead of trusting background invalidation timing.
      const result = await qc.refetchQueries({ queryKey: ['retailer-me'] });
      console.log(`[legal:${kind}] retailer-me refetched after accept`, result);
      const me = qc.getQueryData<{
        termsAcceptanceRequired?: boolean;
        privacyAcceptanceRequired?: boolean;
        currentTermsVersion?: string;
        currentPrivacyVersion?: string;
      }>(['retailer-me']);
      console.log(`[legal:${kind}] gate state after refetch`, {
        termsAcceptanceRequired: me?.termsAcceptanceRequired,
        privacyAcceptanceRequired: me?.privacyAcceptanceRequired,
        currentTermsVersion: me?.currentTermsVersion,
        currentPrivacyVersion: me?.currentPrivacyVersion,
        acceptedVersionSent: doc?.version,
      });
    },
    onError: (e: unknown) => {
      console.log(`[legal:${kind}] accept FAILED`, e);
      toast.show((e as { message?: string })?.message ?? 'Could not record acceptance', 'error');
    },
  });

  // Declining is recorded, then the user is logged out - re-prompted next login until accepted.
  const decline = useMutation({
    mutationFn: () => calls.decline(doc!.version),
    onSettled: () => logout(),
  });
  function onDecline() {
    Alert.alert(
      `Decline ${kind === 'terms' ? 'terms' : 'privacy policy'}?`,
      `Declining the ${copy.docName} will log you out. You must accept it to use your store.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Decline & log out', style: 'destructive', onPress: () => decline.mutate() },
      ],
    );
  }

  return (
    <Screen>
      <AppText variant="cardTitle">{copy.docName}</AppText>
      <AppText variant="meta" color={colors.meta} style={styles.sub}>
        Accept to activate your store and start selling.
      </AppText>

      <ScrollView style={styles.box} contentContainerStyle={styles.boxInner}>
        <AppText variant="body">{doc?.shortText ?? 'Loading…'}</AppText>
      </ScrollView>

      <PressableScale onPress={() => setAgreed((a) => !a)} style={styles.row}>
        <View style={[styles.check, agreed && styles.checkOn]}>
          {agreed && <Icon name="checkmark" size={16} color={colors.accentInk} />}
        </View>
        <AppText variant="body" style={styles.rowText}>
          {copy.agree}
        </AppText>
      </PressableScale>

      <PrimaryButton
        label="Accept & continue"
        disabled={!agreed || !doc}
        loading={accept.isPending}
        onPress={() => {
          console.log(`[legal:${kind}] "Accept & continue" pressed`, { agreed, doc });
          accept.mutate();
        }}
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
