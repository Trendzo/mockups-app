/**
 * Phone-push token manager with Firebase / Notifee / the API faked: permission, register,
 * de-dup, token refresh, logout ordering, 404 swallow, Firebase-not-configured no-op, foreground
 * display, and tap routing.
 */
import { createAlertRegistry } from '../src/services/push/alertRegistry';
import type { MessagingClient, NotifeeClient } from '../src/services/push/clients';
import {
  createPushManager,
  NATIVE_CALL_TIMEOUT_MS,
  PERMISSION_ASKED_KEY,
  PushManagerDeps,
} from '../src/services/push/pushManager';
import type { PermissionState, PushNavData, RemoteMessageLike } from '../src/services/push/types';

type Listener<T> = (v: T) => unknown;

interface FakeMessaging {
  token: string | null;
  initial: RemoteMessageLike | null;
  getToken: jest.Mock<Promise<string | null>, []>;
  deleteToken: jest.Mock;
  onTokenRefresh: jest.Mock;
  onMessage: jest.Mock;
  onNotificationOpenedApp: jest.Mock;
  getInitialNotification: jest.Mock;
  setBackgroundMessageHandler: jest.Mock;
  appVersion: jest.Mock<string | undefined, []>;
}

function makeMessaging(token: string | null = 'fcm-1') {
  const onMessage: Array<Listener<RemoteMessageLike>> = [];
  const onOpened: Array<Listener<RemoteMessageLike>> = [];
  const onRefresh: Array<Listener<string>> = [];
  const client: FakeMessaging = {
    token,
    initial: null,
    getToken: jest.fn(async () => client.token),
    deleteToken: jest.fn(async () => undefined),
    onTokenRefresh: jest.fn((cb: Listener<string>) => {
      onRefresh.push(cb);
      return () => undefined;
    }),
    onMessage: jest.fn((cb: Listener<RemoteMessageLike>) => {
      onMessage.push(cb);
      return () => undefined;
    }),
    onNotificationOpenedApp: jest.fn((cb: Listener<RemoteMessageLike>) => {
      onOpened.push(cb);
      return () => undefined;
    }),
    getInitialNotification: jest.fn(async () => client.initial),
    setBackgroundMessageHandler: jest.fn(),
    appVersion: jest.fn(() => '1.7.5'),
  };
  return { client: client as unknown as MessagingClient & FakeMessaging, onMessage, onOpened, onRefresh };
}

function makeNotifee(initial: PermissionState = 'granted') {
  const press: Array<(n: PushNavData) => void> = [];
  const state = { permission: initial, afterRequest: 'granted' as PermissionState, initialPress: null as PushNavData | null };
  const client = {
    state,
    ensureChannels: jest.fn(async () => undefined),
    display: jest.fn(async () => undefined),
    getPermission: jest.fn(async () => state.permission),
    requestPermission: jest.fn(async () => {
      state.permission = state.afterRequest;
      return state.permission;
    }),
    openSettings: jest.fn(async () => undefined),
    onForegroundPress: jest.fn((cb: (n: PushNavData) => void) => {
      press.push(cb);
      return () => undefined;
    }),
    onBackgroundPress: jest.fn(),
    getInitialPress: jest.fn(async () => state.initialPress),
  };
  return { client: client as unknown as NotifeeClient & typeof client, press };
}

interface Harness {
  deps: PushManagerDeps;
  messaging: ReturnType<typeof makeMessaging>;
  notifee: ReturnType<typeof makeNotifee>;
  api: { register: jest.Mock; revoke: jest.Mock };
  calls: string[];
  session: { token: string | null };
  authListeners: Array<(next: string | null, prev: string | null) => void>;
  fgListeners: Array<() => void>;
  openLink: jest.Mock;
  logs: string[];
  store: Map<string, string>;
  onForegroundPush: jest.Mock;
  /** Simulate the auth store changing: updates the session and notifies like zustand.subscribe. */
  setSession(next: string | null): void;
}

