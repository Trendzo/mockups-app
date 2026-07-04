import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppText,
  BackButton,
  Banner,
  DocumentUpload,
  PrimaryButton,
  Screen,
  StatusTone,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { useKyc } from '../api/onboardingHooks';
import { submitKyc, uploadKycDoc } from '../api/onboarding';
import { KycCycleStatus } from '../types/onboarding';
import { colors, spacing } from '../theme/theme';
import { Haptics } from '../utils/haptics';

const BANNER: Record<KycCycleStatus, { tone: StatusTone; title: string; message: string }> = {
  pending: { tone: 'warning', title: 'KYC verification due', message: 'Upload the documents below to stay verified.' },
  overdue: { tone: 'danger', title: 'KYC overdue', message: 'Your verification is overdue. Upload the documents now to avoid restrictions.' },
  submitted: { tone: 'pending', title: 'KYC under review', message: "We're reviewing your documents. No action needed." },
  rejected: { tone: 'danger', title: 'Some documents were rejected', message: 'Re-upload the rejected documents and submit again.' },
  approved: { tone: 'success', title: 'KYC verified', message: "You're all set." },
};

export function KycScreen({ navigation }: ScreenProps<'Kyc'>) {
  const toast = useToast();
  const qc = useQueryClient();
  const kycQ = useKyc();
  const [submitting, setSubmitting] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);

  const cycle = kycQ.data;
  const refetch = () => qc.invalidateQueries({ queryKey: ['kyc'] });

  const onUpload = async (kind: string, url: string) => {
    if (!cycle) return;
    setUploadingKind(kind);
    try {
      await uploadKycDoc(cycle.id, { kind, url });
      await refetch();
    } catch (e: any) {
      toast.show(e?.message ?? 'Upload failed', 'error');
    } finally {
      setUploadingKind(null);
    }
  };

  const onSubmit = async () => {
    if (!cycle) return;
    setSubmitting(true);
    try {
      await submitKyc(cycle.id);
      Haptics.success();
      toast.show('KYC submitted for review', 'success');
      await refetch();
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not submit', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const editable = cycle && (cycle.status === 'pending' || cycle.status === 'overdue' || cycle.status === 'rejected');
  // A rejected doc must be re-uploaded (→ pending_review) before submit is allowed.
  const allUploaded =
    cycle?.documents.every((d) => d.status !== 'missing' && d.status !== 'rejected') ??
    false;
  const banner = cycle ? BANNER[cycle.status] : null;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={styles.header}>
          <AppText variant="sectionLabel" color={colors.meta}>Verification</AppText>
          <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>KYC</AppText>
        </View>

        {kycQ.isLoading ? (
          <ActivityIndicator color={colors.ink} />
        ) : !cycle ? (
          <Banner tone="success" title="No KYC due" message="You have no pending verification right now." />
        ) : (
          <>
            {banner ? <Banner tone={banner.tone} title={banner.title} message={banner.message} /> : null}

            <View style={styles.section}>
              <AppText variant="sectionLabel" color={colors.meta}>Documents</AppText>
              {cycle.documents.map((doc) => (
                <DocumentUpload
                  key={doc.id}
                  label={doc.label}
                  required={editable && doc.status !== 'verified'}
                  status={uploadingKind === doc.kind ? 'pending_review' : doc.status}
                  value={doc.fileUrl ?? null}
                  onUploaded={(url) => onUpload(doc.kind, url)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {editable ? (
        <View style={styles.footer}>
          <PrimaryButton
            label="Submit for review"
            tone="accent"
            loading={submitting}
            disabled={!allUploaded}
            onPress={onSubmit}
          />
          {!allUploaded ? (
            <AppText variant="meta" color={colors.meta} style={styles.hint}>
              Upload every document to submit.
            </AppText>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  header: { gap: spacing.xs },
  h1: { fontSize: 24, lineHeight: 28 },
  section: { gap: spacing.md, marginTop: spacing.sm },
  footer: { paddingVertical: spacing.md, gap: spacing.xs },
  hint: { textAlign: 'center' },
});
