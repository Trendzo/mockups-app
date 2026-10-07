/**
 * The native-facing facades and the background handler, with @react-native-firebase/* and
 * @notifee/react-native mocked: Firebase-not-configured detection, permission mapping, channel
 * creation, background display rules, and handler registration at app start.
 */
const mockApps: { list: unknown[]; throwOnRequire: boolean } = { list: [], throwOnRequire: false };
const mockMessagingCalls: Record<string, jest.Mock> = {};
const mockBackgroundHandlers: Array<(m: unknown) => Promise<unknown>> = [];

jest.mock('@react-native-firebase/app', () => {
  if (mockApps.throwOnRequire) throw new Error('RNFBAppModule not linked');
  return {
    getApps: () => mockApps.list,
    getUtils: () => ({ appVersion: '1.7.5' }),
  };
});
jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: () => ({ id: 'messaging-instance' }),
  getToken: (...a: unknown[]) => mockMessagingCalls.getToken(...a),
  deleteToken: (...a: unknown[]) => mockMessagingCalls.deleteToken(...a),
  onTokenRefresh: (...a: unknown[]) => mockMessagingCalls.onTokenRefresh(...a),
  onMessage: (...a: unknown[]) => mockMessagingCalls.onMessage(...a),
  onNotificationOpenedApp: (...a: unknown[]) => mockMessagingCalls.onNotificationOpenedApp(...a),
  getInitialNotification: (...a: unknown[]) => mockMessagingCalls.getInitialNotification(...a),
  setBackgroundMessageHandler: (_m: unknown, h: (m: unknown) => Promise<unknown>) => {
    mockBackgroundHandlers.push(h);
  },
}));

const mockNotifee = {
  createChannel: jest.fn(async () => 'id'),
  displayNotification: jest.fn(async () => 'id'),
  getNotificationSettings: jest.fn(async () => ({ authorizationStatus: 1 })),
  requestPermission: jest.fn(async () => ({ authorizationStatus: 1 })),
  openNotificationSettings: jest.fn(async () => undefined),
  onForegroundEvent: jest.fn((_cb: unknown) => () => undefined),
  onBackgroundEvent: jest.fn((_cb: unknown) => undefined),
  getInitialNotification: jest.fn(async () => null as unknown),
};
jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: mockNotifee,
  EventType: { DISMISSED: 0, PRESS: 1 },
}));

const mockOpen = jest.fn();
jest.mock('../src/services/push/navigation', () => ({ openFromPush: (n: unknown) => mockOpen(n) }));

import {
  FIREBASE_NOT_CONFIGURED,
  loadMessaging,
  loadNotifee,
  resetPushClientsForTests,
} from '../src/services/push/clients';
import { handleBackgroundMessage, registerPushBackgroundHandlers } from '../src/services/push/background';

beforeEach(() => {
  resetPushClientsForTests();
  mockApps.list = [];
  mockApps.throwOnRequire = false;
  mockBackgroundHandlers.length = 0;
  jest.clearAllMocks();
  for (const k of ['getToken', 'deleteToken', 'onTokenRefresh', 'onMessage', 'onNotificationOpenedApp', 'getInitialNotification']) {
    mockMessagingCalls[k] = jest.fn();
  }
});

describe('loadMessaging', () => {
  it('Firebase not configured (no google-services.json => no native app): no client, with the reason', () => {
    mockApps.list = [];
    expect(loadMessaging()).toEqual({ client: null, reason: FIREBASE_NOT_CONFIGURED });
  });

  it('a native module that is not linked is a no-op with a reason, never a throw', () => {
    mockApps.throwOnRequire = true;
    jest.resetModules();
    const { loadMessaging: fresh } = require('../src/services/push/clients');
    const r = fresh();
    expect(r.client).toBeNull();
    expect(r.reason).toMatch(/unavailable in this build/);
  });

  it('configured: exposes token, listeners and the host app version through the modular API', async () => {
    mockApps.list = [{ name: '[DEFAULT]' }];
    mockMessagingCalls.getToken.mockResolvedValue('fcm-token');
    const { client, reason } = loadMessaging();
    expect(reason).toBeNull();
    await expect(client!.getToken()).resolves.toBe('fcm-token');
    expect(mockMessagingCalls.getToken).toHaveBeenCalledWith({ id: 'messaging-instance' });
    expect(client!.appVersion()).toBe('1.7.5');
    client!.onTokenRefresh(() => undefined);
    expect(mockMessagingCalls.onTokenRefresh).toHaveBeenCalledWith({ id: 'messaging-instance' }, expect.any(Function));
    // cached
    expect(loadMessaging()).toBe(loadMessaging());
  });
});

