import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getKyc, getRetailerMe, listChangeRequests } from './onboarding';
import { setOrderAcceptance } from './storeOps';
import { RetailerMe } from '../types/onboarding';

/** Stands in for `orderPauseUntil` while a go-offline request is in flight — we
 *  know the store is paused but not yet the server's auto-reopen instant, so
 *  callers must not format this as a date. */
export const PENDING_PAUSE = 'pending';

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
 * Flip the store online/offline (accepting orders). Updates the cached
 * /retailer/me optimistically so the toggle holds its new position instead of
 * snapping back while the request is in flight, then reconciles with the
 * server's real pause window.
 */
export function useSetOrderAcceptance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accepting: boolean) => setOrderAcceptance(accepting),
    onMutate: async (accepting) => {
      // Stop the 20s /retailer/me poll from landing mid-flight and clobbering
      // the optimistic value with the pre-toggle one.
      await qc.cancelQueries({ queryKey: ['retailer-me'] });
      const previous = qc.getQueryData<RetailerMe>(['retailer-me']);
      if (previous?.store) {
        qc.setQueryData<RetailerMe>(['retailer-me'], {
          ...previous,
          store: {
            ...previous.store,
            orderPauseUntil: accepting
              ? null
              : (previous.store.orderPauseUntil ?? PENDING_PAUSE),
          },
        });
      }
      return { previous };
    },
    onError: (_err, _accepting, ctx) => {
      if (ctx?.previous) qc.setQueryData(['retailer-me'], ctx.previous);
    },
    onSuccess: (data) => {
      qc.setQueryData<RetailerMe>(['retailer-me'], (cur) =>
        cur?.store
          ? { ...cur, store: { ...cur.store, orderPauseUntil: data.orderPauseUntil } }
          : cur,
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['retailer-me'] });
    },
  });
}
