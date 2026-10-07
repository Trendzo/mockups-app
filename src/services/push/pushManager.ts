/**
 * Phone-push token manager for the retailer app.
 *
 *  - asks for notification permission (Android 13+ POST_NOTIFICATIONS / iOS authorization),
 *  - gets the FCM token and registers it with POST /retailer/push, once per (session, token),
 *  - re-registers on token refresh and app foreground, revokes on logout / account switch,
 *  - shows pushes that arrive while the app is open through Notifee (so they ring),
 *  - routes notification taps.
 *
 * Contract with the rest of the app: nothing here ever throws into the UI, and a build without
 * Firebase configured (no google-services.json) is a logged no-op, so login and the 15 s polling
 * alerts are unaffected. All native access goes through injected clients so the logic is unit-tested
 * with fakes (see __tests__/pushManager.test.ts); the real wiring lives in pushRuntime.ts.
 */
import type { PushCallResult } from '../../api/push';
import type { AlertRegistry } from './alertRegistry';
import type { MessagingClient, MessagingLoad, NotifeeClient } from './clients';
import { createRegistrationLedger, RegistrationLedger } from './ledger';
import { navDataFrom, navDataOf, parsePush } from './payload';
import type {
  LocalNotification,
  ParsedPush,
  PermissionState,
  PushNavData,
  PushPlatform,
  RemoteMessageLike,
} from './types';

export const PERMISSION_ASKED_KEY = 'trendzo.push.permissionAsked.v1';
/** FCM can hang when offline / without Play services; never let that wedge the serial queue (and a logout behind it). */
export const NATIVE_CALL_TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export type RegisterOutcome =
  | { status: 'registered' }
  | { status: 'already' }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string };

export interface PushManagerDeps {
  /** null = a platform push does not run on. */
  platform: PushPlatform | null;
  getMessaging(): MessagingLoad;
  getNotifee(): NotifeeClient | null;
  api: {
    register(body: { token: string; platform: PushPlatform; appVersion?: string }, authToken: string): Promise<PushCallResult>;
    revoke(token: string, authToken: string): Promise<PushCallResult>;
  };
  auth: {
    getToken(): string | null;
    /** Called with (next, previous) session tokens on every change. */
    subscribe(listener: (next: string | null, prev: string | null) => void): () => void;
  };
  storage: { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> };
  /** Route a tapped notification. */
  openLink(nav: PushNavData): void;
  /** Subscribe to "app came to the foreground". */
  onForeground(cb: () => void): () => void;
  /** A push arrived while the app is open (refresh inbox/orders). */
  onForegroundPush?(push: ParsedPush): void;
  alerts: AlertRegistry;
  ledger?: RegistrationLedger;
  now?: () => number;
  log?: (message: string) => void;
}

export interface PushManager {
  /** Idempotent. Creates channels, attaches listeners, registers if a session exists. */
  init(): void;
  ensureRegistered(opts?: { force?: boolean; prompt?: boolean }): Promise<RegisterOutcome>;
  /** OS permission without prompting. */
  getPermission(): Promise<PermissionState>;
  /** Permission plus whether the app can still show the OS prompt (else the user must use system settings). */
  getPermissionInfo(): Promise<{ state: PermissionState; canPrompt: boolean }>;
  /** Prompt (or re-check) now; registers the device if it ends up granted. */
  requestPermission(): Promise<PermissionState>;
  openSystemSettings(): Promise<void>;
  /** Why phone push is unavailable in this build (null = Firebase configured). */
  unavailableReason(): string | null;
  /** Show a notification through Notifee (sound + tray). False when it could not be shown. */
  showLocal(n: LocalNotification): Promise<boolean>;
  dispose(): void;
}

