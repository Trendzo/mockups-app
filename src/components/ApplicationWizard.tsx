import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { BackButton } from './BackButton';
import { Chip } from './Chip';
import { DocumentUpload } from './DocumentUpload';
import { Field } from './Field';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { PrimaryButton } from './PrimaryButton';
import { ApplicationFields } from '../store/applicationDraft';
import { APPLICATION_DOC_KINDS, DocKind } from '../types/onboarding';
import { useKeyboardHeight } from '../utils/useKeyboardHeight';
import { colors, radii, spacing } from '../theme/theme';
import { Haptics } from '../utils/haptics';

export interface WizardStepCopy {
  /** Short title shown in the progress bar + jump chip. */
  title: string;
  /** Heading shown at the top of the step body. */
  heading: string;
  subtitle?: string;
}

export interface DocFieldState {
  required?: boolean;
  status?: string;
  error?: string | null;
}

export interface ApplicationWizardProps {
  fields: ApplicationFields;
  onField: (k: keyof ApplicationFields, v: string) => void;
  docs: Partial<Record<DocKind, string>>;
  setDoc: (kind: DocKind, url: string | undefined) => void;
  step: number;
  setStep: (n: number) => void;
  errors: Record<string, string>;
  /** Per-step titles/headings - lets each screen (apply vs resubmit) differ. */
  stepCopy: [WizardStepCopy, WizardStepCopy, WizardStepCopy, WizardStepCopy, WizardStepCopy];
  submitLabel: string;
  busy: boolean;
  onSubmit: () => void;
  onBack: () => void;

  // ── Owner step customisation ──
  emailEditable?: boolean; // default true
  phoneEditable?: boolean; // default true (ignored when ownerPhoneSlot is given)
  /** Onboarding injects its phone field + inline OTP UI here. */
  ownerPhoneSlot?: React.ReactNode;
  showPasswordField?: boolean; // default true

  // ── Address step ──
  /** When provided, shows the "pick on map" button (onboarding only). */
  onPickLocation?: () => void;

  // ── Documents step ──
  docState?: (kind: DocKind) => DocFieldState;

  // ── Navigation guard (e.g. block leaving Owner until phone verified) ──
  beforeNext?: (fromStep: number) => boolean;
}

/**
 * The shared retailer-application form: a 5-step wizard (Business → Owner →
 * Address → Bank → Documents). Used by both the onboarding "apply" screen and
 * the "fix & resubmit" screen so the exact same fields are editable in both.
 * Only the headings, the submit action, and a few onboarding-only bits (phone
 * OTP, map picker, login password) differ - all passed in via props.
 */
