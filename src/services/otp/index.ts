import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initMsg91,
  MSG91_OTP_LENGTH,
  MSG91_RESEND_SECONDS,
  msg91Resend,
  msg91Send,
  msg91Verify,
} from './msg91';
import { OtpError, slideIdentifier, slideRetry, slideSend, slideVerify, type SlideConfig } from './slide';

export { OtpError } from './slide';

/**
 * Provider-neutral phone-OTP client. The backend decides the provider (OTP_PROVIDER) and
 * publishes it at GET /auth/otp-config; this hook follows it, so flipping the provider needs
 * no app release. Both providers end the same way: an `accessToken` the backend re-verifies,
 * posted together with the provider tag to `/auth/<role>/otp/login`.
 */
export type OtpProvider = 'msg91' | 'slide';
export type OtpConfig = {
  provider: string;
  accepts?: string[];
  otpLength: number;
  resendSeconds: number;
  slide?: SlideConfig;
};

const CACHE_KEY = 'trendzo.otp-config.v1';
const CONFIG_TIMEOUT_MS = 4000;
const MSG91_DEFAULT: OtpConfig = {
  provider: 'msg91',
  otpLength: MSG91_OTP_LENGTH,
  resendSeconds: MSG91_RESEND_SECONDS,
};

/** Only a fully specified Slide config is usable; anything else falls back to MSG91. */
export function resolveProvider(cfg: OtpConfig): OtpProvider {
  const s = cfg.slide;
  return cfg.provider === 'slide' && s?.baseUrl && s.widgetId && s.tokenAuth ? 'slide' : 'msg91';
}

async function readCache(): Promise<OtpConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as OtpConfig) : null;
  } catch {
    return null;
  }
}

/** Fresh config, else the last known one, else MSG91's: a config outage must never block login. */
export async function loadOtpConfig(fetchConfig: () => Promise<OtpConfig>): Promise<OtpConfig> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const cfg = await Promise.race([
      fetchConfig(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), CONFIG_TIMEOUT_MS);
      }),
    ]);
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cfg)).catch(() => {});
    return cfg;
  } catch {
    return (await readCache()) ?? MSG91_DEFAULT;
  } finally {
    clearTimeout(timer);
  }
}

export type OtpSession = {
  provider: OtpProvider;
  otpLength: number;
  resendSeconds: number;
  send: (dial: string, national: string) => Promise<void>;
  resend: () => Promise<void>;
  /** Verify the code; returns the token + provider tag to post to the backend login. */
  verify: (code: string) => Promise<{ accessToken: string; provider: OtpProvider }>;
};

/**
 * `fetchConfig` is the app's own call to GET /auth/otp-config (each app has its own HTTP
 * client / base URL). The provider is fixed per send: verify and resend use the provider the
 * code was sent with, even if the config changes mid-flow.
 */
export function useOtp(fetchConfig: () => Promise<OtpConfig>): OtpSession {
  const [cfg, setCfg] = useState<OtpConfig>(MSG91_DEFAULT);
  const cfgPromise = useRef<Promise<OtpConfig> | null>(null);
  const active = useRef<{ provider: OtpProvider; slide?: SlideConfig; ref: string | null } | null>(null);

  const getConfig = useCallback(() => {
    if (!cfgPromise.current) {
      cfgPromise.current = loadOtpConfig(fetchConfig).then((c) => {
        setCfg(c);
        return c;
      });
    }
    return cfgPromise.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve the config as soon as the screen opens, so the code length is right by the time
  // the code-entry step shows.
  useEffect(() => {
    void getConfig();
  }, [getConfig]);

  const send = useCallback(
    async (dial: string, national: string) => {
      // Awaited so a send never races a stale provider (at most the 4 s config timeout).
      const c = await getConfig();
      const provider = resolveProvider(c);
      if (provider === 'slide') {
        const slide = c.slide as SlideConfig;
        active.current = { provider, slide, ref: await slideSend(slide, slideIdentifier(dial, national)) };
      } else {
        initMsg91();
        active.current = { provider, ref: await msg91Send(dial.replace(/\D/g, ''), national.replace(/\D/g, '')) };
      }
    },
    [getConfig],
  );

  const resend = useCallback(async () => {
    const a = active.current;
    if (!a?.ref) throw new OtpError('Send the OTP first.');
    if (a.provider === 'slide') a.ref = await slideRetry(a.slide as SlideConfig, a.ref);
    else await msg91Resend(a.ref);
  }, []);

  const verify = useCallback(async (code: string) => {
    const a = active.current;
    if (!a?.ref) throw new OtpError('Send the OTP first.');
    const accessToken =
      a.provider === 'slide'
        ? await slideVerify(a.slide as SlideConfig, a.ref, code)
        : await msg91Verify(a.ref, code);
    return { accessToken, provider: a.provider };
  }, []);

  return {
    provider: resolveProvider(cfg),
    otpLength: cfg.otpLength,
    resendSeconds: cfg.resendSeconds,
    send,
    resend,
    verify,
  };
}
