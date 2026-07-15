import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  ApplicationWizard,
  BackButton,
  Banner,
  Field,
  PrimaryButton,
  Screen,
  WizardStepCopy,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { fetchForResubmit, resubmitApplication } from '../api/onboarding';
import { useOnboarding } from '../store/onboarding';
import { APPLICATION_DOC_KINDS, DocKind } from '../types/onboarding';
import { ApplicationFields, EMPTY_APPLICATION } from '../store/applicationDraft';
import { colors, spacing } from '../theme/theme';
import { Haptics } from '../utils/haptics';
import { nationalPhone, toE164 } from '../utils/phone';

type Docs = Partial<Record<DocKind, string>>;

const PIN_RE = /^\d{6}$/;

// Same 5 steps as onboarding — only the headings differ (this is a fix, not a signup).
const STEP_COPY: [WizardStepCopy, WizardStepCopy, WizardStepCopy, WizardStepCopy, WizardStepCopy] = [
  { title: 'Business', heading: 'Business details', subtitle: 'Update your registered details, as on GST.' },
  { title: 'Owner', heading: 'Owner details', subtitle: 'Email & phone are locked; edit the rest as needed.' },
  { title: 'Address', heading: 'Store address', subtitle: 'Fix your store address if needed.' },
  { title: 'Bank', heading: 'Bank', subtitle: 'For payouts.' },
  { title: 'Documents', heading: 'Documents', subtitle: 'Re-upload any rejected documents.' },
];

/** Validate the editable required fields; returns errors + first bad step (-1 = ok). */
function validateResubmit(f: ApplicationFields): { errors: Record<string, string>; firstBad: number } {
  const perStep: Record<string, string>[] = [{}, {}, {}];
  if (f.legalName.trim().length < 2) perStep[0].legalName = '2–120 characters';
  if (f.gstin.trim().length !== 15) perStep[0].gstin = 'GSTIN must be 15 characters';
  if (f.pan.trim() && f.pan.trim().length !== 10) perStep[0].pan = 'PAN is 10 characters';
  if (f.ownerName.trim().length < 2) perStep[1].ownerName = '2–120 characters';
  if (f.addressLine.trim().length < 5) perStep[2].addressLine = '5–300 characters';
  if (!PIN_RE.test(f.pincode.trim())) perStep[2].pincode = '6-digit pincode';

  const errors: Record<string, string> = {};
  let firstBad = -1;
  perStep.forEach((e, i) => {
    if (Object.keys(e).length && firstBad < 0) firstBad = i;
    Object.assign(errors, e);
  });
  return { errors, firstBad };
}

