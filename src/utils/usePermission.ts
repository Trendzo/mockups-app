import { useAuth } from '../store/auth';
import { useMyPermissions } from '../api/permissions';

/**
 * Permission keys the app checks (a subset of backend/src/shared/permissions.ts). Any other
 * string is accepted by `resolvePermission` so a new key never needs a type change first.
 */
export type PermissionKey =
  | 'store.view_profile'
  | 'store.edit_profile'
  | 'store.pause'
  | 'store.resume'
  | 'store.holidays_edit'
  | 'listings.view'
  | 'listings.edit'
  | 'listings.publish'
  | 'inventory.view'
  | 'inventory.adjust'
  | 'inventory.import'
  | 'inventory.export'
  | 'orders.view'
  | 'orders.accept'
  | 'orders.pack'
  | 'orders.handover'
  | 'orders.mark_delivered'
  | 'orders.cancel_request'
  | 'returns.view'
  | 'returns.accept'
  | 'disputes.view'
  | 'disputes.respond'
  | 'issues.create'
  | 'payouts.view'
  | 'invoicing.view'
  | 'early_disbursement.request'
  | 'change_requests.view'
  | 'change_requests.submit'
  | 'pos.sell'
  | 'pos.view'
  | 'pos.refund'
  | 'pos.manage'
  | 'pos.settings'
  | 'pos.labels'
  | 'reports.view'
  | 'notifications.read';

// Mirrors backend RETAILER_OWNER_RESERVED / RETAILER_STAFF_ALLOWED (shared/permissions.ts).
// Used only until the server map loads (or if it cannot be fetched); the map wins after.
const MANAGER_DENIED = new Set([
  'staff.deactivate',
  'staff.reactivate',
  'staff.change_role',
  'staff.reset_password',
  'store.pause',
  'store.resume',
]);
const STAFF_ALLOWED = new Set([
  'store.view_profile',
  'listings.view',
  'attribute_templates.view',
  'inventory.view',
  'inventory.adjust',
  'orders.view',
  'orders.accept',
  'orders.pack',
  'orders.handover',
  'orders.mark_delivered',
  'returns.view',
  'returns.accept',
  'returns.reject',
  'held_items.view',
  'disputes.view',
  'promotions.view',
  'vouchers.view',
  'notifications.read',
  'application.messages.view',
  'pos.sell',
  'pos.view',
  'pos.labels',
]);

/** The default answer for a role, before/without the server's permission map. */
export function defaultForRole(subRole: string | undefined, key: string): boolean {
  // A missing sub-role is the account owner (older logins did not carry one).
  if (!subRole || subRole === 'owner') return true;
  if (subRole === 'manager') return !MANAGER_DENIED.has(key);
  if (subRole === 'staff') return STAFF_ALLOWED.has(key);
  return false; // delivery_agent and anything unknown: nothing in the store app
}

/**
 * Whether `key` is allowed. The server map is authoritative when it has the key; otherwise
 * (not loaded yet, or a key the map does not list) fall back to the role default.
 */
export function resolvePermission(
  map: Record<string, boolean> | undefined,
  subRole: string | undefined,
  key: PermissionKey | (string & {}),
): boolean {
  const v = map?.[key];
  return typeof v === 'boolean' ? v : defaultForRole(subRole, key);
}

/** `const can = usePermission(); can('orders.accept')`, or `usePermission('orders.accept')`. */
export function usePermissions(): {
  can: (key: PermissionKey | (string & {})) => boolean;
  subRole: string | undefined;
  loading: boolean;
} {
  const authSubRole = useAuth((s) => s.retailer?.subRole);
  const q = useMyPermissions();
  const subRole = q.data?.subRole ?? authSubRole;
  return {
    subRole,
    loading: q.isLoading,
    can: (key) => resolvePermission(q.data?.permissions, subRole, key),
  };
}

/** Single-key convenience for components that need exactly one answer. */
export function usePermission(key: PermissionKey | (string & {})): boolean {
  return usePermissions().can(key);
}