function harness(opts: {
  platform?: 'android' | 'ios' | null;
  permission?: PermissionState;
  token?: string | null;
  session?: string | null;
  firebase?: boolean;
  pushEnabled?: () => Promise<boolean>;
  apiRegister?: jest.Mock;
  apiRevoke?: jest.Mock;
} = {}): Harness {
  const messaging = makeMessaging(opts.token === undefined ? 'fcm-1' : opts.token);
  const notifee = makeNotifee(opts.permission ?? 'granted');
  const calls: string[] = [];
  const origRegister: jest.Mock = opts.apiRegister ?? jest.fn(async () => 'ok');
  const origRevoke: jest.Mock = opts.apiRevoke ?? jest.fn(async () => 'ok');
  // Wrap so the order of register/revoke across the whole run is observable in `calls`.
  const api = {
    register: jest.fn(async (...a: unknown[]) => {
      calls.push('register');
      return origRegister(...a);
    }),
    revoke: jest.fn(async (...a: unknown[]) => {
      calls.push('revoke');
      return origRevoke(...a);
    }),
  };
  const session = { token: opts.session === undefined ? 'jwt-A' : opts.session };
  const authListeners: Array<(next: string | null, prev: string | null) => void> = [];
  const fgListeners: Array<() => void> = [];
  const store = new Map<string, string>();
  const logs: string[] = [];
  const openLink = jest.fn();
  const onForegroundPush = jest.fn();
  const deps: PushManagerDeps = {
    platform: opts.platform === undefined ? 'android' : opts.platform,
    getMessaging: () =>
      opts.firebase === false
        ? { client: null, reason: 'Firebase is not configured in this build' }
        : { client: messaging.client, reason: null },
    getNotifee: () => notifee.client,
    api: api as unknown as PushManagerDeps['api'],
    auth: {
      getToken: () => session.token,
      subscribe: (l) => {
        authListeners.push(l);
        return () => undefined;
      },
    },
    storage: {
      get: async (k) => store.get(k) ?? null,
      set: async (k, v) => void store.set(k, v),
    },
    openLink,
    onForeground: (cb) => {
      fgListeners.push(cb);
      return () => undefined;
    },
    onForegroundPush,
    ...(opts.pushEnabled ? { isPushEnabled: opts.pushEnabled } : {}),
    alerts: createAlertRegistry(),
    log: (m) => logs.push(m),
  };
  return {
    deps,
    messaging,
    notifee,
    api,
    calls,
    session,
    authListeners,
    fgListeners,
    openLink,
    logs,
    store,
    onForegroundPush,
    setSession(next) {
      const prev = session.token;
      session.token = next;
      for (const l of authListeners) l(next, prev);
    },
  };
}

/** Let queued promise chains settle. */
const flush = async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};

