import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { AppText, PrimaryButton } from '../components';
import { LoginScreen } from '../screens/LoginScreen';
import { ApplicationFormScreen } from '../screens/ApplicationFormScreen';
import { ApplicationStatusScreen } from '../screens/ApplicationStatusScreen';
import { ResubmitScreen } from '../screens/ResubmitScreen';
import { LocationPickerScreen } from '../screens/LocationPickerScreen';
import { PendingApprovalScreen } from '../screens/PendingApprovalScreen';
import { LegalDocViewerScreen, PrivacyScreen, TermsScreen } from '../screens/TermsScreen';
import { MainTabs } from './MainTabs';
import { SelectPhotosScreen } from '../screens/SelectPhotosScreen';
import { CaptureScreen } from '../screens/CaptureScreen';
import { ConfigureScreen } from '../screens/ConfigureScreen';
import { GeneratingScreen } from '../screens/GeneratingScreen';
import { ReviewResultsScreen } from '../screens/ReviewResultsScreen';
import { PublishSuccessScreen } from '../screens/PublishSuccessScreen';
import { CreationsScreen } from '../screens/CreationsScreen';
import { ScanScreen } from '../screens/ScanScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { VariantFormScreen } from '../screens/VariantFormScreen';
import { BasicsStep } from '../screens/ProductWizard/BasicsStep';
import { VariantsStep } from '../screens/ProductWizard/VariantsStep';
import { DetailsStep } from '../screens/ProductWizard/DetailsStep';
import { ReviewStep } from '../screens/ProductWizard/ReviewStep';
import { KycScreen } from '../screens/KycScreen';
import { ChangeRequestScreen } from '../screens/ChangeRequestScreen';
import { useAuth } from '../store/auth';
import { useSettings } from '../store/settings';
import { useOnboarding } from '../store/onboarding';
import { useRetailerMe } from '../api/onboardingHooks';
import { colors } from '../theme/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: colors.canvas,
  },
  errorTitle: { fontSize: 22, lineHeight: 26, textAlign: 'center' },
  errorMsg: { textAlign: 'center', marginBottom: 8 },
});

function Splash() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.ink} />
    </View>
  );
}

function ProfileError({
  message,
  onRetry,
  onLogout,
}: {
  message?: string;
  onRetry: () => void;
  onLogout: () => void;
}) {
  return (
    <View style={styles.errorWrap}>
      <AppText variant="cardTitle" color={colors.ink} style={styles.errorTitle}>
        Couldn't load your account
      </AppText>
      <AppText variant="body" color={colors.meta} style={styles.errorMsg}>
        {message ?? 'Please check your connection and try again.'}
      </AppText>
      <PrimaryButton label="Try again" tone="accent" onPress={onRetry} />
      <PrimaryButton label="Log out" tone="ghost" onPress={onLogout} />
    </View>
  );
}

export function RootNavigator() {
  const token = useAuth((s) => s.token);
  const authHydrated = useAuth((s) => s.hydrated);
  const settingsHydrated = useSettings((s) => s.hydrated);
  const onbHydrated = useOnboarding((s) => s.hydrated);
  const hydrated = authHydrated && settingsHydrated && onbHydrated;

  // Fetch /retailer/me only once logged in; drives the app gate.
  const me = useRetailerMe(!!token && hydrated);

  // Show the loader (never a blank/black null render) while stores rehydrate.
  if (!hydrated) return <Splash />;

  const options = {
    headerShown: false,
    contentStyle: { backgroundColor: colors.canvas },
    animation: 'slide_from_right' as const,
    gestureEnabled: true,
  };

  // Logged out → auth + application flow.
  if (!token) {
    return (
      <Stack.Navigator screenOptions={options}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="ApplicationForm" component={ApplicationFormScreen} />
        <Stack.Screen name="ApplicationStatus" component={ApplicationStatusScreen} />
        <Stack.Screen name="Resubmit" component={ResubmitScreen} />
        <Stack.Screen
          name="LocationPicker"
          component={LocationPickerScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
      </Stack.Navigator>
    );
  }

  // Logged in, still resolving the profile → transient splash (no navigator).
  if (me.isLoading || (!me.data && !me.isError)) {
    return <Splash />;
  }

  // Failed to load /retailer/me (non-401) with no cached data → retry, don't
  // misroute an active retailer into the pending gate.
  if (me.isError && !me.data) {
    return (
      <ProfileError
        message={(me.error as any)?.message}
        onRetry={() => me.refetch()}
        onLogout={() => useAuth.getState().logout()}
      />
    );
  }

  const retailer = me.data?.retailer;
  const store = me.data?.store;
  const active =
    retailer?.status === 'active' &&
    !!store &&
    (store.status === 'onboarding' || store.status === 'active');

  // Legal gate — an onboarding store must accept the Retailer Terms AND the Privacy
  // Policy before it can go live. Block the full app on one doc at a time (terms
  // first) until both are accepted.
  if (active && me.data?.termsAcceptanceRequired) {
    return (
      <Stack.Navigator screenOptions={options}>
        <Stack.Screen name="Terms" component={TermsScreen} />
      </Stack.Navigator>
    );
  }
  if (active && me.data?.privacyAcceptanceRequired) {
    return (
      <Stack.Navigator screenOptions={options}>
        <Stack.Screen name="Privacy" component={PrivacyScreen} />
      </Stack.Navigator>
    );
  }

  // Active retailer with a usable store → full app.
  if (active) {
    return (
      <Stack.Navigator screenOptions={options}>
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="SelectPhotos" component={SelectPhotosScreen} />
        <Stack.Screen
          name="Capture"
          component={CaptureScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="Configure" component={ConfigureScreen} />
        <Stack.Screen
          name="Generating"
          component={GeneratingScreen}
          options={{ animation: 'fade', gestureEnabled: false }}
        />
        <Stack.Screen name="ReviewResults" component={ReviewResultsScreen} />
        <Stack.Screen
          name="PublishSuccess"
          component={PublishSuccessScreen}
          options={{ animation: 'fade', gestureEnabled: false }}
        />
        <Stack.Screen name="Creations" component={CreationsScreen} />
        <Stack.Screen
          name="Scan"
          component={ScanScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
        <Stack.Screen name="VariantForm" component={VariantFormScreen} />
        {/* Wizard steps swap in place (no page-slide): only the top tab bar +
            title + content change, so it reads as one page, not a new screen. */}
        <Stack.Screen name="ProductWizardBasics" component={BasicsStep} options={{ animation: 'none' }} />
        <Stack.Screen name="ProductWizardVariants" component={VariantsStep} options={{ animation: 'none' }} />
        <Stack.Screen name="ProductWizardDetails" component={DetailsStep} options={{ animation: 'none' }} />
        <Stack.Screen name="ProductWizardReview" component={ReviewStep} options={{ animation: 'none' }} />
        <Stack.Screen name="Kyc" component={KycScreen} />
        <Stack.Screen name="ChangeRequest" component={ChangeRequestScreen} />
        <Stack.Screen name="LegalDoc" component={LegalDocViewerScreen} />
      </Stack.Navigator>
    );
  }

  // Not active yet (pending approval, or store paused/suspended/terminated).
  return (
    <Stack.Navigator screenOptions={options}>
      <Stack.Screen name="PendingApproval" component={PendingApprovalScreen} />
      <Stack.Screen name="Kyc" component={KycScreen} />
    </Stack.Navigator>
  );
}
