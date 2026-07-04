import Config from 'react-native-config';

/** Main API base URL (closetx backend on Render). Editable live in Dev Settings. */
export const DEFAULT_API_BASE_URL = 'https://backend-qpmx.onrender.com/api/v1';

export const platformDefaultBaseUrl = (): string => DEFAULT_API_BASE_URL;

export const envMockDefault = (): boolean =>
  String(Config.MOCK).toLowerCase() === 'true';

/**
 * Retailer auth base URL (closetx backend). Deployed on Render.
 * Override via AUTH_BASE_URL in .env, or edit it live in Dev Settings.
 */
export const DEFAULT_AUTH_BASE_URL = 'https://backend-qpmx.onrender.com/api/v1';

export const platformDefaultAuthBaseUrl = (): string => DEFAULT_AUTH_BASE_URL;

export const APP_NAME = 'Trenzo Mockup';
