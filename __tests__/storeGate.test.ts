import { gateState, storeGate, type GateMe, type GateState } from '../src/navigation/storeGate';
import { resolvePermission } from '../src/utils/usePermission';

type Account = 'pending_approval' | 'active' | 'terminated' | 'closed';
type StoreStatus = 'onboarding' | 'active' | 'paused' | 'suspended' | 'terminated';

function me(
  account: Account | undefined,
  store: StoreStatus | null,
  extra: Partial<GateMe> & { pauseReason?: string | null } = {},
): GateMe {
  const { pauseReason, ...rest } = extra;
  return {
    retailer: account ? { status: account } : null,
    store: store ? { status: store, pauseReason: pauseReason ?? null } : null,
    ...rest,
  };
}

/** `can` for a login with the given sub-role, using the app's role defaults (no server map). */
const canAs = (role: string | undefined) => (key: string) => resolvePermission(undefined, role, key);

describe('storeGate: mode per account x store state', () => {
  const rows: [Account | undefined, StoreStatus | null, GateState, string][] = [
    // not approved -> the waiting room, whatever the store says
    [undefined, null, 'retailer_pending', 'pending'],
    ['pending_approval', null, 'retailer_pending', 'pending'],
    ['pending_approval', 'onboarding', 'retailer_pending', 'pending'],
    // approved but no store yet
    ['active', null, 'no_store', 'pending'],
    // live stores -> the full app
    ['active', 'onboarding', 'ready', 'full'],
    ['active', 'active', 'ready', 'full'],
    // everything else stays INSIDE the app behind a banner
    ['active', 'paused', 'store_paused', 'restricted'],
    ['active', 'suspended', 'store_suspended', 'restricted'],
    ['active', 'terminated', 'store_terminated', 'restricted'],
    // account state wins over store state
    ['terminated', null, 'account_terminated', 'restricted'],
    ['terminated', 'terminated', 'account_terminated', 'restricted'],
    ['terminated', 'active', 'account_terminated', 'restricted'],
    ['closed', null, 'account_closed', 'restricted'],
    ['closed', 'suspended', 'account_closed', 'restricted'],
    ['closed', 'active', 'account_closed', 'restricted'],
  ];

  it.each(rows)('retailer %s + store %s -> %s (%s)', (account, store, state, mode) => {
    const gate = storeGate(me(account, store));
    expect(gate.state).toBe(state);
    expect(gate.mode).toBe(mode);
  });

  it('covers every account x store combination without throwing', () => {
    const accounts: Account[] = ['pending_approval', 'active', 'terminated', 'closed'];
    const stores: (StoreStatus | null)[] = [null, 'onboarding', 'active', 'paused', 'suspended', 'terminated'];
    for (const a of accounts) {
      for (const s of stores) {
        const g = storeGate(me(a, s));
        expect(['pending', 'full', 'restricted']).toContain(g.mode);
        // a banner exists exactly when the app is restricted
        expect(g.banner != null).toBe(g.mode === 'restricted');
      }
    }
  });

  it('treats an unknown store status as not ready (never opens the app on a guess)', () => {
    expect(gateState({ retailer: { status: 'active' }, store: { status: 'weird' } })).toBe('no_store');
    expect(storeGate({ retailer: { status: 'something_new' } }).mode).toBe('pending');
    expect(storeGate(undefined).mode).toBe('pending');
    expect(storeGate(null).state).toBe('retailer_pending');
  });
});

