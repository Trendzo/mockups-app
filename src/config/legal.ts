export const PUBLIC_SITE_URL = 'https://backend-qpmx.onrender.com';
export const PRIVACY_URL = `${PUBLIC_SITE_URL}/privacy`;
export const TERMS_URL = `${PUBLIC_SITE_URL}/terms`;
export const SUPPORT_URL = `${PUBLIC_SITE_URL}/support`;
export const ACCOUNT_DELETION_URL = `${PUBLIC_SITE_URL}/account-deletion`;

/**
 * Web portal (retailer dashboard SPA) base URL — where billing terminal, orders,
 * payouts and full ops live. Used for the Profile "Open web portal" link and the
 * earnings deep-link. Single source of truth.
 *
 * Per-environment: dev/staging builds point at the staging host, release builds
 * at prod. `__DEV__` is true in Metro/debug, false in a release bundle.
 *
 * ⚠ Both domains are placeholders — set them to the real deployed Vercel hosts.
 */
export const WEB_PORTAL_URL_PROD = 'https://trendzo-dashboard.vercel.app';
export const WEB_PORTAL_URL_STAGING = 'https://trendzo-dashboard-staging.vercel.app';
export const WEB_PORTAL_URL = __DEV__ ? WEB_PORTAL_URL_STAGING : WEB_PORTAL_URL_PROD;
/** Retailer landing in the web portal (dashboard). */
export const WEB_PORTAL_HOME_URL = `${WEB_PORTAL_URL}/retailer/dashboard`;
/** Full payouts/settlement statement in the web portal. */
export const WEB_PORTAL_PAYOUTS_URL = `${WEB_PORTAL_URL}/retailer/payouts`;
