import { postMultipart, unwrapEnvelope } from './client';
import { normalizeAuthError } from './auth';
import { createChangeRequest } from './onboarding';
import { http, req } from './request';
import { toFormFile, UploadFile } from '../utils/image';
import {
  ChangeRequestCurrentValues,
  HolidayClosure,
  PauseInput,
  PickupSlot,
  PickupSlotInput,
  StoreBank,
  StoreDocument,
  StoreHours,
  StoreProfilePatch,
} from '../types/store';

/**
 * Store settings & operations. The store object itself is read from
 * GET /retailer/me (`.store`) — there is no GET /retailer/store — so every
 * write here is followed by a /retailer/me refetch (see the hooks).
 */

/** Upload any file to a named folder (store-gallery, kyc, door-visits…) → hosted URL. */
export async function uploadToFolder(file: UploadFile, folder: string): Promise<string> {
  const form = new FormData();
  form.append('file', toFormFile(file) as unknown as Blob);
  try {
    const res = await postMultipart<{ data: { url: string } }>(
      `/uploads?folder=${encodeURIComponent(folder)}`,
      form,
    );
    return unwrapEnvelope<{ url: string }>(res).url;
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

/** Contact phone, manager, storefront photos, GST scheme. */
export const updateStoreProfile = (patch: StoreProfilePatch) =>
  req<unknown>(() => http.patch('/retailer/store/profile', patch));

export const getStoreHours = () =>
  req<StoreHours | null>(() => http.get('/retailer/store/hours'));

export const putStoreHours = (hours: StoreHours) =>
  req<unknown>(() => http.put('/retailer/store/hours', hours));

export const getStoreBank = () => req<StoreBank | null>(() => http.get('/retailer/store/bank'));

export const getStoreDocuments = async () => {
  const data = await req<unknown>(() => http.get('/retailer/store/documents'));
  return (Array.isArray(data) ? data : []) as StoreDocument[];
};

/** Attach an uploaded file to a document row (path is the row id, not a kind). */
export const submitStoreDocument = (documentId: string, url: string) =>
  req<unknown>(() =>
    http.post(`/retailer/store/documents/${encodeURIComponent(documentId)}/upload`, { url }),
  );

/** Pause the storefront (status → paused). Distinct from the quick online/offline toggle. */
export const pauseStore = ({ reason, visibility }: PauseInput) =>
  req<unknown>(() =>
    http.post('/retailer/store/pause', {
      visibility,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
    }),
  );

export const resumeStore = () => req<unknown>(() => http.post('/retailer/store/resume', {}));

export const listHolidays = async () => {
  const data = await req<unknown>(() => http.get('/retailer/store/holiday-closures'));
  return (Array.isArray(data) ? data : []) as HolidayClosure[];
};

export const addHoliday = (date: string, reason?: string) =>
  req<unknown>(() =>
    http.post('/retailer/store/holiday-closures', {
      date,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
    }),
  );

/** Removal is keyed by the date itself ("YYYY-MM-DD"). */
export const removeHoliday = (date: string) =>
  req<unknown>(() =>
    http.delete(`/retailer/store/holiday-closures/${encodeURIComponent(date)}`),
  );

export const listPickupSlots = async () => {
  const data = await req<unknown>(() => http.get('/retailer/store/pickup-slots'));
  return (Array.isArray(data) ? data : []) as PickupSlot[];
};

export const addPickupSlot = (input: PickupSlotInput) =>
  req<PickupSlot>(() => http.post('/retailer/store/pickup-slots', input));

export const deletePickupSlot = (id: string) =>
  req<unknown>(() => http.delete(`/retailer/store/pickup-slots/${encodeURIComponent(id)}`));

export const getChangeRequestCurrentValues = () =>
  req<ChangeRequestCurrentValues>(() => http.get('/retailer/change-requests/current-values'));

/** Ask Trendzo to switch on counter billing (admin approves). */
export const requestPosActivation = () =>
  createChangeRequest({
    field: 'pos_billing_activation',
    currentValue: 'disabled',
    requestedValue: 'enabled',
    reason: 'Requesting activation of POS / counter billing for this store.',
  });
