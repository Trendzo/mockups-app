import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppText,
  BackButton,
  Chip,
  DocumentUpload,
  Field,
  PrimaryButton,
  Screen,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { checkIdentity, submitApplication } from '../api/onboarding';
import { useOnboarding } from '../store/onboarding';
import { useApplicationDraft, ApplicationFields } from '../store/applicationDraft';
import { useKeyboardHeight } from '../utils/useKeyboardHeight';
import { APPLICATION_DOC_KINDS } from '../types/onboarding';
import { colors, spacing } from '../theme/theme';
import { Haptics } from '../utils/haptics';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(\+91)?[6-9][0-9]{9}$/;
const PIN_RE = /^\d{6}$/;
const STATE_RE = /^\d{2}$/;

const STEPS = [
  { key: 'business', title: 'Business' },
  { key: 'owner', title: 'Owner' },
  { key: 'address', title: 'Address' },
  { key: 'bank', title: 'Bank' },
  { key: 'documents', title: 'Documents' },
] as const;

// Only the first three steps carry required fields; bank + documents are optional.
const REQUIRED_STEPS = [0, 1, 2];

/** Validate one step's fields. Pure — returns an errors map (empty = valid). */
function validateStep(s: number, f: ApplicationFields): Record<string, string> {
  const e: Record<string, string> = {};
  if (s === 0) {
    if (f.legalName.trim().length < 2) e.legalName = '2–120 characters';
    if (f.gstin.trim().length !== 15) e.gstin = 'GSTIN must be 15 characters';
    if (f.pan.trim() && f.pan.trim().length !== 10) e.pan = 'PAN is 10 characters';
  } else if (s === 1) {
    if (f.ownerName.trim().length < 2) e.ownerName = '2–120 characters';
    if (!EMAIL_RE.test(f.ownerEmail.trim())) e.ownerEmail = 'Enter a valid email';
    if (!PHONE_RE.test(f.ownerPhone.trim())) e.ownerPhone = 'Enter a valid Indian phone';
    if (f.password.length < 8 || f.password.length > 128)
      e.password = '8–128 characters (your login password)';
  } else if (s === 2) {
    if (f.addressLine.trim().length < 5) e.addressLine = '5–300 characters';
    if (!PIN_RE.test(f.pincode.trim())) e.pincode = '6-digit pincode';
    if (!STATE_RE.test(f.stateCode.trim())) e.stateCode = '2-digit state code';
  }
  return e;
}