export function createPushManager(deps: PushManagerDeps): PushManager {
  const ledger = deps.ledger ?? createRegistrationLedger();
  const now = deps.now ?? Date.now;
  const log = (m: string) => (deps.log ?? ((x: string) => console.log(`[push] ${x}`)))(m);
  const unsubs: Array<() => void> = [];
  let initialized = false;
  let queue: Promise<unknown> = Promise.resolve();
  let loggedUnavailable = false;

  /** Serialise every registration/revoke so a logout can never race a half-finished register. */
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn);
    queue = run.catch(() => undefined);
    return run;
  };

  const messaging = (): MessagingClient | null => {
    const { client, reason } = deps.getMessaging();
    if (!client && reason && !loggedUnavailable) {
      loggedUnavailable = true;
      log(`phone push disabled: ${reason}`);
    }
    return client;
  };

  async function readAsked(): Promise<boolean> {
    try {
      return (await deps.storage.get(PERMISSION_ASKED_KEY)) === '1';
    } catch {
      return false;
    }
  }
  async function writeAsked(): Promise<void> {
    try {
      await deps.storage.set(PERMISSION_ASKED_KEY, '1');
    } catch {
      // not fatal
    }
  }

  /**
   * Permission to deliver notifications. Prompts at most once automatically (Android reports
   * "denied" both before and after the first ask, so a stored flag tells them apart); after that
   * the Settings screen is the place to turn it back on.
   */
  async function resolvePermission(allowPrompt: boolean): Promise<PermissionState> {
    const notifee = deps.getNotifee();
    if (!notifee) return 'unavailable';
    let state = await notifee.getPermission();
    if (state === 'granted' || !allowPrompt) return state;
    const canAsk = state === 'not_determined' || (deps.platform === 'android' && !(await readAsked()));
    if (!canAsk) return state;
    await writeAsked();
    state = await notifee.requestPermission();
    return state;
  }

  async function register(opts: { force?: boolean; prompt?: boolean } = {}): Promise<RegisterOutcome> {
    const authToken = deps.auth.getToken();
    if (!authToken) return { status: 'skipped', reason: 'not signed in' };
    if (!deps.platform) return { status: 'skipped', reason: 'unsupported platform' };

    try {
      // Permission first and independent of Firebase: Notifee's local alerts (the in-app / polling
      // fallback) need it on Android 13+ even in a build with no google-services.json.
      const permission = await resolvePermission(opts.prompt !== false);
      if (permission !== 'granted') {
        // Notifications are off: make sure the server stops pushing to this device.
        const known = ledger.current();
        if (known) await revokeKnown(known.authKey, known.token);
        return { status: 'skipped', reason: `notification permission ${permission}` };
      }

      const client = messaging();
      if (!client) return { status: 'skipped', reason: 'Firebase not configured' };

      const fcmToken = await withTimeout(client.getToken(), NATIVE_CALL_TIMEOUT_MS, 'FCM getToken');
      if (!fcmToken) return { status: 'failed', reason: 'no FCM token' };
      // The session may have ended while we waited on the OS prompt / FCM.
      if (deps.auth.getToken() !== authToken) return { status: 'skipped', reason: 'session changed' };
      if (!opts.force && !ledger.shouldRegister(authToken, fcmToken, now())) return { status: 'already' };

      const appVersion = client.appVersion();
      const result = await deps.api.register(
        { token: fcmToken, platform: deps.platform, ...(appVersion ? { appVersion } : {}) },
        authToken,
      );
      if (result === 'unsupported') {
        ledger.markUnsupported(now());
        log('server has no /retailer/push route yet; will retry later');
        return { status: 'skipped', reason: 'server route missing (404)' };
      }
      ledger.markRegistered(authToken, fcmToken, now());
      return { status: 'registered' };
    } catch (e) {
      const reason = (e as { message?: string })?.message ?? 'registration failed';
      log(`register failed: ${reason}`);
      return { status: 'failed', reason };
    }
  }

  /** Revoke `token` for the session `authToken`. Never throws. */
  async function revokeKnown(authToken: string, token: string, clearLedger = true): Promise<void> {
    try {
      const r = await deps.api.revoke(token, authToken);
      if (r === 'unsupported') log('server has no /retailer/push/revoke route yet');
    } catch (e) {
      log(`revoke failed: ${(e as { message?: string })?.message ?? 'error'}`);
    }
    if (clearLedger) ledger.clear();
  }

  async function revokeForSession(prevAuthToken: string, deleteLocalToken: boolean): Promise<void> {
    let token = ledger.current()?.token ?? null;
    const client = deps.getMessaging().client;
    if (!token && client) {
      try {
        token = await withTimeout(client.getToken(), NATIVE_CALL_TIMEOUT_MS, 'FCM getToken');
      } catch {
        token = null;
      }
    }
    if (token) await revokeKnown(prevAuthToken, token);
    else ledger.clear();
    // If the revoke could not reach the server (expired session, offline), killing the local FCM
    // token still guarantees this phone stops receiving the old account's pushes: the server prunes
    // it on its next failed send.
    if (deleteLocalToken && client) {
      try {
        await withTimeout(client.deleteToken(), NATIVE_CALL_TIMEOUT_MS, 'FCM deleteToken');
      } catch {
        // best effort
      }
    }
  }

  function onAuthChange(next: string | null, prev: string | null): void {
    if (next === prev) return;
    if (!prev && next) {
      void enqueue(() => register());
    } else if (prev && !next) {
      void enqueue(() => revokeForSession(prev, true));
    } else if (prev && next) {
      // Different session on the same device: drop the old account's mapping FIRST, then register the
      // new one (the other order could revoke the row we just registered when both are the same user).
      void enqueue(async () => {
        await revokeForSession(prev, false);
        return register({ force: true });
      });
    }
  }

  async function handleForegroundMessage(message: RemoteMessageLike): Promise<void> {
    try {
      const push = parsePush(message);
      deps.onForegroundPush?.(push);
      if (!push.title && !push.body) return; // silent data push
      // The 15 s poll may already have rung for this order.
      if (push.isNewOrder && push.orderId && !deps.alerts.claim(push.orderId)) return;
      await showLocal({
        id: push.isNewOrder && push.orderId ? `order-new-${push.orderId}` : `push-${push.messageId ?? now()}`,
        title: push.title || 'Trendzo Retailer',
        body: push.body,
        channelId: push.channelId,
        data: navDataOf(push),
      });
    } catch (e) {
      log(`foreground message failed: ${(e as Error)?.message ?? 'error'}`);
    }
  }

  async function showLocal(n: LocalNotification): Promise<boolean> {
    const notifee = deps.getNotifee();
    if (!notifee) return false;
    try {
      await notifee.ensureChannels();
      await notifee.display(n);
      return true;
    } catch (e) {
      log(`display failed: ${(e as Error)?.message ?? 'error'}`);
      return false;
    }
  }

  const openFromMessage = (m: RemoteMessageLike | null | undefined) => {
    if (m) deps.openLink(navDataFrom(m.data));
  };

  return {
    init() {
      if (initialized) return;
      initialized = true;
      try {
        const notifee = deps.getNotifee();
        if (notifee) {
          notifee.ensureChannels().catch((e) => log(`channels failed: ${(e as Error)?.message ?? 'error'}`));
          unsubs.push(notifee.onForegroundPress((nav) => deps.openLink(nav)));
          notifee
            .getInitialPress()
            .then((nav) => nav && deps.openLink(nav))
            .catch(() => undefined);
        }
        const client = messaging();
        if (client) {
          unsubs.push(client.onMessage(handleForegroundMessage));
          unsubs.push(client.onNotificationOpenedApp(openFromMessage));
          client
            .getInitialNotification()
            .then(openFromMessage)
            .catch(() => undefined);
          unsubs.push(
            client.onTokenRefresh((fresh) => {
              void enqueue(async () => {
                const before = ledger.current();
                const out = await register({ prompt: false });
                // The previous token is dead after a refresh; tidy the server row (best effort).
                if (out.status === 'registered' && before && before.token !== fresh) {
                  await revokeKnown(before.authKey, before.token, false);
                }
              });
            }),
          );
        }
        unsubs.push(deps.auth.subscribe(onAuthChange));
        unsubs.push(deps.onForeground(() => void enqueue(() => register({ prompt: false }))));
        if (deps.auth.getToken()) void enqueue(() => register());
      } catch (e) {
        log(`init failed: ${(e as Error)?.message ?? 'error'}`);
      }
    },

    ensureRegistered: (opts) => enqueue(() => register(opts)),

    async getPermission() {
      try {
        return (await deps.getNotifee()?.getPermission()) ?? 'unavailable';
      } catch {
        return 'unavailable';
      }
    },

    async getPermissionInfo() {
      try {
        const state = (await deps.getNotifee()?.getPermission()) ?? 'unavailable';
        const canPrompt =
          state === 'not_determined' || (state === 'denied' && deps.platform === 'android' && !(await readAsked()));
        return { state, canPrompt };
      } catch {
        return { state: 'unavailable' as PermissionState, canPrompt: false };
      }
    },

    async requestPermission() {
      try {
        const notifee = deps.getNotifee();
        if (!notifee) return 'unavailable';
        await writeAsked();
        const state = await notifee.requestPermission();
        if (state === 'granted') void enqueue(() => register({ force: true, prompt: false }));
        return state;
      } catch {
        return 'denied';
      }
    },

    async openSystemSettings() {
      try {
        await deps.getNotifee()?.openSettings();
      } catch {
        // nothing to do
      }
    },

    unavailableReason: () => deps.getMessaging().reason,

    showLocal,

    dispose() {
      while (unsubs.length) {
        try {
          unsubs.pop()?.();
        } catch {
          // ignore
        }
      }
      initialized = false;
    },
  };
}
