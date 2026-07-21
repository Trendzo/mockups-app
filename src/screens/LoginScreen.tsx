import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { OTPWidget } from '@msg91comm/sendotp-react-native';
import {
  AppText,
  Banner,
  Field,
  HeroHeadline,
  Icon,
  OtpInput,
  PressableScale,
  PrimaryButton,
  Screen,
  useToast,
} from '../components';
import { ScreenProps } from '../navigation/types';
import { loginRetailer, loginRetailerOtp } from '../api/auth';
import { useAuth } from '../store/auth';
import { useRecentPhones } from '../store/recentPhones';
import { colors, spacing } from '../theme/theme';
import { Haptics } from '../utils/haptics';
import { PRIVACY_URL, SUPPORT_URL, TERMS_URL } from '../config/legal';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NATIONAL_RE = /^[0-9]{6,14}$/;
const RESEND_SECONDS = 30;
const OTP_LENGTH = 4;

// Public retailer widget credentials (safe to ship; the secret authkey stays server-side).
const WIDGET_ID = '3667636f3464353730373939';
const TOKEN_AUTH = '547225TSvi20QFa026a47d90aP1';

// India-only: dial code is fixed at +91 (no country selector).
const DIAL_CODE = '91';

/** Display a 10-digit number as "XXXXX XXXXX" (space after 5). Storage stays raw. */
const formatPhone = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 10);
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
};

