/** Retailer auth (closetx backend). Envelope: { success, data } | { success:false, error }. */

export type RetailerStatus = 'pending_approval' | 'active' | 'terminated';
export type RetailerSubRole = 'owner' | 'manager' | 'staff' | 'delivery_agent';

export interface Retailer {
  id: string; // ret_...
  email: string;
  legalName: string;
  phone: string;
  gstin: string;
  status: RetailerStatus;
  kycVerified?: boolean;
  storeId?: string; // str_... (once active)
  subRole?: RetailerSubRole;
}

export interface AuthResult {
  token: string;
  retailer: Retailer;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SignupInput {
  email: string;
  password: string;
  legalName: string;
  phone: string;
  gstin: string;
}

/** Normalized auth error surfaced to the UI. */
export interface AuthError {
  code: string; // e.g. invalid_credentials, application_pending, validation_error
  message: string;
  status?: number;
  applicationId?: string;
}
