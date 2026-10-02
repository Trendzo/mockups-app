/**
 * Provider-neutral OTP client: Slide's fetch-based flow, MSG91's SDK flow behind the same
 * interface, provider selection from the server config (with cache + MSG91 fallback), and
 * the session rule that verify/resend use the provider the code was SENT with.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => (k in mockStore ? mockStore[k] : null)),
    setItem: jest.fn(async (k: string, v: string) => void (mockStore[k] = v)),
  },
}));

const mockSdk = {
  initializeWidget: jest.fn(),
  sendOTP: jest.fn(),
  retryOTP: jest.fn(),
  verifyOTP: jest.fn(),
};
// Delegates lazily: imports are hoisted above `mockSdk`'s initialisation.
jest.mock('@msg91comm/sendotp-react-native', () => ({
  OTPWidget: {
    initializeWidget: (...a: unknown[]) => mockSdk.initializeWidget(...a),
    sendOTP: (...a: unknown[]) => mockSdk.sendOTP(...a),
    retryOTP: (...a: unknown[]) => mockSdk.retryOTP(...a),
    verifyOTP: (...a: unknown[]) => mockSdk.verifyOTP(...a),
  },
}));

import { loadOtpConfig, resolveProvider, useOtp, type OtpConfig, type OtpSession } from '../src/services/otp';
import { slideIdentifier } from '../src/services/otp/slide';

const SLIDE = { baseUrl: 'https://s.test/api', widgetId: 'wgt-1', tokenAuth: 'tok-1' };
const slideCfg: OtpConfig = { provider: 'slide', otpLength: 6, resendSeconds: 45, slide: SLIDE };
const msg91Cfg: OtpConfig = { provider: 'msg91', otpLength: 4, resendSeconds: 30 };

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
let calls: Array<{ url: string; body: any }>;
let slideReplies: Record<string, () => Response>;

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  jest.clearAllMocks();
  calls = [];
  slideReplies = {
    '/otp/public/send': () => json({ requestId: 'otpreq_1' }),
    '/otp/public/retry': () => json({ requestId: 'otpreq_2' }),
    '/otp/public/verify': () => json({ accessToken: 'jwt.slide.token' }),
  };
  (globalThis as any).fetch = jest.fn(async (url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const path = url.replace(SLIDE.baseUrl, '');
    const reply = slideReplies[path];
    if (!reply) throw new Error(`unexpected ${url}`);
    return reply();
  });
});

describe('slideIdentifier', () => {
  test('is E.164 with +, and never doubles a dial code already typed', () => {
    expect(slideIdentifier('91', '98765 43210')).toBe('+919876543210');
    expect(slideIdentifier('91', '09876543210')).toBe('+919876543210');
    expect(slideIdentifier('91', '919876543210')).toBe('+919876543210');
  });
});

describe('resolveProvider', () => {
  test('slide only when fully specified, else msg91', () => {
    expect(resolveProvider(slideCfg)).toBe('slide');
    expect(resolveProvider({ ...slideCfg, slide: { ...SLIDE, tokenAuth: '' } })).toBe('msg91');
    expect(resolveProvider({ ...slideCfg, slide: undefined })).toBe('msg91');
    expect(resolveProvider({ ...slideCfg, provider: 'fake' })).toBe('msg91');
    expect(resolveProvider(msg91Cfg)).toBe('msg91');
  });
});

describe('loadOtpConfig', () => {
  test('returns and caches the server config', async () => {
    expect(await loadOtpConfig(async () => slideCfg)).toEqual(slideCfg);
    expect(JSON.parse(mockStore['trendzo.otp-config.v1']!)).toEqual(slideCfg);
  });

  test('on failure uses the last known config, else MSG91 - never blocks login', async () => {
    const fail = async () => {
      throw new Error('offline');
    };
    expect((await loadOtpConfig(fail)).provider).toBe('msg91');
    mockStore['trendzo.otp-config.v1'] = JSON.stringify(slideCfg);
    expect(await loadOtpConfig(fail)).toEqual(slideCfg);
  });
});

/** Render the hook and hand back a live reference to its latest value. */
async function mount(fetchConfig: () => Promise<OtpConfig>) {
  const ref: { current: OtpSession | null } = { current: null };
  function Probe() {
    ref.current = useOtp(fetchConfig);
    return null;
  }
  await act(async () => {
    TestRenderer.create(React.createElement(Probe));
  });
  return ref as { current: OtpSession };
}

