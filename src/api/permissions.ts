import { useQuery } from '@tanstack/react-query';
import { http, req, retryUnlessClientError } from './request';
import { useAuth } from '../store/auth';

/**
 * What this login may do. The sub-role (owner / manager / staff) only sets the defaults;
 * the backend can override any key per role, so the map from GET /retailer/me/permissions
 * is the source of truth. The server enforces every key regardless - this only decides
 * which controls the app shows.
 */
export interface RetailerPermissions {
  scope: 'retailer';
  subRole: string;
  permissions: Record<string, boolean>;
}

export function getMyPermissions(): Promise<RetailerPermissions> {
  return req<RetailerPermissions>(() => http.get('/retailer/me/permissions'));
}

export const PERMISSIONS_QUERY_KEY = ['retailer-permissions'] as const;

/** Cached for 5 minutes (web portal parity); a role change takes effect after re-login. */
export function useMyPermissions() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: PERMISSIONS_QUERY_KEY,
    queryFn: getMyPermissions,
    enabled: !!token,
    staleTime: 5 * 60_000,
    retry: retryUnlessClientError,
  });
}