describe('storeGate: legal gate', () => {
  it('blocks a live store until BOTH docs are accepted (terms, privacy, or both)', () => {
    for (const store of ['onboarding', 'active'] as const) {
      expect(storeGate(me('active', store, { termsAcceptanceRequired: true })).mode).toBe('legal');
      expect(storeGate(me('active', store, { privacyAcceptanceRequired: true })).mode).toBe('legal');
      const both = storeGate(
        me('active', store, { termsAcceptanceRequired: true, privacyAcceptanceRequired: true }),
      );
      expect(both.mode).toBe('legal');
      expect(both.legal).toEqual({ terms: true, privacy: true });
    }
  });

  it('opens once the docs are accepted', () => {
    const g = storeGate(
      me('active', 'active', { termsAcceptanceRequired: false, privacyAcceptanceRequired: false }),
    );
    expect(g.mode).toBe('full');
    expect(g.legal).toEqual({ terms: false, privacy: false });
  });

  it('also gates a paused store, which trades again (counter + in-flight orders)', () => {
    expect(storeGate(me('active', 'paused', { termsAcceptanceRequired: true })).mode).toBe('legal');
  });

  it('never gates stores that cannot go live or accept (a terminated POST would 403 = a trap)', () => {
    const flags = { termsAcceptanceRequired: true, privacyAcceptanceRequired: true };
    expect(storeGate(me('active', 'suspended', flags)).mode).toBe('restricted');
    expect(storeGate(me('active', 'terminated', flags)).mode).toBe('restricted');
    expect(storeGate(me('terminated', 'terminated', flags)).mode).toBe('restricted');
    expect(storeGate(me('closed', 'suspended', flags)).mode).toBe('restricted');
  });

  it('never gates a retailer that is not approved yet', () => {
    expect(storeGate(me('pending_approval', null, { termsAcceptanceRequired: true })).mode).toBe('pending');
    expect(storeGate(me('active', null, { termsAcceptanceRequired: true })).mode).toBe('pending');
  });
});

describe('storeGate: paused store', () => {
  it('lets the owner resume it', () => {
    const g = storeGate(me('active', 'paused'), canAs('owner'));
    expect(g.abilities.resume).toEqual({ available: true, allowed: true, blockedBy: null });
    expect(g.banner?.cta).toEqual({ label: 'Resume storefront', target: 'StoreStatus' });
  });

  it('treats a missing sub-role as the owner (older logins carry none)', () => {
    expect(storeGate(me('active', 'paused'), canAs(undefined)).abilities.resume.allowed).toBe(true);
  });

  it('does not let a manager or staff resume, and says why', () => {
    for (const role of ['manager', 'staff']) {
      const g = storeGate(me('active', 'paused'), canAs(role));
      expect(g.abilities.resume).toEqual({ available: true, allowed: false, blockedBy: 'permission' });
      expect(g.banner?.cta).toEqual({ label: 'View status', target: 'StoreStatus' });
      expect(g.banner?.message).toMatch(/owner/i);
    }
  });

  it('honours a server permission map over the role default', () => {
    const can = (key: string) => resolvePermission({ 'store.resume': true }, 'manager', key);
    expect(storeGate(me('active', 'paused'), can).abilities.resume.allowed).toBe(true);
    const denied = (key: string) => resolvePermission({ 'store.resume': false }, 'owner', key);
    expect(storeGate(me('active', 'paused'), denied).abilities.resume.blockedBy).toBe('permission');
  });

  it('blocks resume for a KYC pause - even for the owner - and points at KYC', () => {
    const g = storeGate(me('active', 'paused', { pauseReason: 'kyc_overdue' }), canAs('owner'));
    expect(g.abilities.resume).toEqual({ available: true, allowed: false, blockedBy: 'kyc_overdue' });
    expect(g.banner?.cta).toEqual({ label: 'Resubmit KYC', target: 'Kyc' });
    expect(g.mode).toBe('restricted');
    // the KYC reason outranks the permission reason: nobody can resume it
    expect(
      storeGate(me('active', 'paused', { pauseReason: 'kyc_overdue' }), canAs('manager')).abilities.resume
        .blockedBy,
    ).toBe('kyc_overdue');
  });

  it('is not a KYC pause for any other reason text', () => {
    const g = storeGate(me('active', 'paused', { pauseReason: 'weekend stock-take' }), canAs('owner'));
    expect(g.abilities.resume.allowed).toBe(true);
  });

  it('keeps in-flight orders and counter billing alive, but not catalogue writes', () => {
    const a = storeGate(me('active', 'paused'), canAs('owner')).abilities;
    expect(a).toMatchObject({
      viewOrders: true,
      handleOrders: true,
      counterBilling: true,
      editCatalog: false,
      appeal: false,
      reopen: false,
    });
    expect(storeGate(me('active', 'paused')).readOnly).toBe(false);
  });

  it('only offers Resume while paused', () => {
    for (const store of ['onboarding', 'active', 'suspended', 'terminated'] as const) {
      expect(storeGate(me('active', store)).abilities.resume).toEqual({
        available: false,
        allowed: false,
        blockedBy: null,
      });
    }
  });
});

