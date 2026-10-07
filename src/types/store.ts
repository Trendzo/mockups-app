/** Store settings & operations (same endpoints as the web portal's Store pages). */
import type { GstScheme, PauseVisibility } from './onboarding';

export type Weekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

/**
 * Store settings are owner/manager-only (staff and delivery agents read). No
 * sub-role on the session = the primary account — never lock the owner out.
 */
export function canManageStore(subRole?: string | null): boolean {
  return !subRole || subRole === 'owner' || subRole === 'manager';
}

export const WEEK: { key: Weekday; label: string }[] = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

/** One opening range per day, "HH:MM" 24h. */
export interface DayHours {
  from: string;
  to: string;
  closed: boolean;
}

/** GET/PUT /retailer/store/hours. A missing day reads as 09:00–18:00 open. */
export type StoreHours = Partial<Record<Weekday, DayHours>>;

export const DEFAULT_DAY_HOURS: DayHours = { from: '09:00', to: '18:00', closed: false };

/** PATCH /retailer/store/profile — only these fields are self-serve. */
export interface StoreProfilePatch {
  contactPhone?: string | null;
  managerName?: string | null;
  galleryImageUrls?: string[];
  gstScheme?: GstScheme;
}

/** Up to 5 storefront photos shown to customers. */
export const MAX_STORE_PHOTOS = 5;

/** GET /retailer/store/bank — null when no account is on file. */
export interface StoreBank {
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  bankName?: string | null;
  pennyDropStatus?: string | null;
  pennyDropAt?: string | null;
}

/** GET /retailer/store/documents */
export interface StoreDocument {
  id: string;
  label: string;
  status: 'missing' | 'pending_review' | 'verified' | 'rejected' | string;
  uploadedAt?: string | null;
  fileUrl?: string | null;
}

export interface PauseInput {
  reason?: string;
  visibility: PauseVisibility;
}

/** GET /retailer/store/holiday-closures — one closed day per row. */
export interface HolidayClosure {
  id?: string;
  /** "YYYY-MM-DD" */
  date: string;
  reason: string | null;
}

/** GET /retailer/store/pickup-slots — a recurring weekly window. */
export interface PickupSlot {
  id: string;
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  /** Pickups the store can hand over in this window. */
  capacity: number;
  isActive: boolean;
}

export interface PickupSlotInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  capacity: number;
}

/** GET /retailer/change-requests/current-values — what admin sees as "current". */
export interface ChangeRequestCurrentValues {
  legalName: string;
  address: string;
  gstin: string;
  bank: { legalName: string; accountNumber: string; ifsc: string } | null;
}
