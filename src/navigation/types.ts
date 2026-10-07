import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Mode, ModelGender } from '../types/enums';
import { PublishResult, Submission } from '../types/api';
import { InventoryFlag, VariantMode } from '../types/catalog';
import { OrderTab } from '../types/orders';
import { UploadFile } from '../utils/image';

/** Tabs on the Store profile screen. */
export type StoreProfileTab = 'basics' | 'photos' | 'hours' | 'address' | 'legal' | 'documents';

/** A captured/picked local image passing through the flow. */
export interface LocalPhoto {
  uri: string;
  width?: number;
  height?: number;
}

export type RootStackParamList = {
  // Auth + onboarding (application-first)
  // Optional deep-link params: preselect login method + prefill the identifier so a
  // signup that hit an existing account drops the user straight into the right flow.
  Login: { method?: 'phone' | 'email'; prefillEmail?: string; prefillPhone?: string } | undefined;
  ApplicationForm: { verifiedPhone?: string } | undefined;
  ApplicationStatus: { applicationId: string; email: string };
  Resubmit: { applicationId: string; email: string };
  // OpenStreetMap store-location picker (writes address + pincode into the draft).
  LocationPicker: undefined;

  // Post-login gate
  PendingApproval: undefined;
  Terms: undefined;
  Privacy: undefined;

  // Retailer self-service
  Kyc: undefined;
  ChangeRequest: undefined;
  /** Read-only backend-fetched legal doc (Profile → Terms / Privacy). */
  LegalDoc: { kind: 'terms' | 'privacy' };

  // Bottom-tab container (Home · Orders · Catalog · Account share one
  // persistent bar). `screen` picks the tab to land on (e.g. the wizard exits
  // to Catalog).
  Main:
    | { screen?: 'Home' | 'Orders' | 'Catalog' | 'Profile'; params?: { tab?: OrderTab } }
    | undefined;
  Home: undefined;

  // ---- Store management ----
  // Online orders from the consumer app. `tab` preselects a status tab.
  Orders: { tab?: OrderTab } | undefined;
  OrderDetail: { id: string };
  Notifications: undefined;
  NotificationSettings: undefined;

  // Counter billing (POS). The cart lives in the register store.
  Register: undefined;
  RegisterPayment: undefined;
  RegisterDay: undefined;
  PosSales: undefined;
  // `changePaise` is set right after a sale completes (shows "Give change").
  PosSaleDetail: { id: string; justCompleted?: boolean; changePaise?: number };

  // Money
  Payouts: undefined;
  PayoutDetail: { id: string };

  // Stock across every variant (inline edit, bulk on/off, history).
  Inventory: { flag?: InventoryFlag } | undefined;

  // Store settings & operations
  StoreProfile: { tab?: StoreProfileTab } | undefined;
  StoreStatus: undefined;
  HolidayCalendar: undefined;
  PickupSlots: undefined;
  AccountStatus: undefined;

  // QR checkout scanner → pushes picks to an open web Register over SSE
  Scan: undefined;

  // Catalog flow: photo picker (front + optional back/close-ups) → configure
  // `bulk` opens the same capture screen in Bulk Mockup mode (config inline +
  // floating "Add next product" that queues a job). Absent = the normal flow.
  SelectPhotos: { bulk?: boolean } | undefined;
  // Bulk-mockup job queue (beta): queued / processing / ready / failed.
  BulkJobs: undefined;
  // Earnings & payouts: unsettled amount owed, per-order breakdown, next payout.
  Earnings: undefined;
  // sink 'custom' delivers the shot to a registered cameraSink handler (e.g.
  // variant photos) instead of the mockup capture draft.
  Capture: { slot: 'front' | 'back' | 'pattern' | 'logo' | 'tag'; sink?: 'custom' };
  Configure: undefined; // images read from the capture-draft store
  Generating: {
    apparel: UploadFile;
    apparelBack?: UploadFile;
    design?: UploadFile;
    pattern?: UploadFile;
    logo?: UploadFile;
    tag?: UploadFile;
    modelGender?: ModelGender;
    mode: Mode;
    prompt?: string;
    only?: string[];
  };
  ReviewResults: { submission: Submission };
  Publish: { submission: Submission };
  PublishSuccess: { result: PublishResult };

  // History of generated work
  Creations: undefined;

  // Catalog management
  Catalog: undefined;
  ProductDetail: { id: string };
  VariantForm: { listingId: string; variantId?: string; mode: VariantMode };

  // Unified product-creation/edit wizard (state lives in the productDraft store).
  ProductWizardBasics: undefined;
  ProductWizardVariants: undefined;
  ProductWizardDetails: undefined;
  ProductWizardReview: undefined;


  // ---- Added for the store-app completion work; each track replaces its stub screens ----
  Issues: { orderId?: string } | undefined; // T2
  IssueDetail: { id: string }; // T2
  Returns: undefined; // T2
  ReturnDetail: { id: string }; // T2
  PosReturn: { saleId: string }; // T3
  PosExchange: { saleId: string }; // T3
  PosLabels: undefined; // T3
  BillingStatements: undefined; // T4
  BillingStatementDetail: { id: string }; // T4
  Invoices: { kind?: 'invoice' | 'commission' | 'all' } | undefined; // T4
  InventoryImport: undefined; // T4
  DeadStock: undefined; // T4

  // Dev
  Profile: undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;
