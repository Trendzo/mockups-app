import Config from 'react-native-config';

/** Main API base URL. Editable live in Dev Settings. */
// AWS-hosted backend (CloudFront d208iwmfjcjzy → EC2) — prod default.
// Rollback (old Render): 'https://backend-qpmx.onrender.com/api/v1'
export const DEFAULT_API_BASE_URL = 'https://d208iwmfjcjzy.cloudfront.net/api/v1';
// Local dev backend. On a USB device this reaches the PC via `adb reverse tcp:3099 tcp:3099`.
// export const DEFAULT_API_BASE_URL = 'http://localhost:3099/api/v1';

export const platformDefaultBaseUrl = (): string => DEFAULT_API_BASE_URL;

export const envMockDefault = (): boolean =>
  String(Config.MOCK).toLowerCase() === 'true';

/**
 * Retailer auth base URL. Override via AUTH_BASE_URL in .env, or edit it live in
 * Dev Settings.
 */
// AWS-hosted backend (CloudFront d208iwmfjcjzy → EC2) — prod default.
// Rollback (old Render): 'https://backend-qpmx.onrender.com/api/v1'
export const DEFAULT_AUTH_BASE_URL = 'https://d208iwmfjcjzy.cloudfront.net/api/v1';
// Local dev backend (reached via `adb reverse tcp:3099 tcp:3099` on a USB device).
// export const DEFAULT_AUTH_BASE_URL = 'http://localhost:3099/api/v1';

export const platformDefaultAuthBaseUrl = (): string => DEFAULT_AUTH_BASE_URL;

export const APP_NAME = 'Trendzo Retailer';
