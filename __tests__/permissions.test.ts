/**
 * Permission resolution: the server map is authoritative, role defaults (mirroring
 * backend/src/shared/permissions.ts) cover first paint and unknown keys.
 */
import { defaultForRole, resolvePermission } from '../src/utils/usePermission';

describe('defaultForRole', () => {
  test('owner (or no sub-role on an older login) can do everything', () => {
    for (const r of ['owner', undefined]) {
      expect(defaultForRole(r, 'store.pause')).toBe(true);
      expect(defaultForRole(r, 'pos.refund')).toBe(true);
      expect(defaultForRole(r, 'some.future.key')).toBe(true);
    }
  });

  test('manager can do everything except the owner-reserved keys', () => {
    expect(defaultForRole('manager', 'listings.edit')).toBe(true);
    expect(defaultForRole('manager', 'pos.refund')).toBe(true);
    for (const k of ['staff.deactivate', 'staff.reactivate', 'staff.change_role', 'staff.reset_password', 'store.pause', 'store.resume']) {
      expect(defaultForRole('manager', k)).toBe(false);
    }
  });

  test('staff (floor) only get the day-to-day keys', () => {
    for (const k of ['orders.view', 'orders.accept', 'inventory.adjust', 'pos.sell', 'pos.view', 'returns.accept', 'disputes.view']) {
      expect(defaultForRole('staff', k)).toBe(true);
    }
    for (const k of ['listings.edit', 'store.edit_profile', 'payouts.view', 'invoicing.view', 'pos.refund', 'pos.manage', 'disputes.respond', 'issues.create', 'orders.cancel_request', 'store.holidays_edit']) {
      expect(defaultForRole('staff', k)).toBe(false);
    }
  });

  test('delivery agents and unknown roles get nothing', () => {
    expect(defaultForRole('delivery_agent', 'orders.view')).toBe(false);
    expect(defaultForRole('mystery', 'orders.view')).toBe(false);
  });
});

describe('resolvePermission', () => {
  test('the server map wins over the role default, both ways', () => {
    expect(resolvePermission({ 'listings.edit': true }, 'staff', 'listings.edit')).toBe(true);
    expect(resolvePermission({ 'orders.view': false }, 'owner', 'orders.view')).toBe(false);
  });

  test('a key missing from the map, or no map yet, falls back to the role default', () => {
    expect(resolvePermission({ 'orders.view': true }, 'staff', 'pos.refund')).toBe(false);
    expect(resolvePermission(undefined, 'manager', 'store.pause')).toBe(false);
    expect(resolvePermission(undefined, undefined, 'store.pause')).toBe(true);
  });

  test('a non-boolean map value is ignored', () => {
    expect(resolvePermission({ 'orders.view': undefined as unknown as boolean }, 'staff', 'orders.view')).toBe(true);
  });
});
