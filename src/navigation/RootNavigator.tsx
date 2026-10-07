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
import { LegalDocViewerScreen, TermsScreen } from '../screens/TermsScreen';
import { MainTabs } from './MainTabs';
import { SelectPhotosScreen } from '../screens/SelectPhotosScreen';
import { BulkJobsScreen } from '../screens/BulkJobsScreen';
import { EarningsScreen } from '../screens/EarningsScreen';
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
import { OrderDetailScreen } from '../screens/OrderDetailScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { NotificationSettingsScreen } from '../screens/NotificationSettingsScreen';
import { PayoutsScreen } from '../screens/PayoutsScreen';
import { PayoutDetailScreen } from '../screens/PayoutDetailScreen';
import { InventoryScreen } from '../screens/InventoryScreen';
import { StoreProfileScreen } from '../screens/StoreProfileScreen';
import { StoreStatusScreen } from '../screens/StoreStatusScreen';
import { HolidayCalendarScreen } from '../screens/HolidayCalendarScreen';
import { PickupSlotsScreen } from '../screens/PickupSlotsScreen';
import { AccountStatusScreen } from '../screens/AccountStatusScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { RegisterPaymentScreen } from '../screens/RegisterPaymentScreen';
import { RegisterDayScreen } from '../screens/RegisterDayScreen';
import { PosSalesScreen } from '../screens/PosSalesScreen';
import { PosSaleDetailScreen } from '../screens/PosSaleDetailScreen';
import { IssuesScreen } from '../screens/IssuesScreen';
import { IssueDetailScreen } from '../screens/IssueDetailScreen';
import { ReturnsScreen } from '../screens/ReturnsScreen';
import { ReturnDetailScreen } from '../screens/ReturnDetailScreen';
import { PosReturnScreen } from '../screens/PosReturnScreen';
import { PosExchangeScreen } from '../screens/PosExchangeScreen';
import { PosLabelsScreen } from '../screens/PosLabelsScreen';
import { BillingStatementsScreen } from '../screens/BillingStatementsScreen';
import { BillingStatementDetailScreen } from '../screens/BillingStatementDetailScreen';
import { InvoicesScreen } from '../screens/InvoicesScreen';
import { InventoryImportScreen } from '../screens/InventoryImportScreen';
import { DeadStockScreen } from '../screens/DeadStockScreen';
import { ChangeRequestScreen } from '../screens/ChangeRequestScreen';
import { useAuth } from '../store/auth';
import { useSettings } from '../store/settings';
import { useOnboarding } from '../store/onboarding';
import { useGenerationRecovery } from '../store/generationRecovery';
import { useRetailerMe } from '../api/onboardingHooks';
import { storeGate } from './storeGate';
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
  const generationHydrated = useGenerationRecovery((s) => s.hydrated);
  const activeGeneration = useGenerationRecovery((s) => s.active);
  const hydrated = authHydrated && settingsHydrated && onbHydrated && generationHydrated;

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
        {/* Signup consent links open the docs in-app (public content endpoint, no auth). */}
        <Stack.Screen name="LegalDoc" component={LegalDocViewerScreen} />
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

  // What the app may do (see ./storeGate for the per-state table): pending approval,
  // legal gate, the full app, or the full app behind a "restricted" banner (store
  // paused / suspended / terminated, account closed / terminated).
  const gate = storeGate(me.data);

  // Legal gate — a store must accept the Retailer Terms AND the Privacy Policy before it
  // trades. One unified gate handles BOTH docs (with a switcher when both are due), so the
  // retailer isn't bounced between two separate prompts.
  if (gate.mode === 'legal') {
    return (
      <Stack.Navigator screenOptions={options}>
        <Stack.Screen name="Terms" component={TermsScreen} />
      </Stack.Navigator>
    );
  }

  // Active retailer with a usable store → full app. A restricted store (paused,
  // suspended, terminated, closed account) stays in the same stack, landing on Main,
  // so it can resume, appeal, reopen, finish orders and bill; the banner and the
  // screens' own checks (see gate.abilities) say what is off.
  if (gate.mode === 'full' || gate.mode === 'restricted') {
    return (
      <Stack.Navigator
        screenOptions={options}
        initialRouteName={gate.mode === 'full' && activeGeneration ? 'Generating' : 'Main'}
      >
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="SelectPhotos" component={SelectPhotosScreen} />
        <Stack.Screen name="BulkJobs" component={BulkJobsScreen} />
        <Stack.Screen name="Earnings" component={EarningsScreen} />
        <Stack.Screen
          name="Capture"
          component={CaptureScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="Configure" component={ConfigureScreen} />
        <Stack.Screen
          name="Generating"
          component={GeneratingScreen}
          initialParams={activeGeneration?.input}
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

        {/* Store management */}
        <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
        <Stack.Screen name="Payouts" component={PayoutsScreen} />
        <Stack.Screen name="PayoutDetail" component={PayoutDetailScreen} />
        <Stack.Screen name="Inventory" component={InventoryScreen} />
        <Stack.Screen name="StoreProfile" component={StoreProfileScreen} />
        <Stack.Screen name="StoreStatus" component={StoreStatusScreen} />
        <Stack.Screen name="HolidayCalendar" component={HolidayCalendarScreen} />
        <Stack.Screen name="PickupSlots" component={PickupSlotsScreen} />
        <Stack.Screen name="AccountStatus" component={AccountStatusScreen} />

        {/* Counter billing (POS) */}
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="RegisterPayment" component={RegisterPaymentScreen} />
        <Stack.Screen name="RegisterDay" component={RegisterDayScreen} />
        <Stack.Screen name="PosSales" component={PosSalesScreen} />
        <Stack.Screen name="PosSaleDetail" component={PosSaleDetailScreen} />

        {/* Added for the store-app completion work (stubs replaced per track) */}
        <Stack.Screen name="Issues" component={IssuesScreen} />
        <Stack.Screen name="IssueDetail" component={IssueDetailScreen} />
        <Stack.Screen name="Returns" component={ReturnsScreen} />
        <Stack.Screen name="ReturnDetail" component={ReturnDetailScreen} />
        <Stack.Screen name="PosReturn" component={PosReturnScreen} />
        <Stack.Screen name="PosExchange" component={PosExchangeScreen} />
        <Stack.Screen name="PosLabels" component={PosLabelsScreen} />
        <Stack.Screen name="BillingStatements" component={BillingStatementsScreen} />
        <Stack.Screen name="BillingStatementDetail" component={BillingStatementDetailScreen} />
        <Stack.Screen name="Invoices" component={InvoicesScreen} />
        <Stack.Screen name="InventoryImport" component={InventoryImportScreen} />
        <Stack.Screen name="DeadStock" component={DeadStockScreen} />
      </Stack.Navigator>
    );
  }

  // Not approved yet (pending approval, or no store provisioned).
  return (
    <Stack.Navigator screenOptions={options}>
      <Stack.Screen name="PendingApproval" component={PendingApprovalScreen} />
      <Stack.Screen name="Kyc" component={KycScreen} />
    </Stack.Navigator>
  );
}