/** Retailer application (the "signup"): a step-by-step wizard with a persisted draft. */
export function ApplicationFormScreen({ navigation }: ScreenProps<'ApplicationForm'>) {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const setApplication = useOnboarding((s) => s.setApplication);

  const f = useApplicationDraft((s) => s.fields);
  const docs = useApplicationDraft((s) => s.docs);
  const step = useApplicationDraft((s) => s.step);
  const hydrated = useApplicationDraft((s) => s.hydrated);
  const setField = useApplicationDraft((s) => s.setField);
  const setDoc = useApplicationDraft((s) => s.setDoc);
  const setStep = useApplicationDraft((s) => s.setStep);
  const clearDraft = useApplicationDraft((s) => s.clear);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Edit a field and clear its error as the user types.
  const set = (k: keyof ApplicationFields) => (v: string) => {
    setField(k, v);
    setErrors((e) => {
      if (!e[k]) return e;
      const next = { ...e };
      delete next[k];
      return next;
    });
  };

  const go = (target: number) => {
    if (target === step) return;
    Haptics.select();
    setStep(target);
  };

  const goBack = () => {
    if (step > 0) go(step - 1);
    else navigation.goBack();
  };

  // Free traversal: Continue just advances; nothing is validated until submit.
  const next = () => {
    if (step < STEPS.length - 1) go(step + 1);
    else onSubmit();
  };

  const onSubmit = async () => {
    // Validate every required step up front; jump to the first with a problem.
    const all: Record<string, string> = {};
    let firstBad = -1;
    for (const s of REQUIRED_STEPS) {
      const e = validateStep(s, f);
      if (Object.keys(e).length && firstBad < 0) firstBad = s;
      Object.assign(all, e);
    }
    setErrors(all);
    if (firstBad >= 0) {
      setStep(firstBad);
      toast.show('Please complete the required fields', 'error');
      return;
    }

    setBusy(true);
    try {
      const check = await checkIdentity(f.ownerEmail, f.ownerPhone);
      if (check.accountExists) {
        toast.show('An account already exists — please log in.', 'info');
        navigation.navigate('Login');
        return;
      }
      if (check.applicationStatus && check.applicationId) {
        setApplication(check.applicationId, f.ownerEmail);
        clearDraft();
        navigation.replace('ApplicationStatus', {
          applicationId: check.applicationId,
          email: f.ownerEmail.trim().toLowerCase(),
        });
        return;
      }

      const documents = APPLICATION_DOC_KINDS.filter((d) => docs[d.kind]).map((d) => ({
        kind: d.kind,
        url: docs[d.kind]!,
      }));

      const created = await submitApplication({
        legalName: f.legalName,
        gstin: f.gstin,
        ownerName: f.ownerName,
        ownerEmail: f.ownerEmail,
        ownerPhone: f.ownerPhone,
        addressLine: f.addressLine,
        pincode: f.pincode,
        stateCode: f.stateCode,
        password: f.password,
        storeName: f.storeName || undefined,
        pan: f.pan || undefined,
        bankLegalName: f.bankLegalName || undefined,
        bankAccountNumber: f.bankAccountNumber || undefined,
        bankIfsc: f.bankIfsc || undefined,
        documents,
      });

      Haptics.success();
      setApplication(created.id, f.ownerEmail);
      clearDraft();
      navigation.replace('ApplicationStatus', {
        applicationId: created.id,
        email: f.ownerEmail.trim().toLowerCase(),
      });
    } catch (err: any) {
      const detail: any[] = err?.details ?? [];
      if (Array.isArray(detail) && detail.length) {
        const e: Record<string, string> = {};
        detail.forEach((d) => {
          const path = d?.instancePath?.replace('/', '') || d?.params?.issue?.path?.[0];
          if (path) e[path] = d?.message ?? 'Invalid';
        });
        setErrors((p) => ({ ...p, ...e }));
      }
      toast.show(err?.message ?? 'Could not submit application', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!hydrated) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.flex} />
      </Screen>
    );
  }

  const isLast = step === STEPS.length - 1;
  // iOS has no window resize, so lift the footer by the keyboard height. Android
  // uses adjustResize (manifest), which already raises it — keep it at safe-area.
  const iosKeyboard = Platform.OS === 'ios' ? keyboardHeight : 0;
  const footerPadBottom = (iosKeyboard > 0 ? iosKeyboard : insets.bottom) + spacing.md;

  return (
    <Screen edges={['top']}>
      <View style={styles.topBar}>
        <BackButton onPress={goBack} />
        <View style={styles.progressWrap}>
          <AppText variant="meta" color={colors.meta}>
            Step {step + 1} of {STEPS.length} · {STEPS[step].title}
          </AppText>
          <View style={styles.track}>
            {STEPS.map((s, i) => (
              <Pressable
                key={s.key}
                onPress={() => go(i)}
                hitSlop={8}
                style={styles.segment}
              >
                <View style={[styles.segFill, i <= step && styles.segFillOn]} />
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={styles.content}
      >
        {step === 0 ? (
          <StepBlock title="Your business" subtitle="Registered details, as on GST.">
            <Field label="Legal name" required value={f.legalName} onChangeText={set('legalName')} placeholder="Registered business name" error={errors.legalName} />
            <Field label="GSTIN" required value={f.gstin} onChangeText={(v) => set('gstin')(v.toUpperCase())} placeholder="15-character GSTIN" autoCapitalize="characters" autoCorrect={false} maxLength={15} error={errors.gstin} />
            <Field label="Store name" value={f.storeName} onChangeText={set('storeName')} placeholder="Shown to customers (optional)" />
            <Field label="PAN" value={f.pan} onChangeText={(v) => set('pan')(v.toUpperCase())} placeholder="10-character PAN (optional)" autoCapitalize="characters" autoCorrect={false} maxLength={10} error={errors.pan} />
          </StepBlock>
        ) : null}

        {step === 1 ? (
          <StepBlock title="Owner & login" subtitle="You'll log in with this email and password once approved.">
            <Field label="Owner name" required value={f.ownerName} onChangeText={set('ownerName')} placeholder="Full name" error={errors.ownerName} />
            <Field label="Owner email" required value={f.ownerEmail} onChangeText={set('ownerEmail')} placeholder="you@store.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} error={errors.ownerEmail} />
            <Field label="Owner phone" required value={f.ownerPhone} onChangeText={set('ownerPhone')} placeholder="+91XXXXXXXXXX" keyboardType="phone-pad" error={errors.ownerPhone} />
            <Field label="Password" required value={f.password} onChangeText={set('password')} placeholder="8–128 characters" secureTextEntry autoCapitalize="none" error={errors.password} />
          </StepBlock>
        ) : null}

        {step === 2 ? (
          <StepBlock title="Store address" subtitle="Where your store is located.">
            <Field label="Address line" required value={f.addressLine} onChangeText={set('addressLine')} placeholder="Shop no, street, area" error={errors.addressLine} />
            <View style={styles.row}>
              <Field label="Pincode" required value={f.pincode} onChangeText={set('pincode')} placeholder="560001" keyboardType="number-pad" maxLength={6} error={errors.pincode} containerStyle={styles.flex} />
              <Field label="State code" required value={f.stateCode} onChangeText={set('stateCode')} placeholder="29" keyboardType="number-pad" maxLength={2} error={errors.stateCode} containerStyle={styles.flex} />
            </View>
          </StepBlock>
        ) : null}

        {step === 3 ? (
          <StepBlock title="Bank (optional)" subtitle="For payouts. You can add this later.">
            <Field label="Bank legal name" value={f.bankLegalName} onChangeText={set('bankLegalName')} placeholder="Account holder name" />
            <Field label="Account number" value={f.bankAccountNumber} onChangeText={set('bankAccountNumber')} placeholder="Bank account number" keyboardType="number-pad" maxLength={20} />
            <Field label="IFSC" value={f.bankIfsc} onChangeText={(v) => set('bankIfsc')(v.toUpperCase())} placeholder="IFSC code" autoCapitalize="characters" autoCorrect={false} maxLength={11} />
          </StepBlock>
        ) : null}

        {step === 4 ? (
          <StepBlock title="Documents (optional)" subtitle="Attach photos to speed up review. You can add missing ones later.">
            {APPLICATION_DOC_KINDS.map((d) => (
              <DocumentUpload
                key={d.kind}
                label={d.label}
                value={docs[d.kind] ?? null}
                onUploaded={(url) => setDoc(d.kind, url)}
                onClear={() => setDoc(d.kind, undefined)}
              />
            ))}
          </StepBlock>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: footerPadBottom }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.jumpRow}
        >
          {STEPS.map((s, i) => (
            <Chip
              key={s.key}
              label={s.title}
              selected={i === step}
              onPress={() => go(i)}
            />
          ))}
        </ScrollView>
        <PrimaryButton
          label={isLast ? 'Submit application' : 'Continue'}
          tone="accent"
          loading={busy}
          onPress={next}
        />
      </View>
    </Screen>
  );
}

function StepBlock({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.stepBlock}>
      <View style={styles.stepHead}>
        <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="meta" color={colors.meta}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  progressWrap: { flex: 1, gap: spacing.xs },
  track: { flexDirection: 'row', gap: spacing.xs },
  segment: { flex: 1, paddingVertical: 6 },
  segFill: { height: 4, borderRadius: 2, backgroundColor: colors.hairline },
  segFillOn: { backgroundColor: colors.ink },
  content: { paddingTop: spacing.md, paddingBottom: spacing.lg },
  stepBlock: { gap: spacing.md },
  stepHead: { gap: spacing.xs, marginBottom: spacing.xs },
  h1: { fontSize: 24, lineHeight: 28 },
  row: { flexDirection: 'row', gap: spacing.md },
  footer: {
    gap: spacing.md,
    paddingTop: spacing.md,
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  jumpRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: 2 },
});