export function ResubmitScreen({ navigation, route }: ScreenProps<'Resubmit'>) {
  const { applicationId, email } = route.params;
  const toast = useToast();
  const setApplication = useOnboarding((s) => s.setApplication);

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [mustReupload, setMustReupload] = useState<DocKind[]>([]);
  const [form, setForm] = useState<ApplicationFields | null>(null);
  const [docs, setDocs] = useState<Docs>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [docErrors, setDocErrors] = useState<Partial<Record<DocKind, string>>>({});
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  // Full server error surfaced on-screen (the device console isn't visible).
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = async () => {
    if (password.length < 8) {
      toast.show('Enter your account password', 'error');
      return;
    }
    setLoading(true);
    try {
      const data = await fetchForResubmit(applicationId, { email, password });
      const a = data.application ?? {};
      // Load every field so the whole application is editable, same as onboarding.
      setForm({
        ...EMPTY_APPLICATION,
        legalName: a.legalName ?? '',
        gstin: a.gstin ?? '',
        storeName: a.storeName ?? '',
        pan: a.pan ?? '',
        ownerName: a.ownerName ?? '',
        ownerEmail: a.ownerEmail ?? email,
        ownerPhone: nationalPhone(a.ownerPhone ?? ''),
        contactPhone: nationalPhone(a.contactPhone ?? ''),
        addressLine: a.addressLine ?? '',
        pincode: a.pincode ?? '',
        stateCode: a.stateCode ?? (a.gstin ?? '').slice(0, 2),
        bankLegalName: a.bankLegalName ?? '',
        bankAccountNumber: a.bankAccountNumber ?? '',
        bankIfsc: a.bankIfsc ?? '',
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

  const onField = (k: keyof ApplicationFields, v: string) => {
    setForm((p) => (p ? { ...p, [k]: v } : p));
    setErrors((e) => {
      if (!e[k]) return e;
      const next = { ...e };
      delete next[k];
      return next;
    });
  };

  const setDoc = (kind: DocKind, url: string | undefined) => {
    setDocs((p) => {
      const next = { ...p };
      if (url) next[kind] = url;
      else delete next[kind];
      return next;
    });
    setDocErrors((p) => ({ ...p, [kind]: undefined }));
  };

  const docState = (kind: DocKind) => {
    const required = mustReupload.includes(kind);
    return {
      required,
      status: required ? 'rejected' : undefined,
      error: docErrors[kind] ?? null,
    };
  };

  const onBack = () => {
    if (step > 0) setStep(step - 1);
    else navigation.goBack();
  };

  const submit = async () => {
    if (!form) return;
    setSubmitError(null);
    const { errors: ve, firstBad } = validateResubmit(form);
    if (firstBad >= 0) {
      setErrors(ve);
      setStep(firstBad);
      toast.show('Please complete the required fields', 'error');
      return;
    }
    // Required-reupload checklist: each flagged kind needs a fresh file.
    const missing = mustReupload.filter((k) => !docs[k]);
    if (missing.length) {
      const e: Partial<Record<DocKind, string>> = {};
      missing.forEach((k) => (e[k] = 'A fresh file is required'));
      setDocErrors(e);
      setStep(4);
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
        {
          legalName: form.legalName,
          gstin: form.gstin,
          ownerName: form.ownerName,
          ownerEmail: form.ownerEmail,
          ownerPhone: toE164(form.ownerPhone),
          contactPhone: form.contactPhone.trim() ? toE164(form.contactPhone) : undefined,
          addressLine: form.addressLine,
          pincode: form.pincode,
          // GSTIN's first 2 digits are the GST state code (no manual entry).
          stateCode: form.gstin.trim().slice(0, 2),
          storeName: form.storeName || undefined,
          pan: form.pan || undefined,
          bankLegalName: form.bankLegalName || undefined,
          bankAccountNumber: form.bankAccountNumber || undefined,
          bankIfsc: form.bankIfsc || undefined,
          documents,
        },
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
      if (Object.keys(de).length) {
        setDocErrors(de);
        setStep(4);
      }
      const line = `[${e?.status ?? 'no response'}] ${e?.message ?? 'Resubmit failed'}`;
      setSubmitError(e?.detail ? `${line}\n${e.detail}` : line);
      toast.show(e?.message ?? 'Resubmit failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  // Password gate: confirm it's the owner before loading the application to edit.
  if (!loaded || !form) {
    return (
      <Screen edges={['top']}>
        <ScrollView
          style={styles.flex}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <BackButton onPress={() => navigation.goBack()} />
          <View style={styles.header}>
            <AppText variant="sectionLabel" color={colors.meta}>Resubmit</AppText>
            <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>Fix & resubmit</AppText>
          </View>
          <Banner tone="warning" title="Confirm it's you" message="Enter your account password to load your application for editing." />
          <Field label="Password" required value={password} onChangeText={setPassword} placeholder="Your account password" secureTextEntry autoCapitalize="none" />
          <PrimaryButton label="Load application" tone="accent" loading={loading} onPress={load} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      {submitError ? (
        <Banner tone="danger" title="Resubmit failed — server said" message={submitError} />
      ) : null}
      {mustReupload.length > 0 ? (
        <Banner
          tone="danger"
          title="Documents to re-upload"
          message={`These must be uploaded fresh: ${mustReupload.map(prettyDoc).join(', ')}.`}
        />
      ) : null}
      <ApplicationWizard
        fields={form}
        onField={onField}
        docs={docs}
        setDoc={setDoc}
        step={step}
        setStep={setStep}
        errors={errors}
        stepCopy={STEP_COPY}
        submitLabel="Resubmit application"
        busy={busy}
        onSubmit={submit}
        onBack={onBack}
        emailEditable={false}
        phoneEditable={false}
        showPasswordField={false}
        docState={docState}
      />
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
});
