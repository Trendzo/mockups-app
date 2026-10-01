/**
 * Backends the app used to default to. The settings store persists the base URLs
 * (Dev Settings can edit them), so an install that first ran with one of these
 * defaults keeps calling it across upgrades unless it is migrated away.
 */
export const RETIRED_API_HOSTS: readonly string[] = [
  'd208iwmfjcjzy.cloudfront.net', // AWS CloudFront → EC2 (Aug 22–24 builds; now standby)
  'backend-qpmx.onrender.com', // Render (retired)
  'trendzo-backend-86wn.onrender.com', // Render (retired)
];

// Regex, not `new URL()`: React Native's URL polyfill doesn't implement `host`.
const HOST_RE = /^https?:\/\/([^/:?#\s]+)/i;

export function isRetiredBaseUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const host = HOST_RE.exec(url.trim())?.[1]?.toLowerCase();
  return host !== undefined && RETIRED_API_HOSTS.includes(host);
}

type PersistedUrls = { baseUrl?: unknown; authBaseUrl?: unknown };

/**
 * Swap any retired base URL in persisted settings for the current default.
 * Custom URLs (a local dev backend, a staging host) are kept as they are.
 */
export function replaceRetiredBaseUrls<T extends PersistedUrls>(
  persisted: T,
  defaults: { baseUrl: string; authBaseUrl: string },
): T {
  return {
    ...persisted,
    ...(isRetiredBaseUrl(persisted.baseUrl) && { baseUrl: defaults.baseUrl }),
    ...(isRetiredBaseUrl(persisted.authBaseUrl) && { authBaseUrl: defaults.authBaseUrl }),
  };
}
