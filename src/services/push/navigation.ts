/**
 * Routing for notification taps (killed / background / foreground).
 *
 * A tap resolves to a route via `routeForDeepLink` (utils/orders.ts) and is applied through a root
 * navigation ref. On a cold start the tap is known before the navigator exists (the app is still
 * hydrating, loading /retailer/me, maybe behind a legal gate), so the target is parked and a small
 * pump delivers it as soon as the navigator is ready AND actually has that route registered (the
 * logged-out stack has no OrderDetail, so a tap never navigates into the void). A parked target
 * expires after a few minutes so a stale tap can't hijack the app later.
 */
import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import type { RouteTarget } from '../../utils/orders';
import { targetForPush } from './payload';
import type { PushNavData } from './types';

/** The slice of the navigation container ref the router needs (a real `createNavigationContainerRef` satisfies it). */
export interface NavRefLike {
  isReady(): boolean;
  getRootState(): { routeNames?: string[] } | undefined;
  navigate(name: string, params?: object): void;
}

export const PENDING_TTL_MS = 3 * 60_000;
export const DUPLICATE_TAP_WINDOW_MS = 8_000;
const PUMP_MS = 500;

export interface PushLinkRouter {
  /** Route a tapped notification. Navigates now if possible, otherwise parks it until the navigator is ready. */
  open(nav: PushNavData | null | undefined): void;
  /** Try to deliver a parked target (call from NavigationContainer onReady / state changes). */
  flush(): boolean;
  hasPending(): boolean;
  /** Test hook. */
  reset(): void;
}

export function createPushLinkRouter(
  ref: NavRefLike,
  now: () => number = Date.now,
  schedule: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
  } = {
    set: (fn, ms) => setInterval(fn, ms),
    clear: (h) => clearInterval(h as ReturnType<typeof setInterval>),
  },
): PushLinkRouter {
  let pending: { target: RouteTarget; key: string; at: number } | null = null;
  let last: { key: string; at: number } | null = null;
  let pump: unknown = null;

  const stopPump = () => {
    if (pump !== null) {
      schedule.clear(pump);
      pump = null;
    }
  };

  const canNavigate = (name: string): boolean => {
    try {
      if (!ref.isReady()) return false;
      const names = ref.getRootState()?.routeNames;
      return !!names && names.includes(name);
    } catch {
      return false;
    }
  };

  function flush(): boolean {
    if (!pending) {
      stopPump();
      return true;
    }
    if (now() - pending.at > PENDING_TTL_MS) {
      pending = null;
      stopPump();
      return true;
    }
    if (!canNavigate(pending.target.name)) return false;
    const { target, key } = pending;
    pending = null;
    stopPump();
    last = { key, at: now() };
    try {
      ref.navigate(target.name, target.params);
    } catch {
      // A bad route must never crash the app from a notification tap.
    }
    return true;
  }

  return {
    open(nav) {
      const target = targetForPush(nav);
      const key = `${target.name}:${JSON.stringify(target.params ?? {})}`;
      // The same tap can surface twice (FCM "opened app" + Notifee press); deliver it once.
      if (last && last.key === key && now() - last.at < DUPLICATE_TAP_WINDOW_MS) return;
      pending = { target, key, at: now() };
      if (!flush() && pump === null) pump = schedule.set(flush, PUMP_MS);
    },
    flush,
    hasPending: () => pending !== null,
    reset() {
      pending = null;
      last = null;
      stopPump();
    },
  };
}

/** Root navigation ref: pass to <NavigationContainer ref={navigationRef} onReady={flushPendingPushLink}>. */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const router = createPushLinkRouter({
  isReady: () => navigationRef.isReady(),
  getRootState: () => navigationRef.getRootState() as { routeNames?: string[] } | undefined,
  navigate: (name, params) => (navigationRef.navigate as (n: string, p?: object) => void)(name, params),
});

/** Route a tapped notification (FCM data bag or a Notifee notification's data). */
export const openFromPush = (nav: PushNavData | null | undefined): void => router.open(nav);

/** Deliver a parked notification tap once the navigator is ready. */
export const flushPendingPushLink = (): boolean => router.flush();