describe('useOtp with Slide', () => {
  test('send -> resend -> verify use the public endpoints and return the tagged token', async () => {
    const otp = await mount(async () => slideCfg);
    expect(otp.current.provider).toBe('slide');
    expect(otp.current.otpLength).toBe(6);

    await act(async () => otp.current.send('91', '9876543210'));
    expect(calls[0]).toEqual({
      url: 'https://s.test/api/otp/public/send',
      body: { widgetId: 'wgt-1', tokenAuth: 'tok-1', identifier: '+919876543210' },
    });
    await act(async () => otp.current.resend());
    expect(calls[1]!.body).toEqual({ requestId: 'otpreq_1' });

    let out!: { accessToken: string; provider: string };
    await act(async () => {
      out = await otp.current.verify('123456');
    });
    expect(calls[2]!.body).toEqual({ requestId: 'otpreq_2', otp: '123456' }); // the resent request
    expect(out).toEqual({ accessToken: 'jwt.slide.token', provider: 'slide' });
    expect(mockSdk.sendOTP).not.toHaveBeenCalled();
  });

  test('surfaces Slide error messages and refuses to verify before a send', async () => {
    const otp = await mount(async () => slideCfg);
    await expect(otp.current.verify('123456')).rejects.toThrow('Send the OTP first.');
    slideReplies['/otp/public/send'] = () => json({ message: 'Too many requests' }, 429);
    await expect(otp.current.send('91', '9876543210')).rejects.toThrow('Too many requests');
    await act(async () => otp.current.send('91', '9876543210').catch(() => {}));
    slideReplies['/otp/public/send'] = () => json({ requestId: 'otpreq_9' });
    await act(async () => otp.current.send('91', '9876543210'));
    slideReplies['/otp/public/verify'] = () => json({ message: 'Invalid OTP' }, 400);
    await expect(otp.current.verify('000000')).rejects.toThrow('Invalid OTP');
  });
});

describe('useOtp with MSG91 (today\'s SDK flow, unchanged)', () => {
  test('send -> resend -> verify go through the SDK with the same identifier and reqId', async () => {
    mockSdk.sendOTP.mockResolvedValue({ type: 'success', message: 'REQ123' });
    mockSdk.retryOTP.mockResolvedValue({ type: 'success' });
    mockSdk.verifyOTP.mockResolvedValue({ type: 'success', message: 'msg91-access-token' });
    const otp = await mount(async () => msg91Cfg);
    expect(otp.current.provider).toBe('msg91');
    expect(otp.current.otpLength).toBe(4);

    await act(async () => otp.current.send('91', '9876543210'));
    expect(mockSdk.initializeWidget).toHaveBeenCalledWith('3667636f3464353730373939', expect.any(String));
    expect(mockSdk.sendOTP).toHaveBeenCalledWith({ identifier: '919876543210' });
    await act(async () => otp.current.resend());
    expect(mockSdk.retryOTP).toHaveBeenCalledWith({ reqId: 'REQ123' });
    let out!: { accessToken: string; provider: string };
    await act(async () => {
      out = await otp.current.verify('1234');
    });
    expect(mockSdk.verifyOTP).toHaveBeenCalledWith({ reqId: 'REQ123', otp: '1234' });
    expect(out).toEqual({ accessToken: 'msg91-access-token', provider: 'msg91' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('an SDK error result is a failure (bare-string results work too)', async () => {
    const otp = await mount(async () => msg91Cfg);
    mockSdk.sendOTP.mockResolvedValue({ type: 'error', message: 'Invalid mobile' });
    await expect(otp.current.send('91', '123')).rejects.toThrow('Invalid mobile');
    mockSdk.sendOTP.mockResolvedValue('REQ7');
    await act(async () => otp.current.send('91', '9876543210'));
    mockSdk.verifyOTP.mockResolvedValue({ type: 'error', message: 'Wrong OTP' });
    await expect(otp.current.verify('0000')).rejects.toThrow('Wrong OTP');
  });
});

describe('provider is fixed at send time', () => {
  test('a config flip mid-flow does not move an in-flight verify to the other provider', async () => {
    mockSdk.sendOTP.mockResolvedValue({ type: 'success', message: 'REQ1' });
    mockSdk.verifyOTP.mockResolvedValue({ type: 'success', message: 'msg91-token' });
    let current = msg91Cfg;
    const otp = await mount(async () => current);
    await act(async () => otp.current.send('91', '9876543210'));
    current = slideCfg; // server flips; this screen's config was already resolved
    const out = await otp.current.verify('1234');
    expect(out.provider).toBe('msg91');
    expect(mockSdk.verifyOTP).toHaveBeenCalled();
  });
});
