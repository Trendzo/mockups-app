/**
 * Notification-tap routing: navigate now when the navigator has the route, otherwise park the tap
 * (cold start: still hydrating / logged out) and deliver it when it can; de-dup and expiry.
 */
jest.mock('@react-navigation/native', () => ({
  createNavigationContainerRef: () => ({
    isReady: () => false,
    getRootState: () => undefined,
    navigate: () => undefined,
  }),
}));

import {
  createPushLinkRouter,
  DUPLICATE_TAP_WINDOW_MS,
  NavRefLike,
  PENDING_TTL_MS,
} from '../src/services/push/navigation';

function fakeRef(initial: { ready?: boolean; routes?: string[] } = {}) {
  const state = { ready: initial.ready ?? true, routes: initial.routes ?? ['Main', 'OrderDetail', 'Notifications'] };
  const navigate = jest.fn();
  const ref: NavRefLike = {
    isReady: () => state.ready,
    getRootState: () => (state.ready ? { routeNames: state.routes } : undefined),
    navigate,
  };
  return { ref, state, navigate };
}

function setup(initial?: Parameters<typeof fakeRef>[0]) {
  let t = 1_000_000;
  const handles = new Map<number, () => void>();
  let next = 1;
  const f = fakeRef(initial);
  const router = createPushLinkRouter(f.ref, () => t, {
    set: (fn) => {
      handles.set(next, fn);
      return next++;
    },
    clear: (h) => void handles.delete(h as number),
  });
  return {
    ...f,
    router,
    advance: (ms: number) => void (t += ms),
    tick: () => [...handles.values()].forEach((fn) => fn()),
    pumpRunning: () => handles.size > 0,
  };
}

describe('push link router', () => {
  it('navigates immediately when the navigator is ready and has the route', () => {
    const s = setup();
    s.router.open({ kind: 'order', orderId: 'ord_1' });
    expect(s.navigate).toHaveBeenCalledWith('OrderDetail', { id: 'ord_1' });
    expect(s.router.hasPending()).toBe(false);
    expect(s.pumpRunning()).toBe(false);
  });

  it('nested tab targets keep their params', () => {
    const s = setup();
    s.router.open({ deepLink: '/retailer/orders' });
    expect(s.navigate).toHaveBeenCalledWith('Main', { screen: 'Orders' });
  });

  it('cold start: parks the tap until the navigator is ready, then delivers it once', () => {
    const s = setup({ ready: false });
    s.router.open({ deepLink: '/retailer/orders/ord_9' });
    expect(s.navigate).not.toHaveBeenCalled();
    expect(s.router.hasPending()).toBe(true);
    expect(s.pumpRunning()).toBe(true);

    s.tick(); // still hydrating
    expect(s.navigate).not.toHaveBeenCalled();

    s.state.ready = true;
    s.tick();
    expect(s.navigate).toHaveBeenCalledTimes(1);
    expect(s.navigate).toHaveBeenCalledWith('OrderDetail', { id: 'ord_9' });
    expect(s.pumpRunning()).toBe(false);
    s.tick();
    expect(s.navigate).toHaveBeenCalledTimes(1);
  });

  it('does not navigate into the void: the logged-out stack has no OrderDetail, so the tap waits for login', () => {
    const s = setup({ routes: ['Login', 'ApplicationForm'] });
    s.router.open({ orderId: 'ord_3' });
    expect(s.navigate).not.toHaveBeenCalled();
    expect(s.router.hasPending()).toBe(true);
    // user logs in -> the active stack registers the screens
    s.state.routes = ['Main', 'OrderDetail', 'Notifications'];
    expect(s.router.flush()).toBe(true);
    expect(s.navigate).toHaveBeenCalledWith('OrderDetail', { id: 'ord_3' });
  });

  it('a parked tap expires so a stale notification cannot hijack the app later', () => {
    const s = setup({ ready: false });
    s.router.open({ orderId: 'ord_old' });
    s.advance(PENDING_TTL_MS + 1);
    s.state.ready = true;
    s.tick();
    expect(s.navigate).not.toHaveBeenCalled();
    expect(s.router.hasPending()).toBe(false);
    expect(s.pumpRunning()).toBe(false);
  });

  it('the same tap delivered twice (FCM opened + Notifee press) navigates once', () => {
    const s = setup();
    s.router.open({ orderId: 'ord_1' });
    s.advance(500);
    s.router.open({ orderId: 'ord_1' });
    expect(s.navigate).toHaveBeenCalledTimes(1);
    // a genuinely later tap on the same order goes through
    s.advance(DUPLICATE_TAP_WINDOW_MS);
    s.router.open({ orderId: 'ord_1' });
    expect(s.navigate).toHaveBeenCalledTimes(2);
    // a different order is never swallowed
    s.router.open({ orderId: 'ord_2' });
    expect(s.navigate).toHaveBeenCalledTimes(3);
  });

  it('unknown links open the inbox; a navigate error never escapes', () => {
    const s = setup();
    s.router.open({ deepLink: '/retailer/promotions/x' });
    expect(s.navigate).toHaveBeenCalledWith('Notifications', undefined);
    s.navigate.mockImplementation(() => {
      throw new Error('bad route');
    });
    expect(() => s.router.open({ orderId: 'ord_boom' })).not.toThrow();
  });

  it('a newer parked tap replaces an older one', () => {
    const s = setup({ ready: false });
    s.router.open({ orderId: 'first' });
    s.router.open({ orderId: 'second' });
    s.state.ready = true;
    s.tick();
    expect(s.navigate).toHaveBeenCalledTimes(1);
    expect(s.navigate).toHaveBeenCalledWith('OrderDetail', { id: 'second' });
  });
});
