import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  BackButton,
  Banner,
  DocumentUpload,
  Field,
  KeyboardStickyView,
  PrimaryButton,
  Screen,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { fetchForResubmit, resubmitApplication } from '../api/onboarding';
import { useOnboarding } from '../store/onboarding';
import {
  APPLICATION_DOC_KINDS,
  ApplicationInput,
  DocKind,
} from '../types/onboarding';
import { colors, spacing } from '../theme/theme';
import { Haptics } from '../utils/haptics';

type Docs = Partial<Record<DocKind, string>>;

export function ResubmitScreen({ navigation, route }: ScreenProps<'Resubmit'>) {
  const { applicationId, email } = route.params;
  const toast = useToast();
  const setApplication = useOnboarding((s) => s.setApplication);

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [mustReupload, setMustReupload] = useState<DocKind[]>([]);
  const [form, setForm] = useState<ApplicationInput | null>(null);
  const [docs, setDocs] = useState<Docs>({});
  const [docErrors, setDocErrors] = useState<Partial<Record<DocKind, string>>>({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (password.length < 8) {
      toast.show('Enter your account password', 'error');
      return;
    }
    setLoading(true);
    try {
      const data = await fetchForResubmit(applicationId, { email, password });
      const a = data.application ?? {};
      setForm({
        legalName: a.legalName ?? '',
        gstin: a.gstin ?? '',
        ownerName: a.ownerName ?? '',
        ownerEmail: a.ownerEmail ?? email,
        ownerPhone: a.ownerPhone ?? '',
        addressLine: a.addressLine ?? '',
        pincode: a.pincode ?? '',
        stateCode: a.stateCode ?? '',
        storeName: a.storeName,
        pan: a.pan,
      });
      // The must-reupload flags live INSIDE the application row (not top-level).
      setMustReupload(a.mustReuploadDocKinds ?? []);
      setLoaded(true);
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not load application', 'error');
    } finally {
      setLoading(false);
    }
  };

  const upd = (k: keyof ApplicationInput) => (v: string) =>
    setForm((p) => (p ? { ...p, [k]: v } : p));

  const submit = async () => {
    if (!form) return;
    // Required-reupload checklist: each flagged kind needs a fresh file.
    const missing = mustReupload.filter((k) => !docs[k]);
    if (missing.length) {
      const e: Partial<Record<DocKind, string>> = {};
      missing.forEach((k) => (e[k] = 'A fresh file is required'));
      setDocErrors(e);
      toast.show('Re-upload the required documents', 'error');
      return;
    }
    setBusy(true);
    try {
      const documents = APPLICATION_DOC_KINDS.filter((d) => docs[d.kind]).map((d) => ({
        kind: d.kind,
        url: docs[d.kind]!,
      }));
      await resubmitApplication(
        applicationId,
        { ...form, documents },
        { email, password },
      );
      Haptics.success();
      setApplication(applicationId, email);
      toast.show('Resubmitted for review', 'success');
      navigation.replace('ApplicationStatus', { applicationId, email });
    } catch (e: any) {
      // 422 on a specific doc → surface inline.
      const detail: any[] = e?.details ?? [];
      const de: Partial<Record<DocKind, string>> = {};
      detail.forEach((d) => {
        const p = d?.params?.issue?.path ?? [];
        const kind = p.find((x: string) => mustReupload.includes(x as DocKind));
        if (kind) de[kind as DocKind] = d?.message ?? 'Invalid document';
      });
      if (Object.keys(de).length) setDocErrors(de);
      toast.show(e?.message ?? 'Resubmit failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top']}>
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
            <AppText variant="sectionLabel" color={colors.meta}>Resubmit</AppText>
            <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>Fix & resubmit</AppText>
          </View>

          {!loaded ? (
            <>
              <Banner tone="warning" title="Confirm it's you" message="Enter your account password to load your application for editing." />
              <Field label="Password" required value={password} onChangeText={setPassword} placeholder="Your account password" secureTextEntry autoCapitalize="none" />
              <PrimaryButton label="Load application" tone="accent" loading={loading} onPress={load} />
            </>
          ) : form ? (
            <>
              {mustReupload.length > 0 ? (
                <Banner tone="danger" title="Documents to re-upload" message={`These must be uploaded fresh: ${mustReupload.map(prettyDoc).join(', ')}.`} />
              ) : null}

              <View style={styles.section}>
                <AppText variant="sectionLabel" color={colors.meta}>Details</AppText>
                <Field label="Legal name" required value={form.legalName} onChangeText={upd('legalName')} />
                <Field label="GSTIN" required value={form.gstin} onChangeText={(v) => upd('gstin')(v.toUpperCase())} autoCapitalize="characters" maxLength={15} />
                <Field label="Owner name" required value={form.ownerName} onChangeText={upd('ownerName')} />
                <Field label="Owner phone" required value={form.ownerPhone} onChangeText={upd('ownerPhone')} keyboardType="phone-pad" />
                <Field label="Address line" required value={form.addressLine} onChangeText={upd('addressLine')} />
                <View style={styles.row}>
                  <Field label="Pincode" required value={form.pincode} onChangeText={upd('pincode')} keyboardType="number-pad" maxLength={6} containerStyle={styles.flex} />
                  <Field label="State code" required value={form.stateCode} onChangeText={upd('stateCode')} keyboardType="number-pad" maxLength={2} containerStyle={styles.flex} />
                </View>
              </View>

              <View style={styles.section}>
                <AppText variant="sectionLabel" color={colors.meta}>Documents</AppText>
                {APPLICATION_DOC_KINDS.map((d) => {
                  const required = mustReupload.includes(d.kind);
                  return (
                    <DocumentUpload
                      key={d.kind}
                      label={d.label}
                      required={required}
                      status={required ? 'rejected' : undefined}
                      value={docs[d.kind] ?? null}
                      error={docErrors[d.kind] ?? null}
                      onUploaded={(url) => {
                        setDocs((p) => ({ ...p, [d.kind]: url }));
                        setDocErrors((p) => ({ ...p, [d.kind]: undefined }));
                      }}
                      onClear={() => setDocs((p) => ({ ...p, [d.kind]: undefined }))}
                    />
                  );
                })}
              </View>
            </>
          ) : null}
      </ScrollView>

      {loaded ? (
        <KeyboardStickyView style={styles.footer} minBottom={spacing.md}>
          <PrimaryButton label="Resubmit application" tone="accent" loading={busy} onPress={submit} />
        </KeyboardStickyView>
      ) : null}
    </Screen>
  );
}

function prettyDoc(kind: DocKind): string {
  return APPLICATION_DOC_KINDS.find((d) => d.kind === kind)?.label ?? kind;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  header: { gap: spacing.xs },
  h1: { fontSize: 24, lineHeight: 28 },
  section: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  flex2: { flex: 1 },
  footer: {
    paddingVertical: spacing.md,
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
});