describe('registration', () => {
  it('registers the FCM token with platform and app version for a signed-in session', async () => {
    const h = harness();
    const m = createPushManager(h.deps);
    await expect(m.ensureRegistered()).resolves.toEqual({ status: 'registered' });
    expect(h.api.register).toHaveBeenCalledTimes(1);
    expect(h.api.register).toHaveBeenCalledWith(
      { token: 'fcm-1', platform: 'android', appVersion: '1.7.5' },
      'jwt-A',
    );
  });

  it('omits appVersion when the native side cannot report one', async () => {
    const h = harness();
    h.messaging.client.appVersion.mockReturnValue(undefined);
    await createPushManager(h.deps).ensureRegistered();
    expect(h.api.register).toHaveBeenCalledWith({ token: 'fcm-1', platform: 'android' }, 'jwt-A');
  });

  it('does nothing when signed out', async () => {
    const h = harness({ session: null });
    await expect(createPushManager(h.deps).ensureRegistered()).resolves.toEqual({
      status: 'skipped',
      reason: 'not signed in',
    });
    expect(h.api.register).not.toHaveBeenCalled();
  });

  it('is idempotent: repeated calls for the same session and token hit the server once', async () => {
    const h = harness();
    const m = createPushManager(h.deps);
    await m.ensureRegistered();
    await expect(m.ensureRegistered()).resolves.toEqual({ status: 'already' });
    await Promise.all([m.ensureRegistered(), m.ensureRegistered()]);
    expect(h.api.register).toHaveBeenCalledTimes(1);
    // force pushes through
    await m.ensureRegistered({ force: true });
    expect(h.api.register).toHaveBeenCalledTimes(2);
  });

  it('re-registers when the same token is seen under a new session', async () => {
    const h = harness();
    const m = createPushManager(h.deps);
    await m.ensureRegistered();
    h.session.token = 'jwt-B';
    await m.ensureRegistered();
    expect(h.api.register).toHaveBeenCalledTimes(2);
    expect(h.api.register).toHaveBeenLastCalledWith(expect.objectContaining({ token: 'fcm-1' }), 'jwt-B');
  });

  it('never throws into the UI when the API fails; reports failed and recovers on the next attempt', async () => {
    const register = jest.fn().mockRejectedValueOnce({ code: 'unreachable', message: 'offline' }).mockResolvedValue('ok');
    const h = harness({ apiRegister: register });
    const m = createPushManager(h.deps);
    await expect(m.ensureRegistered()).resolves.toEqual({ status: 'failed', reason: 'offline' });
    await expect(m.ensureRegistered()).resolves.toEqual({ status: 'registered' });
  });

  it('reports failed when FCM returns no token', async () => {
    const h = harness({ token: null });
    await expect(createPushManager(h.deps).ensureRegistered()).resolves.toEqual({
      status: 'failed',
      reason: 'no FCM token',
    });
    expect(h.api.register).not.toHaveBeenCalled();
  });

  it('a hung FCM getToken times out instead of wedging the queue', async () => {
    jest.useFakeTimers();
    try {
      const h = harness();
      h.messaging.client.getToken.mockImplementation(() => new Promise(() => undefined));
      const m = createPushManager(h.deps);
      const p = m.ensureRegistered();
      await jest.advanceTimersByTimeAsync(NATIVE_CALL_TIMEOUT_MS + 1);
      await expect(p).resolves.toEqual({ status: 'failed', reason: 'FCM getToken timed out' });
      // The queue is free again.
      h.messaging.client.getToken.mockResolvedValue('fcm-1');
      await expect(m.ensureRegistered()).resolves.toEqual({ status: 'registered' });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the "Push notifications" switch in Alert settings', () => {
  it('off: no prompt, no registration, nothing sent', async () => {
    const h = harness({ permission: 'denied', pushEnabled: async () => false });
    await expect(createPushManager(h.deps).ensureRegistered()).resolves.toEqual({
      status: 'skipped',
      reason: 'push switched off in settings',
    });
    expect(h.notifee.client.requestPermission).not.toHaveBeenCalled();
    expect(h.api.register).not.toHaveBeenCalled();
  });

  it('switching off after registering revokes this device; switching back on registers it again', async () => {
    let on = true;
    const h = harness({ pushEnabled: async () => on });
    const m = createPushManager(h.deps);
    await m.ensureRegistered();
    expect(m.isRegistered()).toBe(true);
    on = false;
    await m.ensureRegistered({ force: true });
    expect(h.api.revoke).toHaveBeenCalledWith('fcm-1', 'jwt-A');
    expect(m.isRegistered()).toBe(false);
    on = true;
    await expect(m.ensureRegistered({ force: true })).resolves.toEqual({ status: 'registered' });
    expect(m.isRegistered()).toBe(true);
  });

  it('fails OPEN: an unreadable preference never silences order alerts', async () => {
    const h = harness({ pushEnabled: async () => Promise.reject(new Error('offline')) });
    await expect(createPushManager(h.deps).ensureRegistered()).resolves.toEqual({ status: 'registered' });
  });
});

describe('404 from a server without the route yet', () => {
  it('is swallowed, logged, and not retried on every call', async () => {
    const h = harness({ apiRegister: jest.fn(async () => 'unsupported') });
    const m = createPushManager(h.deps);
    await expect(m.ensureRegistered()).resolves.toEqual({
      status: 'skipped',
      reason: 'server route missing (404)',
    });
    expect(h.logs.join('\n')).toMatch(/no \/retailer\/push route/);
    await m.ensureRegistered();
    expect(h.api.register).toHaveBeenCalledTimes(1);
  });

  it('a 404 on revoke is swallowed too', async () => {
    const h = harness({ apiRevoke: jest.fn(async () => 'unsupported') });
    const m = createPushManager(h.deps);
    m.init();
    await flush();
    h.setSession(null);
    await flush();
    expect(h.api.revoke).toHaveBeenCalledTimes(1);
    expect(h.logs.join('\n')).toMatch(/no \/retailer\/push\/revoke route/);
  });
});

describe('Firebase not configured (no google-services.json)', () => {
  it('is a logged no-op and never touches the API; init still creates channels', async () => {
    const h = harness({ firebase: false });
    const m = createPushManager(h.deps);
    m.init();
    await flush();
    await expect(m.ensureRegistered()).resolves.toEqual({ status: 'skipped', reason: 'Firebase not configured' });
    expect(h.api.register).not.toHaveBeenCalled();
    expect(h.logs.filter((l) => l.includes('phone push disabled'))).toHaveLength(1); // logged once
    expect(h.notifee.client.ensureChannels).toHaveBeenCalled();
    expect(m.unavailableReason()).toMatch(/not configured/);
  });

  it('still asks for notification permission so in-app (Notifee) alerts can ring', async () => {
    const h = harness({ firebase: false, permission: 'denied' });
    await createPushManager(h.deps).ensureRegistered();
    expect(h.notifee.client.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('logout makes no network call when there was never a token', async () => {
    const h = harness({ firebase: false });
    const m = createPushManager(h.deps);
    m.init();
    await flush();
    h.setSession(null);
    await flush();
    expect(h.api.revoke).not.toHaveBeenCalled();
  });

  it('platforms other than ios/android skip quietly', async () => {
    const h = harness({ platform: null });
    await expect(createPushManager(h.deps).ensureRegistered()).resolves.toEqual({
      status: 'skipped',
      reason: 'unsupported platform',
    });
  });
});

describe('notification permission', () => {
  it('Android denied-before-ask: prompts once, then registers when granted', async () => {
    const h = harness({ permission: 'denied' });
    const m = createPushManager(h.deps);
    await expect(m.ensureRegistered()).resolves.toEqual({ status: 'registered' });
    expect(h.notifee.client.requestPermission).toHaveBeenCalledTimes(1);
    expect(h.store.get(PERMISSION_ASKED_KEY)).toBe('1');
  });

  it('Android user said no: skips, does not register, and never nags again automatically', async () => {
    const h = harness({ permission: 'denied' });
    h.notifee.client.state.afterRequest = 'denied';
    const m = createPushManager(h.deps);
    const first = await m.ensureRegistered();
    expect(first).toEqual({ status: 'skipped', reason: 'notification permission denied' });
    expect(h.api.register).not.toHaveBeenCalled();
    await m.ensureRegistered();
    await m.ensureRegistered();
    expect(h.notifee.client.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('iOS not-determined prompts; iOS denied never prompts', async () => {
    const a = harness({ platform: 'ios', permission: 'not_determined' });
    await expect(createPushManager(a.deps).ensureRegistered()).resolves.toEqual({ status: 'registered' });
    expect(a.notifee.client.requestPermission).toHaveBeenCalledTimes(1);
    expect(a.api.register).toHaveBeenCalledWith({ token: 'fcm-1', platform: 'ios', appVersion: '1.7.5' }, 'jwt-A');

    const b = harness({ platform: 'ios', permission: 'denied' });
    await expect(createPushManager(b.deps).ensureRegistered()).resolves.toEqual({
      status: 'skipped',
      reason: 'notification permission denied',
    });
    expect(b.notifee.client.requestPermission).not.toHaveBeenCalled();
  });

  it('prompt:false (foreground / token refresh) checks the permission without ever prompting', async () => {
    const h = harness({ permission: 'denied' });
    await createPushManager(h.deps).ensureRegistered({ prompt: false });
    expect(h.notifee.client.requestPermission).not.toHaveBeenCalled();
    expect(h.api.register).not.toHaveBeenCalled();
  });

  it('turning notifications off after registering revokes the device at the next check', async () => {
    const h = harness();
    const m = createPushManager(h.deps);
    await m.ensureRegistered();
    h.notifee.client.state.permission = 'denied';
    await m.ensureRegistered({ prompt: false });
    expect(h.api.revoke).toHaveBeenCalledWith('fcm-1', 'jwt-A');
    // ... and re-enabling registers again.
    h.notifee.client.state.permission = 'granted';
    await expect(m.ensureRegistered({ prompt: false })).resolves.toEqual({ status: 'registered' });
  });

  it('getPermissionInfo says whether the OS prompt can still appear', async () => {
    const h = harness({ permission: 'denied' });
    const m = createPushManager(h.deps);
    await expect(m.getPermissionInfo()).resolves.toEqual({ state: 'denied', canPrompt: true });
    h.store.set(PERMISSION_ASKED_KEY, '1');
    await expect(m.getPermissionInfo()).resolves.toEqual({ state: 'denied', canPrompt: false });
    h.notifee.client.state.permission = 'granted';
    await expect(m.getPermissionInfo()).resolves.toEqual({ state: 'granted', canPrompt: false });
    const ios = createPushManager(harness({ platform: 'ios', permission: 'not_determined' }).deps);
    await expect(ios.getPermissionInfo()).resolves.toEqual({ state: 'not_determined', canPrompt: true });
  });

  it('requestPermission from Settings registers the device when granted; open settings is forwarded', async () => {
    const h = harness({ permission: 'denied' });
    h.store.set(PERMISSION_ASKED_KEY, '1');
    const m = createPushManager(h.deps);
    await expect(m.requestPermission()).resolves.toBe('granted');
    await flush();
    expect(h.api.register).toHaveBeenCalledTimes(1);
    await m.openSystemSettings();
    expect(h.notifee.client.openSettings).toHaveBeenCalled();
  });
});

describe('auth lifecycle (login -> register, logout -> revoke, ordering)', () => {
  it('init registers an existing session and does not double-register when auth echoes', async () => {
    const h = harness();
    createPushManager(h.deps).init();
    await flush();
    expect(h.api.register).toHaveBeenCalledTimes(1);
  });

  it('login registers; logout revokes with the OLD session token, then drops the local FCM token', async () => {
    const h = harness({ session: null });
    const m = createPushManager(h.deps);
    m.init();
    await flush();
    expect(h.api.register).not.toHaveBeenCalled();

    h.setSession('jwt-A'); // login (or hydration of a persisted session)
    await flush();
    expect(h.api.register).toHaveBeenCalledWith(expect.objectContaining({ token: 'fcm-1' }), 'jwt-A');

    h.setSession(null); // logout: the store already has no token when this fires
    await flush();
    // Revoke went out with the token that WAS valid, not the (now empty) store token.
    expect(h.api.revoke).toHaveBeenCalledWith('fcm-1', 'jwt-A');
    expect(h.messaging.client.deleteToken).toHaveBeenCalledTimes(1);
    expect(h.calls).toEqual(['register', 'revoke']);
  });

  it('a logout that lands while registration is still in flight revokes AFTER the register completes', async () => {
    let releaseRegister: (v: string) => void = () => undefined;
    const register = jest.fn(
      () =>
        new Promise<string>((res) => {
          releaseRegister = res;
        }),
    );
    const h = harness({ apiRegister: register as unknown as jest.Mock });
    const m = createPushManager(h.deps);
    m.init();
    await flush();
    h.setSession(null);
    await flush();
    expect(h.api.revoke).not.toHaveBeenCalled(); // queued behind the register
    releaseRegister('ok');
    await flush();
    expect(h.calls).toEqual(['register', 'revoke']);
    expect(h.api.revoke).toHaveBeenCalledWith('fcm-1', 'jwt-A');
  });

  it('after logout the same account logging in again registers again', async () => {
    const h = harness();
    const m = createPushManager(h.deps);
    m.init();
    await flush();
    h.setSession(null);
    await flush();
    h.setSession('jwt-A2');
    await flush();
    expect(h.calls).toEqual(['register', 'revoke', 'register']);
  });

  it('switching accounts without a logout revokes the old session first, then registers the new one', async () => {
    const h = harness();
    const m = createPushManager(h.deps);
    m.init();
    await flush();
    h.calls.length = 0;
    h.setSession('jwt-B');
    await flush();
    expect(h.calls).toEqual(['revoke', 'register']);
    expect(h.api.revoke).toHaveBeenCalledWith('fcm-1', 'jwt-A');
    expect(h.api.register).toHaveBeenLastCalledWith(expect.objectContaining({ token: 'fcm-1' }), 'jwt-B');
    expect(h.messaging.client.deleteToken).not.toHaveBeenCalled(); // same device keeps its token
  });

  it('a failed revoke (expired session) never throws and still drops the local token', async () => {
    const h = harness({ apiRevoke: jest.fn().mockRejectedValue({ code: 'unauthorized', message: 'expired', status: 401 }) });
    const m = createPushManager(h.deps);
    m.init();
    await flush();
    expect(() => h.setSession(null)).not.toThrow();
    await flush();
    expect(h.logs.join('\n')).toMatch(/revoke failed: expired/);
    expect(h.messaging.client.deleteToken).toHaveBeenCalled();
  });
});

describe('token refresh and foreground', () => {
  it('a refreshed token is registered and the dead one revoked (register first)', async () => {
    const h = harness();
    const m = createPushManager(h.deps);
    m.init();
    await flush();
    h.calls.length = 0;
    h.messaging.client.token = 'fcm-2';
    h.messaging.onRefresh.forEach((cb) => cb('fcm-2'));
    await flush();
    expect(h.api.register).toHaveBeenLastCalledWith(expect.objectContaining({ token: 'fcm-2' }), 'jwt-A');
    expect(h.api.revoke).toHaveBeenCalledWith('fcm-1', 'jwt-A');
    expect(h.calls).toEqual(['register', 'revoke']);
    // the new pair is remembered: another foreground does not re-POST
    h.fgListeners.forEach((cb) => cb());
    await flush();
    expect(h.api.register).toHaveBeenCalledTimes(2);
  });

  it('coming back to the foreground re-checks but does not re-POST an unchanged pair', async () => {
    const h = harness();
    createPushManager(h.deps).init();
    await flush();
    h.fgListeners.forEach((cb) => cb());
    h.fgListeners.forEach((cb) => cb());
    await flush();
    expect(h.api.register).toHaveBeenCalledTimes(1);
  });

  it('foreground picks up a permission turned on in system settings', async () => {
    const h = harness({ permission: 'denied' });
    h.store.set(PERMISSION_ASKED_KEY, '1');
    createPushManager(h.deps).init();
    await flush();
    expect(h.api.register).not.toHaveBeenCalled();
    h.notifee.client.state.permission = 'granted';
    h.fgListeners.forEach((cb) => cb());
    await flush();
    expect(h.api.register).toHaveBeenCalledTimes(1);
  });
});

describe('foreground messages (app open)', () => {
  const orderPush = (extra: Partial<RemoteMessageLike> = {}): RemoteMessageLike => ({
    messageId: 'mid-1',
    notification: { title: 'New order', body: '2 items' },
    data: { kind: 'order', orderId: 'ord_1', deepLink: '/retailer/orders/ord_1' },
    ...extra,
  });

  it('shows the push locally on the orders channel so it rings, and refreshes inbox/orders', async () => {
    const h = harness();
    createPushManager(h.deps).init();
    await flush();
    h.messaging.onMessage.forEach((cb) => cb(orderPush()));
    await flush();
    expect(h.notifee.client.display).toHaveBeenCalledWith({
      id: 'order-new-ord_1',
      title: 'New order',
      body: '2 items',
      channelId: 'orders',
      data: { kind: 'order', deepLink: '/retailer/orders/ord_1', orderId: 'ord_1' },
    });
    expect(h.onForegroundPush).toHaveBeenCalledTimes(1);
  });

  it('does not ring twice when the 15 s poll already announced the order', async () => {
    const h = harness();
    h.deps.alerts.claim('ord_1'); // the poll got there first
    createPushManager(h.deps).init();
    await flush();
    h.messaging.onMessage.forEach((cb) => cb(orderPush()));
    await flush();
    expect(h.notifee.client.display).not.toHaveBeenCalled();
    expect(h.onForegroundPush).toHaveBeenCalledTimes(1); // data still refreshes
  });

  it('a later non-new-order push for the same order (a cancellation) is still shown', async () => {
    const h = harness();
    h.deps.alerts.claim('ord_1');
    createPushManager(h.deps).init();
    await flush();
    h.messaging.onMessage.forEach((cb) =>
      cb(orderPush({ notification: { title: 'Order cancelled', body: 'ord_1' } })),
    );
    await flush();
    expect(h.notifee.client.display).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Order cancelled', id: 'push-mid-1', channelId: 'orders' }),
    );
  });

  it('non-order pushes use the general channel; silent data pushes show nothing', async () => {
    const h = harness();
    createPushManager(h.deps).init();
    await flush();
    h.messaging.onMessage.forEach((cb) =>
      cb({ messageId: 'p1', notification: { title: 'Payout sent', body: '₹5,000' }, data: { kind: 'payout' } }),
    );
    h.messaging.onMessage.forEach((cb) => cb({ data: { kind: 'order', orderId: 'x' } }));
    await flush();
    expect(h.notifee.client.display).toHaveBeenCalledTimes(1);
    expect(h.notifee.client.display).toHaveBeenCalledWith(expect.objectContaining({ channelId: 'general' }));
  });

  it('a display failure never escapes', async () => {
    const h = harness();
    h.notifee.client.display.mockRejectedValue(new Error('boom'));
    createPushManager(h.deps).init();
    await flush();
    h.messaging.onMessage.forEach((cb) => cb(orderPush()));
    await flush();
    expect(h.logs.join('\n')).toMatch(/display failed: boom/);
  });
});

describe('notification taps', () => {
  it('routes taps from all four sources through openLink', async () => {
    const h = harness();
    h.messaging.client.initial = { data: { kind: 'order', orderId: 'ord_cold' } };
    h.notifee.client.state.initialPress = { kind: 'order', orderId: 'ord_notifee_cold', deepLink: null };
    createPushManager(h.deps).init();
    await flush();
    // killed -> FCM tap, killed -> Notifee tap
    expect(h.openLink).toHaveBeenCalledWith({ kind: 'order', deepLink: null, orderId: 'ord_cold' });
    expect(h.openLink).toHaveBeenCalledWith({ kind: 'order', orderId: 'ord_notifee_cold', deepLink: null });
    // background -> FCM "opened app"
    h.messaging.onOpened.forEach((cb) => cb({ data: { kind: 'payout', deepLink: '/retailer/payouts/po_1' } }));
    expect(h.openLink).toHaveBeenCalledWith({ kind: 'payout', deepLink: '/retailer/payouts/po_1', orderId: null });
    // foreground -> Notifee press
    h.notifee.press.forEach((cb) => cb({ kind: 'order', orderId: 'ord_fg' }));
    expect(h.openLink).toHaveBeenCalledWith({ kind: 'order', orderId: 'ord_fg' });
    expect(h.openLink).toHaveBeenCalledTimes(4);
  });

  it('init is idempotent: listeners attach once', async () => {
    const h = harness();
    const m = createPushManager(h.deps);
    m.init();
    m.init();
    await flush();
    expect(h.messaging.client.onMessage).toHaveBeenCalledTimes(1);
    expect(h.authListeners).toHaveLength(1);
    expect(h.api.register).toHaveBeenCalledTimes(1);
  });

  it('init never throws even if every native call explodes', async () => {
    const h = harness();
    h.notifee.client.ensureChannels.mockRejectedValue(new Error('no channels'));
    h.notifee.client.getInitialPress.mockRejectedValue(new Error('no initial'));
    h.messaging.client.getInitialNotification.mockRejectedValue(new Error('no initial'));
    expect(() => createPushManager(h.deps).init()).not.toThrow();
    await flush();
  });
});

describe('showLocal (used by the in-app poll alert)', () => {
  it('creates channels then displays; false when Notifee is missing', async () => {
    const h = harness();
    const m = createPushManager(h.deps);
    const n = { id: 'order-new-o1', title: 'New order', body: 'x', channelId: 'orders' as const, data: {} };
    await expect(m.showLocal(n)).resolves.toBe(true);
    expect(h.notifee.client.ensureChannels).toHaveBeenCalled();
    expect(h.notifee.client.display).toHaveBeenCalledWith(n);

    const none = createPushManager({ ...h.deps, getNotifee: () => null });
    await expect(none.showLocal(n)).resolves.toBe(false);
    await expect(none.getPermission()).resolves.toBe('unavailable');
  });
});