export function ApplicationWizard({
  fields: f,
  onField,
  docs,
  setDoc,
  step,
  setStep,
  errors,
  stepCopy,
  submitLabel,
  busy,
  onSubmit,
  onBack,
  emailEditable = true,
  phoneEditable = true,
  ownerPhoneSlot,
  showPasswordField = true,
  onPickLocation,
  docState,
  beforeNext,
}: ApplicationWizardProps) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();

  const set = (k: keyof ApplicationFields) => (v: string) => onField(k, v);

  const go = (target: number) => {
    if (target === step) return;
    Haptics.select();
    setStep(target);
  };

  const isLast = step === stepCopy.length - 1;
  const next = () => {
    if (beforeNext && !beforeNext(step)) return;
    if (step < stepCopy.length - 1) go(step + 1);
    else onSubmit();
  };

  // iOS has no window resize, so lift the footer by the keyboard height. Android
  // uses adjustResize (manifest), which already raises it - keep it at safe-area.
  const iosKeyboard = Platform.OS === 'ios' ? keyboardHeight : 0;
  const footerPadBottom = (iosKeyboard > 0 ? iosKeyboard : insets.bottom) + spacing.md;

  const doc = (kind: DocKind): DocFieldState => docState?.(kind) ?? {};

  return (
    <>
      <View style={styles.topBar}>
        <BackButton onPress={onBack} />
        <View style={styles.progressWrap}>
          <AppText variant="meta" color={colors.meta}>
            Step {step + 1} of {stepCopy.length} · {stepCopy[step].title}
          </AppText>
          <View style={styles.track}>
            {stepCopy.map((s, i) => (
              <Pressable key={s.title} onPress={() => go(i)} hitSlop={8} style={styles.segment}>
                <View style={[styles.segFill, i <= step && styles.segFillOn]} />
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        // "always" so a tap (e.g. a document row) fires on the FIRST press even
        // when the keyboard is open - "handled" makes the first tap only dismiss it.
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="interactive"
        contentContainerStyle={styles.content}
      >
        {step === 0 ? (
          <StepBlock copy={stepCopy[0]}>
            <Field label="Legal name" required value={f.legalName} onChangeText={set('legalName')} placeholder="Registered business name" error={errors.legalName} />
            <Field label="GSTIN" required value={f.gstin} onChangeText={(v) => set('gstin')(v.toUpperCase())} placeholder="15-character GSTIN" autoCapitalize="characters" autoCorrect={false} maxLength={15} error={errors.gstin} />
            <Field label="Store name" value={f.storeName} onChangeText={set('storeName')} placeholder="Shown to customers" />
            <Field label="PAN" value={f.pan} onChangeText={(v) => set('pan')(v.toUpperCase())} placeholder="10-character PAN" autoCapitalize="characters" autoCorrect={false} maxLength={10} error={errors.pan} />
          </StepBlock>
        ) : null}

        {step === 1 ? (
          <StepBlock copy={stepCopy[1]}>
            <Field label="Owner name" required value={f.ownerName} onChangeText={set('ownerName')} placeholder="Full name" error={errors.ownerName} />
            <Field label="Owner email" required editable={emailEditable} value={f.ownerEmail} onChangeText={set('ownerEmail')} placeholder="you@store.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} error={errors.ownerEmail} />
            {ownerPhoneSlot ?? (
              <Field label="Owner phone" required prefix="+91" editable={phoneEditable} value={f.ownerPhone} onChangeText={set('ownerPhone')} placeholder="9876543210" keyboardType="phone-pad" maxLength={10} error={errors.ownerPhone} />
            )}
            <Field label="Alternate phone" prefix="+91" value={f.contactPhone} onChangeText={set('contactPhone')} placeholder="9876543210" keyboardType="phone-pad" maxLength={10} error={errors.contactPhone} />
            {showPasswordField ? (
              <Field label="Password" required value={f.password} onChangeText={set('password')} placeholder="8-128 characters" secureTextEntry autoCapitalize="none" error={errors.password} />
            ) : null}
          </StepBlock>
        ) : null}

        {step === 2 ? (
          <StepBlock copy={stepCopy[2]}>
            {onPickLocation ? (
              <PressableScale onPress={onPickLocation} style={styles.mapBtn}>
                <Icon name="map-outline" size={18} color={colors.accentInk} />
                <AppText variant="bodyMedium" color={colors.accentInk}>
                  Pick on map · use my location
                </AppText>
              </PressableScale>
            ) : null}
            <Field label="Address line" required value={f.addressLine} onChangeText={set('addressLine')} placeholder="Shop no, street, area, landmark" error={errors.addressLine} />
            <Field label="Pincode" required value={f.pincode} onChangeText={set('pincode')} placeholder="560001" keyboardType="number-pad" maxLength={6} error={errors.pincode} />
          </StepBlock>
        ) : null}

        {step === 3 ? (
          <StepBlock copy={stepCopy[3]}>
            <Field label="Bank legal name" value={f.bankLegalName} onChangeText={set('bankLegalName')} placeholder="Account holder name" />
            <Field label="Account number" value={f.bankAccountNumber} onChangeText={set('bankAccountNumber')} placeholder="Bank account number" keyboardType="number-pad" maxLength={20} />
            <Field label="IFSC" value={f.bankIfsc} onChangeText={(v) => set('bankIfsc')(v.toUpperCase())} placeholder="IFSC code" autoCapitalize="characters" autoCorrect={false} maxLength={11} />
          </StepBlock>
        ) : null}

        {step === 4 ? (
          <StepBlock copy={stepCopy[4]}>
            {APPLICATION_DOC_KINDS.map((d) => {
              const ds = doc(d.kind);
              return (
                <DocumentUpload
                  key={d.kind}
                  label={d.label}
                  required={ds.required}
                  status={ds.status}
                  value={docs[d.kind] ?? null}
                  error={ds.error ?? null}
                  onUploaded={(url) => setDoc(d.kind, url)}
                  onClear={() => setDoc(d.kind, undefined)}
                />
              );
            })}
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
          {stepCopy.map((s, i) => (
            <Chip key={s.title} label={s.title} selected={i === step} onPress={() => go(i)} />
          ))}
        </ScrollView>
        <PrimaryButton
          label={isLast ? submitLabel : 'Continue'}
          tone="accent"
          loading={busy}
          onPress={next}
        />
      </View>
    </>
  );
}

function StepBlock({ copy, children }: { copy: WizardStepCopy; children: React.ReactNode }) {
  return (
    <View style={styles.stepBlock}>
      <View style={styles.stepHead}>
        <AppText variant="cardTitle" color={colors.ink} style={styles.h1}>
          {copy.heading}
        </AppText>
        {copy.subtitle ? (
          <AppText variant="meta" color={colors.meta}>
            {copy.subtitle}
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
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: radii.sm + 4,
    backgroundColor: colors.accent,
  },
  footer: {
    gap: spacing.md,
    paddingTop: spacing.md,
    backgroundColor: colors.canvas,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  jumpRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: 2 },
});
