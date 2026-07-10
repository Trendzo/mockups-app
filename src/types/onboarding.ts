/**
 * Retailer onboarding (application-first) + KYC + change-requests.
 * closetx backend, envelope { success, data } | { success:false, error }.
 */

// ---- Enums ----
export type ApplicationStatus = 'pending' | 'docs_requested' | 'approved' | 'rejected';
export type AccountStatus = 'pending_approval' | 'active' | 'terminated';
export type StoreStatus = 'onboarding' | 'active' | 'paused' | 'suspended' | 'terminated';
export type KycCycleStatus = 'pending' | 'submitted' | 'approved' | 'rejected' | 'overdue';
export type KycDocStatus = 'missing' | 'pending_review' | 'verified' | 'rejected';
export type ChangeRequestField =
  | 'legal_name'
  | 'address'
  | 'bank_account'
  | 'gstin'
  | 'pos_billing_activation';
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

// ---- Message thread ----
export interface ThreadMessage {
  id: string;
  from: 'admin' | 'applicant' | string;
  body: string;
  attachmentUrls?: string[];
  createdAt?: string;
}

// ---- Resubmit ----
export interface ResubmitPrefill {
  application: Partial<ApplicationInput>;
  mustReuploadDocKinds: DocKind[];
}

// ---- Post-login: /retailer/me ----
export interface Store {
  id: string;
  name?: string;
  status: StoreStatus;
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
}

export interface RetailerMe {
  retailer: RetailerProfile;
  store: Store | null;
  termsAcceptanceRequired?: boolean;
  currentTermsVersion?: string;
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
}

export interface KycCycle {
  id: string;
  status: KycCycleStatus;
  dueAt?: string | null;
  gracePeriodEndsAt?: string | null;
  lastVerifiedAt?: string | null;
  documents: KycDocument[];
}

// ---- Change requests ----
export interface ChangeRequestInput {
  field: ChangeRequestField;
  currentValue: string;
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
