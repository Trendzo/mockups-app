import {
  getJson,
  postJson,
  postMultipart,
  unwrapEnvelope,
} from './client';
import { normalizeAuthError } from './auth';
import { toFormFile, UploadFile } from '../utils/image';
import {
  ApplicationCreated,
  ApplicationInput,
  ApplicationStatusInfo,
  ChangeRequest,
  ChangeRequestInput,
  DocKind,
  IdentityCheck,
  KycCycle,
  RetailerMe,
  ResubmitPrefill,
  TermsInfo,
  ThreadMessage,
  UploadResult,
} from '../types/onboarding';

// ---- Appeal thread (suspended/terminated account) ----
export interface AppealMessage {
  id: string;
  storeId: string;
  authorKind: 'admin' | 'retailer' | 'system' | string;
  body: string;
  attachments: string[];
  createdAt: string;
}
export interface AppealThread {
  storeStatus: string;
  canAppeal: boolean;
  messages: AppealMessage[];
}

// ---- A) Document upload (public; any file up to 25MB) ----
export async function uploadDocument(file: UploadFile): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', toFormFile(file) as unknown as Blob);
  try {
    const res = await postMultipart<{ data: UploadResult }>(
      '/uploads?folder=onboarding',
      form,
    );
    return unwrapEnvelope<UploadResult>(res);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

// ---- B) Application (signup) ----
export async function checkIdentity(
  email: string,
  phone: string,
): Promise<IdentityCheck> {
  try {
    const res = await getJson<{ data: IdentityCheck }>(
      '/applications/check-identity',
      { params: { email: email.trim().toLowerCase(), phone: phone.trim() } },
    );
    return unwrapEnvelope<IdentityCheck>(res);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

export async function submitApplication(
  input: ApplicationInput,
): Promise<ApplicationCreated> {
  try {
    const res = await postJson<{ data: ApplicationCreated }>(
      '/applications',
      cleanApplication(input),
    );
    return unwrapEnvelope<ApplicationCreated>(res);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

export async function getApplicationStatus(
  id: string,
  email: string,
): Promise<ApplicationStatusInfo> {
  try {
    const res = await getJson<{ data: ApplicationStatusInfo }>(
      `/applications/${id}/status`,
      { params: { email: email.trim().toLowerCase() } },
    );
    return unwrapEnvelope<ApplicationStatusInfo>(res);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

// ---- Message thread ----
export async function getMessages(
  id: string,
  email: string,
): Promise<ThreadMessage[]> {
  try {
    const res = await getJson<{
      data: ThreadMessage[] | { thread: ThreadMessage[] };
    }>(`/applications/${id}/messages`, {
      params: { email: email.trim().toLowerCase() },
    });
    const data = unwrapEnvelope<any>(res);
    return Array.isArray(data) ? data : data?.thread ?? data?.messages ?? [];
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

export async function postMessage(
  id: string,
  input: { applicantEmail: string; body: string; attachmentUrls?: string[] },
): Promise<void> {
  try {
    await postJson(`/applications/${id}/messages`, {
      applicantEmail: input.applicantEmail.trim().toLowerCase(),
      body: input.body,
      ...(input.attachmentUrls?.length
        ? { attachmentUrls: input.attachmentUrls }
        : {}),
    });
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

/** Submit the specific documents an admin requested during docs_requested. */
export async function submitClarificationDocuments(
  id: string,
  input: { applicantEmail: string; documents: { kind: DocKind; url: string }[]; note?: string },
): Promise<{ status: string; remainingDocKinds: DocKind[] }> {
  try {
    const res = await postJson<{ data: { status: string; remainingDocKinds: DocKind[] } }>(
      `/applications/${id}/documents`,
      {
        applicantEmail: input.applicantEmail.trim().toLowerCase(),
        documents: input.documents,
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      },
    );
    return unwrapEnvelope(res);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

// ---- Suspend/terminate appeal thread (authed retailer) ----
export async function getAccountAppeal(): Promise<AppealThread> {
  try {
    const res = await getJson<{ data: AppealThread }>('/retailer/account/appeal');
    return unwrapEnvelope<AppealThread>(res);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

export async function postAccountAppeal(input: {
  body: string;
  attachmentUrls?: string[];
}): Promise<void> {
  try {
    await postJson('/retailer/account/appeal', {
      body: input.body,
      ...(input.attachmentUrls?.length ? { attachmentUrls: input.attachmentUrls } : {}),
    });
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

// ---- Resubmit ----
export async function fetchForResubmit(
  id: string,
  creds: { email: string; password: string },
): Promise<ResubmitPrefill> {
  try {
    const res = await postJson<{ data: ResubmitPrefill }>(
      `/applications/${id}/fetch-for-resubmit`,
      { email: creds.email.trim().toLowerCase(), password: creds.password },
    );
    return unwrapEnvelope<ResubmitPrefill>(res);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

export async function resubmitApplication(
  id: string,
  input: ApplicationInput,
  creds: { email: string; password: string },
): Promise<ApplicationStatusInfo> {
  try {
    const res = await postJson<{ data: ApplicationStatusInfo }>(
      `/applications/${id}/resubmit`,
      {
        ...cleanApplication(input),
        email: creds.email.trim().toLowerCase(),
        password: creds.password,
      },
    );
    return unwrapEnvelope<ApplicationStatusInfo>(res);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

// ---- C) Post-login profile ----
export async function getRetailerMe(): Promise<RetailerMe> {
  try {
    const res = await getJson<{ data: RetailerMe }>('/retailer/me');
    return unwrapEnvelope<RetailerMe>(res);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

/**
 * Request business-account closure (owner/manager). Files an admin-reviewed request -
 * nothing is deleted or suspended until an admin approves. On approval the store is
 * suspended and accounts marked `closed` (reversibly). Replaces the old destructive delete.
 */
export async function requestAccountClosure(reason?: string): Promise<void> {
  try {
    await postJson('/retailer/account/close-request', reason ? { reason } : {});
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

/** Request to reopen a CLOSED account (owner/manager). Admin approval restores it to active. */
export async function requestAccountReopen(reason?: string): Promise<void> {
  try {
    await postJson('/retailer/account/reopen-request', reason ? { reason } : {});
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

// ---- C2) Terms & Conditions (legal gate before go-live) ----
export async function getTerms(): Promise<TermsInfo> {
  const res = await getJson<{ data: TermsInfo }>('/retailer/terms');
  return unwrapEnvelope<TermsInfo>(res);
}

export async function acceptTerms(version: string): Promise<void> {
  await postJson('/retailer/terms/accept', { version });
}

/** Record a decline (audited); the app then logs the user out. */
export async function declineTerms(version: string): Promise<void> {
  await postJson('/retailer/terms/decline', { version });
}

// ---- C3) Privacy Policy (same legal gate as the T&C — kind='privacy' server-side) ----
export async function getPrivacy(): Promise<TermsInfo> {
  const res = await getJson<{ data: TermsInfo }>('/retailer/privacy');
  return unwrapEnvelope<TermsInfo>(res);
}

export async function acceptPrivacy(version: string): Promise<void> {
  await postJson('/retailer/privacy/accept', { version });
}

/** Record a decline (audited); the app then logs the user out. */
export async function declinePrivacy(version: string): Promise<void> {
  await postJson('/retailer/privacy/decline', { version });
}

// ---- D) KYC ----
export async function getKyc(): Promise<KycCycle | null> {
  try {
    const res = await getJson<{ data: KycCycle | null }>('/retailer/kyc');
    return unwrapEnvelope<KycCycle | null>(res);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

export async function uploadKycDoc(
  cycleId: string,
  doc: { kind: string; url: string },
): Promise<void> {
  try {
    await postJson(`/retailer/kyc/${cycleId}/documents`, doc);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

export async function submitKyc(cycleId: string): Promise<void> {
  try {
    await postJson(`/retailer/kyc/${cycleId}/submit`, {});
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

// ---- E) Change requests ----
export async function createChangeRequest(
  input: ChangeRequestInput,
): Promise<ChangeRequest> {
  try {
    const res = await postJson<{ data: ChangeRequest }>(
      '/retailer/change-requests',
      input,
    );
    return unwrapEnvelope<ChangeRequest>(res);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

export async function listChangeRequests(): Promise<ChangeRequest[]> {
  try {
    const res = await getJson<{ data: ChangeRequest[] }>(
      '/retailer/change-requests',
    );
    return unwrapEnvelope<ChangeRequest[]>(res);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

/** Drop empty optional fields so the server doesn't reject blanks. */
function cleanApplication(input: ApplicationInput): Record<string, unknown> {
  const out: Record<string, unknown> = {
    legalName: input.legalName.trim(),
    gstin: input.gstin.trim().toUpperCase(),
    ownerName: input.ownerName.trim(),
    ownerEmail: input.ownerEmail.trim().toLowerCase(),
    ownerPhone: input.ownerPhone.trim(),
    addressLine: input.addressLine.trim(),
    pincode: input.pincode.trim(),
    stateCode: input.stateCode.trim(),
  };
  const opt: (keyof ApplicationInput)[] = [
    'password',
    'storeName',
    'pan',
    'bankLegalName',
    'bankAccountNumber',
    'bankIfsc',
    'contactPhone',
    'managerName',
  ];
  for (const k of opt) {
    const v = input[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  if (typeof input.znfFinance === 'boolean') out.znfFinance = input.znfFinance;
  if (input.categories?.length) out.categories = input.categories;
  if (input.brands?.length) out.brands = input.brands;
  if (input.documents?.length) out.documents = input.documents;
  return out;
}