describe('loadNotifee', () => {
  it('creates the orders (HIGH) and general channels', async () => {
    await loadNotifee()!.ensureChannels();
    expect(mockNotifee.createChannel).toHaveBeenCalledTimes(2);
    expect(mockNotifee.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'orders', importance: 4, sound: 'default', vibration: true }),
    );
    expect(mockNotifee.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'general', importance: 3, sound: 'default' }),
    );
  });

  it('maps Notifee authorization statuses', async () => {
    const n = loadNotifee()!;
    for (const [status, expected] of [
      [-1, 'not_determined'],
      [0, 'denied'],
      [1, 'granted'],
      [2, 'granted'],
    ] as const) {
      mockNotifee.getNotificationSettings.mockResolvedValueOnce({ authorizationStatus: status });
      await expect(n.getPermission()).resolves.toBe(expected);
    }
    mockNotifee.requestPermission.mockResolvedValueOnce({ authorizationStatus: 0 });
    await expect(n.requestPermission()).resolves.toBe('denied');
  });

  it('displays with the monochrome small icon, press action and a same-id-updates-in-place alert policy', async () => {
    await loadNotifee()!.display({
      id: 'order-new-1',
      title: 'New order',
      body: 'b',
      channelId: 'orders',
      data: { orderId: '1' },
    });
    expect(mockNotifee.displayNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'order-new-1',
        data: { orderId: '1' },
        android: expect.objectContaining({
          channelId: 'orders',
          smallIcon: 'ic_stat_notification',
          pressAction: { id: 'default', launchActivity: 'default' },
          onlyAlertOnce: true,
        }),
      }),
    );
  });

  it('only PRESS events become taps; the data bag is read back', () => {
    const n = loadNotifee()!;
    const cb = jest.fn();
    n.onForegroundPress(cb);
    const handler = mockNotifee.onForegroundEvent.mock.calls[0][0] as (e: unknown) => void;
    handler({ type: 0, detail: { notification: { data: { orderId: 'x' } } } }); // dismissed
    expect(cb).not.toHaveBeenCalled();
    handler({ type: 1, detail: { notification: { data: { orderId: 'x', kind: 'order' } } } });
    expect(cb).toHaveBeenCalledWith({ kind: 'order', deepLink: null, orderId: 'x' });
  });

  it('getInitialPress reads the cold-start notification', async () => {
    mockNotifee.getInitialNotification.mockResolvedValueOnce({
      notification: { data: { deepLink: '/retailer/payouts/po_1' } },
    });
    await expect(loadNotifee()!.getInitialPress()).resolves.toEqual({
      kind: undefined,
      deepLink: '/retailer/payouts/po_1',
      orderId: null,
    });
    await expect(loadNotifee()!.getInitialPress()).resolves.toBeNull();
  });
});

describe('background handling (index.js)', () => {
  it('registers the FCM background handler and the Notifee background press at start', () => {
    mockApps.list = [{ name: '[DEFAULT]' }];
    registerPushBackgroundHandlers();
    expect(mockBackgroundHandlers).toHaveLength(1);
    expect(mockNotifee.onBackgroundEvent).toHaveBeenCalledTimes(1);
    // a background tap routes through the shared router
    const press = mockNotifee.onBackgroundEvent.mock.calls[0][0] as (e: unknown) => Promise<void>;
    return press({ type: 1, detail: { notification: { data: { orderId: 'ord_bg' } } } }).then(() => {
      expect(mockOpen).toHaveBeenCalledWith({ kind: undefined, deepLink: null, orderId: 'ord_bg' });
    });
  });

  it('without Firebase it registers only the Notifee tap handler and never throws', () => {
    mockApps.list = [];
    expect(() => registerPushBackgroundHandlers()).not.toThrow();
    expect(mockBackgroundHandlers).toHaveLength(0);
    expect(mockNotifee.onBackgroundEvent).toHaveBeenCalledTimes(1);
  });

  it('data-only push is displayed through Notifee on the right channel', async () => {
    await handleBackgroundMessage({
      messageId: 'm1',
      data: { kind: 'order.new', orderId: 'ord_1', title: 'New order', body: '1 item' },
    });
    expect(mockNotifee.createChannel).toHaveBeenCalled();
    expect(mockNotifee.displayNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'order-new-ord_1',
        title: 'New order',
        android: expect.objectContaining({ channelId: 'orders' }),
      }),
    );
  });

  it('a push with a notification block is left to the OS tray (no double notification); silent pushes show nothing', async () => {
    await handleBackgroundMessage({
      notification: { title: 'New order', body: 'x' },
      data: { kind: 'order', orderId: 'ord_1' },
    });
    await handleBackgroundMessage({ data: { kind: 'system' } });
    expect(mockNotifee.displayNotification).not.toHaveBeenCalled();
  });

  it('the registered FCM handler swallows errors (the headless runner must never see a rejection)', async () => {
    mockApps.list = [{ name: '[DEFAULT]' }];
    registerPushBackgroundHandlers();
    mockNotifee.displayNotification.mockRejectedValueOnce(new Error('boom'));
    await expect(
      mockBackgroundHandlers[0]({ data: { kind: 'payout', title: 't', body: 'b' } }),
    ).resolves.toBeUndefined();
  });
});
