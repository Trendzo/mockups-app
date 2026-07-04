import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  BackButton,
  DocumentUpload,
  Field,
  PrimaryButton,
  Screen,
  Select,
  StatusChip,
  toneForStatus,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { createChangeRequest } from '../api/onboarding';
import { useChangeRequests } from '../api/onboardingHooks';
import { ChangeRequestField } from '../types/onboarding';
import { colors, radii, spacing } from '../theme/theme';
import { Haptics } from '../utils/haptics';

const FIELD_OPTIONS: { value: ChangeRequestField; label: string }[] = [
  { value: 'legal_name', label: 'Legal name' },
  { value: 'address', label: 'Address' },
  { value: 'bank_account', label: 'Bank account' },
  { value: 'gstin', label: 'GSTIN' },
  { value: 'pos_billing_activation', label: 'POS billing activation' },
];

export function ChangeRequestScreen({ navigation }: ScreenProps<'ChangeRequest'>) {
  const toast = useToast();
  const listQ = useChangeRequests();

  const [field, setField] = useState<ChangeRequestField | null>(null);
  const [currentValue, setCurrentValue] = useState('');
  const [requestedValue, setRequestedValue] = useState('');
  const [reason, setReason] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!field) e.field = 'Pick a field';
    if (!requestedValue.trim()) e.requestedValue = 'Required';
    if (reason.trim().length < 3 || reason.trim().length > 500)
      e.reason = '3–500 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate() || !field) return;
    setBusy(true);
    try {
      await createChangeRequest({
        field,
        currentValue: currentValue.trim(),
        requestedValue: requestedValue.trim(),
        reason: reason.trim(),
        evidenceUrl: evidenceUrl ?? undefined,
      });
      Haptics.success();
      toast.show('Change request submitted', 'success');
      setField(null);
      setCurrentValue('');
      setRequestedValue('');
      setReason('');
      setEvidenceUrl(null);
      listQ.refetch();
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not submit', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.content}
      >
        <BackButton onPress={() => navigation.goBack()} />
          <View style={styles.header}>
            <AppText variant="sectionLabel" color={colors.meta}>Verified fields</AppText>
            <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>Request a change</AppText>
            <AppText variant="meta" color={colors.meta}>
              GST, bank, legal name and address changes need admin approval with evidence.
            </AppText>
          </View>

          <Select
            label="Field"
            required
            placeholder="Which field to change?"
            options={FIELD_OPTIONS}
            selected={field ? [field] : []}
            onChange={(v) => setField((v[0] as ChangeRequestField) ?? null)}
            error={errors.field}
          />
          <Field label="Current value" value={currentValue} onChangeText={setCurrentValue} placeholder="What it is now (optional)" />
          <Field label="Requested value" required value={requestedValue} onChangeText={setRequestedValue} placeholder="What it should be" error={errors.requestedValue} />
          <Field label="Reason" required value={reason} onChangeText={setReason} placeholder="Why this change (3–500 chars)" multiline error={errors.reason} />

          <View style={styles.section}>
            <AppText variant="sectionLabel" color={colors.meta}>Evidence (optional)</AppText>
            <DocumentUpload
              label="Supporting document"
              value={evidenceUrl}
              onUploaded={setEvidenceUrl}
              onClear={() => setEvidenceUrl(null)}
            />
          </View>

          <PrimaryButton label="Submit request" tone="accent" loading={busy} onPress={submit} />

          <View style={styles.section}>
            <AppText variant="sectionLabel" color={colors.meta}>Your requests</AppText>
            {listQ.isLoading ? (
              <ActivityIndicator color={colors.ink} />
            ) : listQ.data && listQ.data.length > 0 ? (
              listQ.data.map((cr) => (
                <View key={cr.id} style={styles.reqRow}>
                  <View style={styles.flex}>
                    <AppText variant="bodyMedium" color={colors.ink}>
                      {FIELD_OPTIONS.find((o) => o.value === cr.field)?.label ?? cr.field}
                    </AppText>
                    {cr.requestedValue ? (
                      <AppText variant="meta" color={colors.meta} numberOfLines={1}>
                        → {cr.requestedValue}
                      </AppText>
                    ) : null}
                  </View>
                  <StatusChip label={cr.status.replace('_', ' ')} tone={toneForStatus(cr.status)} />
                </View>
              ))
            ) : (
              <AppText variant="meta" color={colors.meta}>No change requests yet.</AppText>
            )}
          </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  header: { gap: spacing.xs },
  h1: { fontSize: 24, lineHeight: 28 },
  section: { gap: spacing.md },
  reqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.md,
  },
});
