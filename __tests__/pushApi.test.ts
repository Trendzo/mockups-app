/**
 * POST /retailer/push and /retailer/push/revoke: request shape (same bodies the driver app sends),
 * explicit bearer token, 404 -> 'unsupported', other failures normalised and thrown.
 */
const mockPost = jest.fn();
jest.mock('axios', () => {
  const actual = jest.requireActual('axios');
  return {
    ...actual,
    __esModule: true,
    default: { ...actual, create: () => ({ post: (...a: unknown[]) => mockPost(...a) }) },
  };
});
jest.mock('../src/store/settings', () => ({
  useSettings: { getState: () => ({ baseUrl: 'https://api.test/api/v1' }) },
}));
jest.mock('../src/api/auth', () => ({
  normalizeAuthError: (e: { response?: { status?: number }; message?: string }) => ({
    code: 'error',
    message: e?.message ?? 'err',
    status: e?.response?.status,
  }),
}));

import { registerPushToken, revokePushToken } from '../src/api/push';

beforeEach(() => mockPost.mockReset());

describe('registerPushToken', () => {
  it('posts { token, platform, appVersion } to /retailer/push with the explicit session token', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: { id: 'dtk_1' } } });
    await expect(
      registerPushToken({ token: 'fcm-1', platform: 'android', appVersion: '1.7.5' }, 'jwt-A'),
    ).resolves.toBe('ok');
    expect(mockPost).toHaveBeenCalledWith(
      '/retailer/push',
      { token: 'fcm-1', platform: 'android', appVersion: '1.7.5' },
      {
        baseURL: 'https://api.test/api/v1',
        headers: { Authorization: 'Bearer jwt-A', 'Content-Type': 'application/json' },
      },
    );
  });

  it('leaves appVersion out of the body when unknown (the server field is optional)', async () => {
    mockPost.mockResolvedValue({ data: {} });
    await registerPushToken({ token: 't', platform: 'ios' }, 'jwt');
    expect(mockPost.mock.calls[0][1]).toEqual({ token: 't', platform: 'ios' });
  });

  it('swallows a 404 (server without the route yet) as "unsupported"', async () => {
    mockPost.mockRejectedValue({ response: { status: 404 }, message: 'Not found' });
    await expect(registerPushToken({ token: 't', platform: 'android' }, 'jwt')).resolves.toBe('unsupported');
  });

  it('throws other failures (normalised) so the manager can log and retry later', async () => {
    mockPost.mockRejectedValue({ response: { status: 500 }, message: 'boom' });
    await expect(registerPushToken({ token: 't', platform: 'android' }, 'jwt')).rejects.toMatchObject({
      status: 500,
      message: 'boom',
    });
  });
});

describe('revokePushToken', () => {
  it('posts { token } to /retailer/push/revoke using the session token it is revoking for', async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: { revoked: true } } });
    await expect(revokePushToken('fcm-1', 'jwt-OLD')).resolves.toBe('ok');
    expect(mockPost).toHaveBeenCalledWith(
      '/retailer/push/revoke',
      { token: 'fcm-1' },
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer jwt-OLD' }) }),
    );
  });

  it('404 is "unsupported"; a 401 (expired session) rejects without anything global happening', async () => {
    mockPost.mockRejectedValueOnce({ response: { status: 404 } });
    await expect(revokePushToken('t', 'jwt')).resolves.toBe('unsupported');
    mockPost.mockRejectedValueOnce({ response: { status: 401 }, message: 'expired' });
    await expect(revokePushToken('t', 'jwt')).rejects.toMatchObject({ status: 401 });
  });
});
