/**
 * Retailer onboarding (application-first) + KYC + change-requests.
 * closetx backend, envelope { success, data } | { success:false, error }.
 */

// ---- Enums ----
export type ApplicationStatus = 'pending' | 'docs_requested' | 'approved' | 'rejected';
export type AccountStatus = 'pending_approval' | 'active' | 'terminated' | 'closed';
export type StoreStatus = 'onboarding' | 'active' | 'paused' | 'suspended' | 'terminated';
export type KycCycleStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'overdue';
export type KycDocStatus = 'missing' | 'pending_review' | 'verified' | 'rejected';
export type ChangeRequestField =
  | 'legal_name'
  | 'address'
  | 'bank_account'
  | 'gstin'
  | 'pos_billing_activation'
  | 'account_deletion'
  | 'account_reopen';
export type ChangeRequestStatus = 'pending' | 'under_review' | 'approved' | 'rejected';

export type DocKind =
  | 'gst_certificate'
  | 'pan'
  | 'address_proof'
  | 'bank_proof'
  | 'storefront_photo'
  | 'other';

export const APPLICATION_DOC_KINDS: { kind: DocKind; label: string }[] = [
  { kind: 'gst_certificate', label: 'GST certificate' },
  { kind: 'pan', label: 'PAN' },
  { kind: 'address_proof', label: 'Address proof' },
  { kind: 'bank_proof', label: 'Bank proof' },
  { kind: 'storefront_photo', label: 'Storefront photo' },
  { kind: 'other', label: 'Other' },
];

/** An uploaded document reference sent to the API. */
export interface UploadedDoc {
  kind: DocKind;
  url: string;
}

/** Result of POST /uploads (any file, ≤25MB). */
export interface UploadResult {
  url: string;
  publicId: string;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
}

// ---- Identity pre-check ----
export interface IdentityCheck {
  emailTaken: boolean;
  phoneTaken: boolean;
  accountExists: boolean;
  /** Field-granular: which identifier maps to an existing approved ACCOUNT. Lets
   *  the UI offer the exact login method(s) — email/pass and/or phone OTP. */
  accountEmailTaken: boolean;
  accountPhoneTaken: boolean;
  applicationStatus: ApplicationStatus | null;
  applicationId: string | null;
}

// ---- Application (signup) ----
export interface ApplicationInput {
  // required
  legalName: string;
  gstin: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  addressLine: string;
  pincode: string;
  stateCode: string;
  // recommended
  password?: string;
  storeName?: string;
  pan?: string;
  bankLegalName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  contactPhone?: string;
  managerName?: string;
  znfFinance?: boolean; // store opts into ZNF Finance
  categories?: string[];
  brands?: string[];
  documents?: UploadedDoc[];
  /** Signup-form consent to the T&C + Privacy Policy (backend pins current versions). */
  acceptLegal?: boolean;
}

export interface ApplicationCreated {
  id: string; // app_...
  status: ApplicationStatus;
  message?: string;
}

export interface ApplicationStatusInfo {
  id: string;
  status: ApplicationStatus;
  submittedAt?: string;
  decidedAt?: string | null;
  decisionReason?: string | null;
  mustReuploadDocKinds?: DocKind[];
}

// ---- Message thread (canonical serialized shape from the backend) ----
export interface ThreadMessage {
  id: string;
  authorKind: 'admin' | 'applicant' | string;
  authorLabel?: string;
  body: string;
  attachments?: string[];
  fieldKey?: string | null;
  createdAt?: string;
}

// ---- Resubmit ----
// The backend returns the full application row (mustReuploadDocKinds lives INSIDE it)
// plus a separate documents array - not a flattened prefill.
export interface ResubmitPrefill {
  application: Partial<ApplicationInput> & { mustReuploadDocKinds?: DocKind[] };
  documents?: { kind: DocKind; url: string }[];
}

// ---- Post-login: /retailer/me ----
export interface Store {
  id: string;
  name?: string;
  status: StoreStatus;
  /** Retailer self-serve online/offline toggle. Future ISO timestamp while
   *  offline (store auto-reopens then); null/absent = online, accepting orders. */
  orderPauseUntil?: string | null;
}

export interface RetailerProfile {
  id: string;
  email: string;
  legalName: string;
  phone: string;
  gstin: string;
  status: AccountStatus;
  storeId?: string;
  subRole?: string;
  // Optional richer details - surfaced in Profile's "View more" when the
  // backend returns them (the same fields admin/onboarding capture).
  pan?: string;
  contactPhone?: string;
  addressLine?: string;
  pincode?: string;
  stateCode?: string;
  storeName?: string;
}

export interface RetailerMe {
  retailer: RetailerProfile;
  store: Store | null;
  termsAcceptanceRequired?: boolean;
  currentTermsVersion?: string;
  privacyAcceptanceRequired?: boolean;
  currentPrivacyVersion?: string;
  /** In-flight account-lifecycle request (closure or reopen) awaiting admin review. */
  pendingAccountRequest?: 'account_deletion' | 'account_reopen' | null;
}

export interface TermsInfo {
  version: string;
  shortText: string;
  acceptedAt: string | null;
}

// ---- KYC ----
export interface KycDocument {
  id: string;
  kind: string;
  label: string;
  status: KycDocStatus;
  uploadedAt?: string | null;
  fileUrl?: string | null;
  /** Why THIS document was rejected. Re-upload just this one to clear it. */
  reviewerNote?: string | null;
  reviewedAt?: string | null;
}

export interface KycCycle {
  id: string;
  status: KycCycleStatus;
  dueAt?: string | null;
  gracePeriodEndsAt?: string | null;
  lastVerifiedAt?: string | null;
  submittedAt?: string | null;
  decidedAt?: string | null;
  /** The reviewer's covering note when the cycle was sent back. */
  decisionReason?: string | null;
  documents: KycDocument[];
}

// ---- Change requests ----
export interface ChangeRequestInput {
  field: ChangeRequestField;
  currentValue?: string; // no longer collected in-app; admin sees the current value
  requestedValue: string;
  reason: string;
  evidenceUrl?: string;
}

export interface ChangeRequest {
  id: string;
  field: ChangeRequestField;
  currentValue?: string;
  requestedValue?: string;
  reason?: string;
  status: ChangeRequestStatus;
  createdAt?: string;
}
