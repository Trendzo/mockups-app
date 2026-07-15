import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { OTPWidget } from '@msg91comm/sendotp-react-native';
import {
  AppText,
  ApplicationWizard,
  Field,
  Icon,
  OtpInput,
  PressableScale,
  PrimaryButton,
  Screen,
  WizardStepCopy,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { checkIdentity, submitApplication } from '../api/onboarding';
import { useOnboarding } from '../store/onboarding';
import { useApplicationDraft, ApplicationFields } from '../store/applicationDraft';
import { APPLICATION_DOC_KINDS } from '../types/onboarding';
import { colors, spacing } from '../theme/theme';
import { Haptics } from '../utils/haptics';
import { nationalPhone, toE164 } from '../utils/phone';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(\+91)?[6-9][0-9]{9}$/;
const PIN_RE = /^\d{6}$/;
const OTP_LENGTH = 4;

// Public retailer widget credentials (same as login; secret authkey stays server-side).
const WIDGET_ID = '3667636f3464353730373939';
const TOKEN_AUTH = '547225TSvi20QFa026a47d90aP1';

// Only the first three steps carry required fields; bank + documents are optional.
const REQUIRED_STEPS = [0, 1, 2];

const STEP_COPY: [WizardStepCopy, WizardStepCopy, WizardStepCopy, WizardStepCopy, WizardStepCopy] = [
  { title: 'Business', heading: 'Your business', subtitle: 'Registered details, as on GST.' },
  { title: 'Owner', heading: 'Owner & login', subtitle: "You'll log in with this email and password once approved." },
  { title: 'Address', heading: 'Store address', subtitle: 'Where your store is located.' },
  { title: 'Bank', heading: 'Bank', subtitle: 'For payouts. You can add this later.' },
  { title: 'Documents', heading: 'Documents', subtitle: 'Attach photos to speed up review. You can add missing ones later.' },
];

/** Validate one step's fields. Pure - returns an errors map (empty = valid). */
function validateStep(s: number, f: ApplicationFields): Record<string, string> {
  const e: Record<string, string> = {};
  if (s === 0) {
    if (f.legalName.trim().length < 2) e.legalName = '2-120 characters';
    if (f.gstin.trim().length !== 15) e.gstin = 'GSTIN must be 15 characters';
    if (f.pan.trim() && f.pan.trim().length !== 10) e.pan = 'PAN is 10 characters';
  } else if (s === 1) {
    if (f.ownerName.trim().length < 2) e.ownerName = '2-120 characters';
    if (!EMAIL_RE.test(f.ownerEmail.trim())) e.ownerEmail = 'Enter a valid email';
    if (!PHONE_RE.test(f.ownerPhone.trim())) e.ownerPhone = 'Enter a valid Indian phone';
    // Alternate phone is not required; validate only when the user typed one.
    if (f.contactPhone.trim() && !PHONE_RE.test(f.contactPhone.trim()))
      e.contactPhone = 'Enter a valid Indian phone';
    if (f.password.length < 8 || f.password.length > 128)
      e.password = '8-128 characters (your login password)';
  } else if (s === 2) {
    if (f.addressLine.trim().length < 5) e.addressLine = '5-300 characters';
    if (!PIN_RE.test(f.pincode.trim())) e.pincode = '6-digit pincode';
  }
  return e;
}

/** Retailer application (the "signup"): a step-by-step wizard with a persisted draft. */
export function ApplicationFormScreen({ navigation, route }: ScreenProps<'ApplicationForm'>) {
  const toast = useToast();
  const setApplication = useOnboarding((s) => s.setApplication);

  const f = useApplicationDraft((s) => s.fields);
  const docs = useApplicationDraft((s) => s.docs);
  const step = useApplicationDraft((s) => s.step);
  const hydrated = useApplicationDraft((s) => s.hydrated);
  const setField = useApplicationDraft((s) => s.setField);
  const setDoc = useApplicationDraft((s) => s.setDoc);
  const setStep = useApplicationDraft((s) => s.setStep);
  const clearDraft = useApplicationDraft((s) => s.clear);

  // Arrived here from login after verifying the phone via OTP → it's pre-verified
  // and must stay fixed. Otherwise (Create account) the phone is verified inline.
  const verifiedFromLogin = route.params?.verifiedPhone;
  const fromLogin = !!verifiedFromLogin;

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Phone-OTP verification - required before a signup can be submitted.
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [reqId, setReqId] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpErr, setOtpErr] = useState<string | undefined>();

  // Initialise the OTP widget once.
  useEffect(() => {
    try {
      OTPWidget.initializeWidget(WIDGET_ID, TOKEN_AUTH);
    } catch {
      // Native module not linked yet (pre-rebuild) - inline verify will error.
    }
  }, []);

  // Path A: seed + lock the verified phone once the draft has hydrated.
  useEffect(() => {
    if (!hydrated || !verifiedFromLogin) return;
    setField('ownerPhone', nationalPhone(verifiedFromLogin));
    setPhoneVerified(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Edit a field and clear its error as the user types.
  const onField = (k: keyof ApplicationFields, v: string) => {
    setField(k, v);
    setErrors((e) => {
      if (!e[k]) return e;
      const next = { ...e };
      delete next[k];
      return next;
    });
  };
  const set = (k: keyof ApplicationFields) => (v: string) => onField(k, v);

  const goBack = () => {
    if (step > 0) {
      Haptics.select();
      setStep(step - 1);
    } else navigation.goBack();
  };

  // Free traversal, but the Owner step can't be left until the phone is verified.
  const guardNext = (fromStep: number) => {
    if (fromStep === 1 && !phoneVerified) {
      toast.show('Please verify your phone number to continue', 'error');
      return false;
    }
    return true;
  };

  const resetPhoneVerification = () => {
    setPhoneVerified(false);
    setOtpSent(false);
    setReqId(null);
    setOtp('');
    setOtpErr(undefined);
  };

  const sendPhoneOtp = async () => {
    setOtpErr(undefined);
    const national = f.ownerPhone.trim();
    if (!PHONE_RE.test(national)) {
      setErrors((e) => ({ ...e, ownerPhone: 'Enter a valid Indian phone' }));
      return;
    }
    setOtpBusy(true);
    try {
      const res: any = await OTPWidget.sendOTP({
        identifier: toE164(national).replace('+', ''),
      });
      if (res?.type === 'error') throw new Error(res?.message || 'Could not send OTP');
      const rid = typeof res === 'string' ? res : res?.message;
      if (!rid) throw new Error('Could not send OTP');
      setReqId(String(rid));
      setOtp('');
      setOtpSent(true);
      Haptics.select();
    } catch (e: any) {
      setOtpErr(e?.message ?? 'Could not send OTP. Please try again.');
    } finally {
      setOtpBusy(false);
    }
  };

  const verifyPhoneOtp = async (codeOverride?: string) => {
    setOtpErr(undefined);
    const code = (codeOverride ?? otp).replace(/\D/g, '');
    if (code.length !== OTP_LENGTH || !reqId) {
      setOtpErr('Enter the code we sent');
      return;
    }
    setOtpBusy(true);
    try {
      const vr: any = await OTPWidget.verifyOTP({ reqId, otp: code });
      if (vr?.type === 'error') throw new Error(vr?.message || 'Invalid OTP');
      const ok = typeof vr === 'string' ? vr : vr?.message;
      if (!ok) throw new Error('Verification failed');
      Haptics.success();
      setPhoneVerified(true);
      setOtpSent(false);
    } catch (e: any) {
      setOtpErr(e?.message ?? 'Invalid or expired OTP.');
    } finally {
      setOtpBusy(false);
    }
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
    if (!phoneVerified) {
      setStep(1);
      toast.show('Please verify your phone number to submit', 'error');
      return;
    }

    setBusy(true);
    try {
      const check = await checkIdentity(f.ownerEmail, toE164(f.ownerPhone));
      if (check.accountExists) {
        toast.show('An account already exists - please log in.', 'info');
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
        ownerPhone: toE164(f.ownerPhone),
        contactPhone: f.contactPhone.trim() ? toE164(f.contactPhone) : undefined,
        addressLine: f.addressLine,
        pincode: f.pincode,
        // GSTIN's first 2 digits are the GST state code (no manual entry).
        stateCode: f.gstin.trim().slice(0, 2),
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

  // The onboarding phone field carries inline OTP verification. It's injected
  // into the shared wizard's Owner step as a slot so all that state stays here.
  const ownerPhoneSlot = (
    <>
      <Field
        label="Owner phone"
        required
        prefix="+91"
        value={f.ownerPhone}
        onChangeText={(v) => {
          set('ownerPhone')(v);
          if (otpSent) {
            setOtpSent(false);
            setReqId(null);
          }
        }}
        placeholder="9876543210"
        keyboardType="phone-pad"
        maxLength={10}
        editable={!phoneVerified}
        error={errors.ownerPhone}
      />
      {!phoneVerified && otpErr ? (
        <AppText variant="meta" color={colors.danger}>{otpErr}</AppText>
      ) : null}
      {phoneVerified ? (
        <View style={styles.verifiedRow}>
          <Icon name="checkmark-circle" size={18} color={colors.success} />
          <AppText variant="meta" color={colors.success}>Phone verified</AppText>
          {!fromLogin ? (
            <PressableScale onPress={resetPhoneVerification} haptic={false}>
              <AppText variant="meta" color={colors.ink}>· Change</AppText>
            </PressableScale>
          ) : null}
        </View>
      ) : otpSent ? (
        <View style={styles.otpBlock}>
          <AppText variant="meta" color={colors.meta}>
            Enter the {OTP_LENGTH}-digit code sent to +91 {f.ownerPhone}
          </AppText>
          <OtpInput
            value={otp}
            onChange={setOtp}
            length={OTP_LENGTH}
            autoFocus
            disabled={otpBusy}
            onComplete={(code) => {
              verifyPhoneOtp(code);
            }}
          />
          <View style={styles.otpActions}>
            <PressableScale
              onPress={() => {
                setOtpSent(false);
                setReqId(null);
                setOtp('');
              }}
              haptic={false}
            >
              <AppText variant="meta" color={colors.meta}>Cancel</AppText>
            </PressableScale>
            <PressableScale onPress={sendPhoneOtp} haptic={false} disabled={otpBusy}>
              <AppText variant="meta" color={colors.ink}>Resend OTP</AppText>
            </PressableScale>
          </View>
        </View>
      ) : (
        <PrimaryButton label="Verify phone" tone="ink" loading={otpBusy} onPress={sendPhoneOtp} />
      )}
    </>
  );

  return (
    <Screen edges={['top']}>
      <ApplicationWizard
        fields={f}
        onField={onField}
        docs={docs}
        setDoc={setDoc}
        step={step}
        setStep={setStep}
        errors={errors}
        stepCopy={STEP_COPY}
        submitLabel="Submit application"
        busy={busy}
        onSubmit={onSubmit}
        onBack={goBack}
        ownerPhoneSlot={ownerPhoneSlot}
        showPasswordField
        onPickLocation={() => navigation.navigate('LocationPicker')}
        beforeNext={guardNext}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  otpBlock: { gap: spacing.sm },
  otpActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