export function LoginScreen({ navigation, route }: ScreenProps<'Login'>) {
  const toast = useToast();
  const setAuth = useAuth(s => s.setAuth);
  const logoutReason = useAuth(s => s.logoutReason);
  const clearLogoutReason = useAuth(s => s.clearLogoutReason);

  const params = route.params;
  // OTP is the primary method; email/password is the secondary fallback. A signup
  // that collided with an existing account routes here with the method to use.
  const [method, setMethod] = useState<'phone' | 'email'>(params?.method ?? 'phone');

  // Phone-OTP state — prefill the national number when the signup handed us one.
  const [phone, setPhone] = useState(
    (params?.prefillPhone ?? '').replace(/\D/g, '').replace(/^91/, '').slice(-10),
  );
  const recentPhones = useRecentPhones((s) => s.phones);
  const addRecentPhone = useRecentPhones((s) => s.add);
  const removeRecentPhone = useRecentPhones((s) => s.remove);
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [reqId, setReqId] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [phoneErr, setPhoneErr] = useState<string | undefined>();
  const [otpErr, setOtpErr] = useState<string | undefined>();
  const [resendIn, setResendIn] = useState(0);

  // Email state — prefilled from a colliding signup so the user just types the password.
  const [email, setEmail] = useState(params?.prefillEmail ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  );

  useEffect(() => {
    try {
      OTPWidget.initializeWidget(WIDGET_ID, TOKEN_AUTH);
    } catch {
      // Native module not linked yet (pre-rebuild) - phone login will error;
      // email login still works.
    }
  }, []);

  // Resend cooldown ticker.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // ---- Phone OTP ----------------------------------------------------------
  const sendOtp = async () => {
    setPhoneErr(undefined);
    const national = phone.trim();
    if (!NATIONAL_RE.test(national)) {
      setPhoneErr('Enter a valid phone number');
      return;
    }
    setSending(true);
    try {
      const res: any = await OTPWidget.sendOTP({
        identifier: `${DIAL_CODE}${national}`,
      });
      console.log('[LoginScreen] sendOTP response:', res);
      if (res?.type === 'error')
        throw new Error(res?.message || 'Could not send OTP');
      const rid = typeof res === 'string' ? res : res?.message;
      if (!rid) throw new Error('Could not send OTP');
      setReqId(String(rid));
      setOtp('');
      setStep('otp');
      setResendIn(RESEND_SECONDS);
      addRecentPhone(national); // remember for quick refill next time
      Haptics.select();
    } catch (e: any) {
      console.error('[LoginScreen] sendOtp failed:', {
        identifier: `${DIAL_CODE}${national}`,
        message: e?.message,
        code: e?.code,
        status: e?.status,
      });
      console.error(e);
      setPhoneErr(e?.message ?? 'Could not send OTP. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const resendOtp = async () => {
    if (resendIn > 0 || !reqId) return;
    try {
      await OTPWidget.retryOTP({ reqId });
      setResendIn(RESEND_SECONDS);
      toast.show('OTP resent', 'info');
    } catch (e: any) {
      toast.show(e?.message ?? 'Could not resend OTP', 'error');
    }
  };

  const verifyOtp = async (codeOverride?: string) => {
    setOtpErr(undefined);
    const code = (codeOverride ?? otp).replace(/\D/g, '');
    if (code.length !== OTP_LENGTH || !reqId) {
      setOtpErr('Enter the code we sent');
      return;
    }
    if (verifying) return;
    setVerifying(true);
    try {
      const vr: any = await OTPWidget.verifyOTP({ reqId, otp: code });
      console.log('[LoginScreen] verifyOTP response:', vr);
      if (vr?.type === 'error') throw new Error(vr?.message || 'Invalid OTP');
      const accessToken = typeof vr === 'string' ? vr : vr?.message;
      if (!accessToken) throw new Error('Verification failed');
      const result = await loginRetailerOtp(String(accessToken));
      console.log(
        '[LoginScreen] loginRetailerOtp succeeded - token received:',
        !!result?.token,
      );
      Haptics.success();
      setAuth(result); // the app gate then routes on /retailer/me
    } catch (e: any) {
      console.error('[LoginScreen] verifyOtp failed:', {
        message: e?.message,
        code: e?.code,
        status: e?.status,
      });
      console.error(e);
      // Backend AuthError carries code/status; MSG91 failures are plain Errors.
      // The verified phone matched a pending/rejected application → route to its
      // status/resubmit screen (both key on the owner email the backend returns).
      if (
        e?.code === 'application_pending' &&
        e?.applicationId &&
        e?.ownerEmail
      ) {
        navigation.navigate('ApplicationStatus', {
          applicationId: e.applicationId,
          email: e.ownerEmail,
        });
        return;
      }
      if (
        e?.code === 'application_rejected' &&
        e?.applicationId &&
        e?.ownerEmail
      ) {
        navigation.navigate('Resubmit', {
          applicationId: e.applicationId,
          email: e.ownerEmail,
        });
        return;
      }
      // Verified phone with no account and no application → start signup.
      if (e?.code === 'invalid_credentials' && e?.status) {
        toast.show(
          "No account for this number yet - let's get you set up.",
          'info',
        );
        // Phone is already verified via OTP - carry it into the form (locked).
        navigation.navigate('ApplicationForm', { verifiedPhone: phone.trim() });
        return;
      }
      if (e?.status === 503) {
        toast.show(
          'OTP login is temporarily unavailable - use email + password.',
          'error',
        );
        setMethod('email');
        return;
      }
      // Pending/rejected without routing details (older backend) or a plain
      // MSG91/verify failure.
      if (
        e?.code === 'application_pending' ||
        e?.code === 'application_rejected'
      ) {
        toast.show(e.message ?? 'Your application is under review.', 'info');
      } else {
        setOtpErr(e?.message ?? 'Invalid or expired OTP.');
      }
    } finally {
      setVerifying(false);
    }
  };

  // ---- Email + password ---------------------------------------------------
  const onEmailSubmit = async () => {
    const e: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) e.email = 'Enter a valid email';
    if (password.length < 4) e.password = 'At least 4 characters';
    setErrors(e);
    if (Object.keys(e).length) return;

    setBusy(true);
    try {
      const result = await loginRetailer({ email, password });
      Haptics.success();
      setAuth(result);
    } catch (err: any) {
      if (err?.code === 'application_pending' && err.applicationId) {
        navigation.navigate('ApplicationStatus', {
          applicationId: err.applicationId,
          email: email.trim().toLowerCase(),
        });
        return;
      }
      if (err?.code === 'application_rejected' && err.applicationId) {
        navigation.navigate('Resubmit', {
          applicationId: err.applicationId,
          email: email.trim().toLowerCase(),
        });
        return;
      }
      if (err?.code === 'invalid_credentials') {
        setErrors({ password: 'Incorrect email or password' });
      }
      toast.show(err?.message ?? 'Login failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const subtitle =
    method === 'email'
      ? 'Sign in with your email and password.'
      : step === 'phone'
      ? 'Log in with your phone number.'
      : `Enter the code sent to +${DIAL_CODE} ${formatPhone(phone)}.`;

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
        <View style={styles.header}>
          <AppText variant="sectionLabel" color={colors.meta}>
            Trendzo Studio
          </AppText>
          <HeroHeadline
            fontSize={48}
            style={styles.headline}
            lines={[{ text: 'Log in' }]}
          />
          <AppText variant="body" color={colors.meta}>
            {subtitle}
          </AppText>
        </View>

        {logoutReason === 'expired' ? (
          <Banner
            tone="warning"
            title="Session expired"
            message="You were signed out for your security. Please sign in again."
            actionLabel="Dismiss"
            onAction={clearLogoutReason}
          />
        ) : null}

        {method === 'phone' ? (
          step === 'phone' ? (
            <View style={styles.form}>
              <Field
                label="Phone number"
                required
                prefix="+91"
                value={formatPhone(phone)}
                onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))}
                placeholder="98765 43210"
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                maxLength={11}
                error={phoneErr}
              />

              {/* Tap a recently-used number to refill it. */}
              {recentPhones.filter((p) => p !== phone.trim()).length ? (
                <View style={styles.recentWrap}>
                  <AppText variant="meta" color={colors.meta}>
                    Recent
                  </AppText>
                  <View style={styles.recentRow}>
                    {recentPhones
                      .filter((p) => p !== phone.trim())
                      .map((p) => (
                        <View key={p} style={styles.recentChip}>
                          <PressableScale
                            onPress={() => {
                              setPhone(p);
                              setPhoneErr(undefined);
                            }}
                            haptic={false}
                            style={styles.recentChipMain}
                          >
                            <Icon name="time-outline" size={13} color={colors.meta} />
                            <AppText variant="meta" color={colors.ink}>
                              +91 {formatPhone(p)}
                            </AppText>
                          </PressableScale>
                          <PressableScale
                            onPress={() => removeRecentPhone(p)}
                            haptic={false}
                            hitSlop={8}
                            style={styles.recentChipX}
                          >
                            <Icon name="close" size={12} color={colors.meta} />
                          </PressableScale>
                        </View>
                      ))}
                  </View>
                </View>
              ) : null}

              <PrimaryButton
                label="Send OTP"
                tone="accent"
                loading={sending}
                onPress={sendOtp}
              />
            </View>
          ) : (
            <View style={styles.form}>
              <View style={styles.otpField}>
                <AppText variant="sectionLabel" color={colors.meta}>
                  Enter the {OTP_LENGTH}-digit code
                </AppText>
                <OtpInput
                  value={otp}
                  onChange={setOtp}
                  length={OTP_LENGTH}
                  autoFocus
                  disabled={verifying}
                  onComplete={(code) => void verifyOtp(code)}
                />
                {otpErr ? (
                  <AppText variant="meta" color={colors.danger}>
                    {otpErr}
                  </AppText>
                ) : null}
              </View>
              <PrimaryButton
                label="Verify & log in"
                tone="accent"
                loading={verifying}
                onPress={() => verifyOtp()}
              />
              <View style={styles.otpRow}>
                <PressableScale
                  haptic={false}
                  onPress={() => {
                    setStep('phone');
                    setOtp('');
                    setOtpErr(undefined);
                  }}
                >
                  <AppText variant="bodyMedium" color={colors.ink}>
                    Edit number
                  </AppText>
                </PressableScale>
                <PressableScale
                  haptic={false}
                  disabled={resendIn > 0}
                  onPress={resendOtp}
                >
                  <AppText
                    variant="bodyMedium"
                    color={resendIn > 0 ? colors.meta : colors.ink}
                  >
                    {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend OTP'}
                  </AppText>
                </PressableScale>
              </View>
            </View>
          )
        ) : (
          <View style={styles.form}>
            <Field
              label="Email"
              required
              value={email}
              onChangeText={setEmail}
              placeholder="you@store.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              error={errors.email}
            />
            <Field
              label="Password"
              required
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry
              autoCapitalize="none"
              error={errors.password}
            />
            <PrimaryButton
              label="Log in"
              tone="accent"
              loading={busy}
              onPress={onEmailSubmit}
            />
          </View>
        )}

        {/* Switch primary/secondary method */}
        <PressableScale
          haptic={false}
          style={styles.linkRow}
          onPress={() => setMethod(method === 'phone' ? 'email' : 'phone')}
        >
          <AppText variant="body" color={colors.meta}>
            {method === 'phone' ? 'Prefer email? ' : 'Prefer phone? '}
          </AppText>
          <AppText variant="bodyMedium" color={colors.ink}>
            {method === 'phone' ? 'Log in with email' : 'Log in with phone'}
          </AppText>
        </PressableScale>

        <PressableScale
          onPress={() => navigation.navigate('ApplicationForm')}
          haptic={false}
          style={styles.linkRow}
        >
          <AppText variant="body" color={colors.meta}>
            New here?{' '}
          </AppText>
          <AppText variant="bodyMedium" color={colors.ink}>
            Create an account
          </AppText>
        </PressableScale>

        <View style={styles.legalRow}>
          <PressableScale
            haptic={false}
            onPress={() => Linking.openURL(PRIVACY_URL)}
          >
            <AppText variant="meta" color={colors.meta}>
              Privacy
            </AppText>
          </PressableScale>
          <PressableScale
            haptic={false}
            onPress={() => Linking.openURL(TERMS_URL)}
          >
            <AppText variant="meta" color={colors.meta}>
              Terms
            </AppText>
          </PressableScale>
          <PressableScale
            haptic={false}
            onPress={() => Linking.openURL(SUPPORT_URL)}
          >
            <AppText variant="meta" color={colors.meta}>
              Support
            </AppText>
          </PressableScale>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingTop: spacing.xxl, gap: spacing.xl },
  header: { gap: spacing.sm },
  headline: { marginVertical: spacing.xs },
  form: { gap: spacing.lg },
  recentWrap: { gap: spacing.xs, marginTop: -spacing.sm },
  recentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingLeft: spacing.sm + 2,
    paddingRight: spacing.xs,
    height: 34,
    gap: spacing.xs,
  },
  recentChipMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  recentChipX: { padding: 4 },
  otpField: { gap: spacing.sm },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingBottom: spacing.lg,
  },
});
