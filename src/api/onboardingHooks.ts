import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getKyc, getRetailerMe, listChangeRequests } from './onboarding';
import { setOrderAcceptance } from './storeOps';

/** GET /retailer/me - drives the post-login app gate. */
export function useRetailerMe(enabled = true) {
  return useQuery({
    queryKey: ['retailer-me'],
    queryFn: getRetailerMe,
    enabled,
    // Ride out flaky networks so a transient failure doesn't misroute an active
    // retailer to the pending gate - but never retry an auth failure: the token
    // is already invalid, the interceptor has logged out, and retrying just fires
    // more doomed 401s. (getRetailerMe throws a normalized AuthError with .status.)
    retry: (failureCount, error) => {
      const status = (error as { status?: number })?.status;
      if (status === 401 || status === 403) return false;
      return failureCount < 2;
    },
    staleTime: 10_000,
    // Poll so admin-side changes (status, store/profile edits) appear live.
    refetchInterval: 20_000,
  });
}

/** GET /retailer/kyc - banner + checklist. null when no cycle is due. */
export function useKyc(enabled = true) {
  return useQuery({
    queryKey: ['kyc'],
    queryFn: getKyc,
    enabled,
    retry: 0,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useChangeRequests(enabled = true) {
  return useQuery({
    queryKey: ['change-requests'],
    queryFn: listChangeRequests,
    enabled,
    retry: 0,
    staleTime: 10_000,
    // Admin approves/rejects change requests - poll so the decision shows live.
    refetchInterval: 20_000,
  });
}

/**
 * Flip the store online/offline (accepting orders). Refreshes /retailer/me on
 * success so the homepage toggle + gates reflect the new state immediately.
 */
export function useSetOrderAcceptance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accepting: boolean) => setOrderAcceptance(accepting),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['retailer-me'] });
    },
  });
}
