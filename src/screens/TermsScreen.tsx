import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppText, Icon, PressableScale, PrimaryButton, Screen, useToast } from '../components';
import {
  acceptPrivacy,
  acceptTerms,
  declinePrivacy,
  declineTerms,
  getPrivacy,
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
 * Legal gate — a store cannot go live until the Retailer Terms are accepted.
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

function LegalDocScreen({ kind }: { kind: LegalKind }) {
  const copy = COPY[kind];
  const calls = API[kind];
  const qc = useQueryClient();
  const toast = useToast();
  const logout = useAuth((s) => s.logout);
  const [agreed, setAgreed] = useState(false);

  const { data: doc } = useQuery({ queryKey: ['retailer-legal', kind], queryFn: calls.get });

  const accept = useMutation({
    mutationFn: () => calls.accept(doc!.version),
    onSuccess: () => {
      toast.show(`${copy.docName} accepted`, 'success');
      void qc.invalidateQueries({ queryKey: ['retailer-me'] });
    },
    onError: (e: unknown) =>
      toast.show((e as { message?: string })?.message ?? 'Could not record acceptance', 'error'),
  });

  // Declining is recorded, then the user is logged out — re-prompted next login until accepted.
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
  box: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.card,
    marginBottom: spacing.md,
  },
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