describe('storeGate: suspended and terminated', () => {
  it('suspended store: appeal open, in-flight orders still handled, no billing / catalogue', () => {
    const g = storeGate(me('active', 'suspended'));
    expect(g.banner?.cta).toEqual({ label: 'Open status & appeal', target: 'AccountStatus' });
    expect(g.banner?.tone).toBe('danger');
    expect(g.readOnly).toBe(false);
    expect(g.abilities).toMatchObject({
      appeal: true,
      reopen: false,
      viewOrders: true,
      handleOrders: true,
      counterBilling: false,
      editCatalog: false,
    });
  });

  it('terminated store is read-only: orders visible, nothing changes, appeal open', () => {
    const g = storeGate(me('active', 'terminated'));
    expect(g.readOnly).toBe(true);
    expect(g.abilities).toMatchObject({
      appeal: true,
      viewOrders: true,
      handleOrders: false,
      counterBilling: false,
      editCatalog: false,
    });
    expect(g.banner?.title).toMatch(/read-only/i);
  });

  it('terminated account is read-only with an appeal path', () => {
    for (const store of [null, 'terminated'] as const) {
      const g = storeGate(me('terminated', store));
      expect(g.readOnly).toBe(true);
      expect(g.abilities).toMatchObject({ appeal: true, viewOrders: true, handleOrders: false });
      expect(g.banner?.cta.target).toBe('AccountStatus');
      expect(g.banner?.message).toMatch(/orders, invoices and statements/);
    }
  });
});

describe('storeGate: closed account', () => {
  it('offers reopen, no appeal, and nothing operational', () => {
    const g = storeGate(me('closed', 'suspended'));
    expect(g.readOnly).toBe(true);
    expect(g.abilities).toMatchObject({
      reopen: true,
      appeal: false,
      viewOrders: false,
      handleOrders: false,
      counterBilling: false,
      editCatalog: false,
    });
    expect(g.banner).toMatchObject({
      title: 'Account closed',
      cta: { label: 'Request reopen', target: 'AccountStatus' },
    });
  });

  it('reflects a reopen request already in flight', () => {
    const g = storeGate(me('closed', 'suspended', { pendingAccountRequest: 'account_reopen' }));
    expect(g.banner?.title).toBe('Reopen request pending');
    expect(g.banner?.cta.label).toBe('View status');
  });
});

describe('storeGate: live store', () => {
  it('has no banner and every operation open', () => {
    const g = storeGate(me('active', 'active'));
    expect(g.banner).toBeNull();
    expect(g.readOnly).toBe(false);
    expect(g.abilities).toMatchObject({
      viewOrders: true,
      handleOrders: true,
      counterBilling: true,
      editCatalog: true,
      appeal: false,
      reopen: false,
    });
  });

  it('an onboarding store manages its catalogue but is not open for counter sales yet', () => {
    const g = storeGate(me('active', 'onboarding'));
    expect(g.abilities.editCatalog).toBe(true);
    expect(g.abilities.counterBilling).toBe(false);
  });
});
