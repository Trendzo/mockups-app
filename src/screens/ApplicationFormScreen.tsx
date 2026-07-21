import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { OTPWidget } from '@msg91comm/sendotp-react-native';
import {
  AppText,
  ApplicationWizard,
  BottomSheet,
  Field,
  Icon,
  LegalConsentRow,
  OtpInput,
  PressableScale,
  PrimaryButton,
  Screen,
  SheetSurface,
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
import { isGstStateCode } from '../utils/gstStates';
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
    // A GSTIN always starts with the 2-digit GST state code.
    else if (!/^\d{2}/.test(f.gstin.trim()))
      e.gstin = 'GSTIN must start with the 2-digit state code (e.g. 27 for Maharashtra)';
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
  const [legalAgreed, setLegalAgreed] = useState(false);
  // Both email AND phone already belong to an existing account → offer both login
  // methods in a modal. Holds the prefill values to carry into LoginScreen.
  const [loginPrompt, setLoginPrompt] = useState<{ email: string; phone: string } | null>(null);

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
    if (!legalAgreed) {
      toast.show('Please accept the Terms & Conditions and Privacy Policy', 'error');
      return;
    }

    // GST state code: the GSTIN's first 2 digits, else the code geocoded from
    // the store address (LocationPicker). Catch a bad one HERE with a fixable
    // field error instead of the backend's opaque "stateCode" rejection.
    const gstPrefix = f.gstin.trim().slice(0, 2);
    const stateCode = isGstStateCode(gstPrefix) ? gstPrefix : f.stateCode.trim();
    if (!isGstStateCode(stateCode)) {
      setErrors((p) => ({
        ...p,
        gstin: 'GSTIN must start with the 2-digit state code (e.g. 27 for Maharashtra)',
      }));
      setStep(0);
      toast.show('Check the GSTIN - it must start with the 2-digit state code', 'error');
      return;
    }

    // An existing ACCOUNT owns one/both identifiers → route to the exact login
    // method. Both taken → let the user pick (modal). Reused by the pre-check and
    // the submit-race fallback.
    const handleAccountCollision = (emailTaken: boolean, phoneTaken: boolean) => {
      const email = f.ownerEmail.trim().toLowerCase();
      const phoneE164 = toE164(f.ownerPhone);
      if (emailTaken && phoneTaken) {
        setErrors((p) => ({ ...p, ownerEmail: 'Already registered', ownerPhone: 'Already registered' }));
        setLoginPrompt({ email, phone: phoneE164 });
        toast.show('You already have an account — choose how to log in.', 'info');
        return;
      }
      if (emailTaken) {
        setErrors((p) => ({ ...p, ownerEmail: 'This email is already registered' }));
        toast.show('This email is already registered — log in with your password.', 'info');
        navigation.navigate('Login', { method: 'email', prefillEmail: email });
        return;
      }
      setErrors((p) => ({ ...p, ownerPhone: 'This phone number is already registered' }));
      toast.show('This phone number is already registered — log in with an OTP.', 'info');
      navigation.navigate('Login', { method: 'phone', prefillPhone: phoneE164 });
    };

    setBusy(true);
    try {
      const check = await checkIdentity(f.ownerEmail, toE164(f.ownerPhone));
      if (check.accountExists) {
        // Prefer the field-granular account flags; fall back to the union if a
        // stale backend omits them (both-true keeps the safe "pick a method" modal).
        const emailAcc = check.accountEmailTaken ?? check.emailTaken;
        const phoneAcc = check.accountPhoneTaken ?? check.phoneTaken;
        handleAccountCollision(emailAcc, phoneAcc);
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
        // Validated above: GSTIN prefix, else the geocoded address state.
        stateCode,
        password: f.password,
        storeName: f.storeName || undefined,
        pan: f.pan || undefined,
        bankLegalName: f.bankLegalName || undefined,
        bankAccountNumber: f.bankAccountNumber || undefined,
        bankIfsc: f.bankIfsc || undefined,
        documents,
        acceptLegal: true,
      });

      Haptics.success();
      setApplication(created.id, f.ownerEmail);
      clearDraft();
      navigation.replace('ApplicationStatus', {
        applicationId: created.id,
        email: f.ownerEmail.trim().toLowerCase(),
      });
    } catch (err: any) {
      // Race: identifier got taken between the pre-check and submit. The backend
      // names which field(s) — route to the matching login exactly as the
      // pre-check would have.
      if (err?.code === 'signup_identifier_taken') {
        const d = (err.details ?? {}) as {
          accountEmailTaken?: boolean;
          accountPhoneTaken?: boolean;
          emailTaken?: boolean;
          phoneTaken?: boolean;
        };
        handleAccountCollision(
          !!(d.accountEmailTaken ?? d.emailTaken),
          !!(d.accountPhoneTaken ?? d.phoneTaken),
        );
        return;
      }
      const detail: any[] = Array.isArray(err?.details) ? err.details : [];
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
        consentSlot={
          <LegalConsentRow
            agreed={legalAgreed}
            onToggle={() => setLegalAgreed((a) => !a)}
            onView={(kind) => navigation.navigate('LegalDoc', { kind })}
          />
        }
      />

      {/* Both email AND phone already belong to an existing account → pick a method. */}
      <BottomSheet visible={loginPrompt != null} onClose={() => setLoginPrompt(null)}>
        <SheetSurface style={styles.sheet}>
          <AppText variant="cardTitle" color={colors.ink} style={styles.sheetTitle}>
            You already have an account
          </AppText>
          <AppText variant="meta" color={colors.meta}>
            Your email and phone number are both registered. Log in to continue.
          </AppText>
          <LoginOption
            icon="call-outline"
            title="Log in with phone OTP"
            subtitle={loginPrompt ? `+91 ${loginPrompt.phone.replace(/^\+?91/, '')}` : ''}
            onPress={() => {
              const p = loginPrompt;
              setLoginPrompt(null);
              if (p) navigation.navigate('Login', { method: 'phone', prefillPhone: p.phone });
            }}
          />
          <LoginOption
            icon="mail-outline"
            title="Log in with email & password"
            subtitle={loginPrompt?.email ?? ''}
            onPress={() => {
              const p = loginPrompt;
              setLoginPrompt(null);
              if (p) navigation.navigate('Login', { method: 'email', prefillEmail: p.email });
            }}
          />
          <PrimaryButton label="Cancel" tone="surface" onPress={() => setLoginPrompt(null)} />
        </SheetSurface>
      </BottomSheet>
    </Screen>
  );
}

function LoginOption({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} style={styles.optionRow} toScale={0.98}>
      <View style={styles.optionIcon}>
        <Icon name={icon} size={20} color={colors.ink} />
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyMedium" color={colors.ink}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="meta" color={colors.meta} numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={18} color={colors.meta} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  otpBlock: { gap: spacing.sm },
  otpActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheet: { padding: spacing.lg, gap: spacing.md },
  sheetTitle: { fontSize: 20, lineHeight: 24 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.canvas,
    borderRadius: 14,
    padding: spacing.md,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
