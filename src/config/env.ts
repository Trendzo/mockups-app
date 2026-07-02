import { Platform } from 'react-native';
import Config from 'react-native-config';

/**
 * Base-URL resolution (MASTER PROMPT §4.1). The effective value used by the API
 * client is the runtime override from the settings store when present, otherwise
 * this default. Local-dev host mapping is the classic footgun:
 *   - iOS simulator  -> localhost
 *   - Android emu    -> 10.0.2.2 (localhost inside the emulator = the emulator)
 *   - Physical device-> the dev machine's LAN IP (set via Dev Settings / .env),
 *                       and the backend PUBLIC_BASE_URL must match that IP.
 */
const PORT = Config.API_PORT || '5055';

export const platformDefaultBaseUrl = (): string => {
  // An explicit .env value always wins over the platform guess.
  if (Config.API_BASE_URL && Config.API_BASE_URL.trim().length > 0) {
    return Config.API_BASE_URL.trim().replace(/\/$/, '');
  }
  const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  return `http://${host}:${PORT}`;
};

export const envMockDefault = (): boolean =>
  String(Config.MOCK).toLowerCase() === 'true';

export const APP_NAME = 'Trenzo Mockup';
