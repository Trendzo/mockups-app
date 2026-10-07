import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptReturn, declineReturn, getOrder, listOrders, orderAction } from './orders';
import { pollUnlessForbidden, retryUnlessClientError } from './request';
import { ACTIVE_STATUSES, DONE_STATUSES } from '../types/orders';

/**
 * Live board: every order still in motion. Polled so a new order (which must
 * be accepted within minutes) shows up without a manual refresh. Shared by the
 * Home dashboard and the Orders tab (one poll serves both).
 */
export function useActiveOrders(enabled = true) {
  return useQuery({
    queryKey: ['orders', 'active'],
    queryFn: () => listOrders(ACTIVE_STATUSES, 200),
    enabled,
    retry: retryUnlessClientError,
    staleTime: 5_000,
    refetchInterval: pollUnlessForbidden(15_000),
  });
}

/** Finished orders (delivered, completed, cancelled). */
export function useDoneOrders(enabled = true) {
  return useQuery({
    queryKey: ['orders', 'done'],
    queryFn: () => listOrders(DONE_STATUSES, 100),
    enabled,
    retry: retryUnlessClientError,
    staleTime: 30_000,
    refetchInterval: pollUnlessForbidden(60_000),
  });
}

/** Latest orders of every status — the dashboard's sales maths. */
export function useRecentOrders(enabled = true) {
  return useQuery({
    queryKey: ['orders', 'recent'],
    queryFn: () => listOrders(undefined, 200),
    enabled,
    retry: retryUnlessClientError,
    staleTime: 30_000,
    refetchInterval: pollUnlessForbidden(60_000),
  });
}

export function useOrder(id?: string) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(id as string),
    enabled: !!id,
    retry: retryUnlessClientError,
    staleTime: 3_000,
    refetchInterval: pollUnlessForbidden(10_000),
  });
}

function useInvalidateOrder() {
  const qc = useQueryClient();
  return (id: string) => {
    void qc.invalidateQueries({ queryKey: ['orders'] });
    void qc.invalidateQueries({ queryKey: ['order', id] });
    void qc.invalidateQueries({ queryKey: ['inventory'] });
  };
}

export function useOrderAction() {
  const invalidate = useInvalidateOrder();
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: string; body?: object }) =>
      orderAction(id, action, body),
    onSettled: (_d, _e, v) => invalidate(v.id),
  });
}

/** Accept or decline every pending return on an order. */
export function useReturnsDecision() {
  const invalidate = useInvalidateOrder();
  return useMutation({
    mutationFn: async ({
      returnIds,
      decision,
      reasonNote,
      photos,
    }: {
      orderId: string;
      returnIds: string[];
      decision: 'accept' | 'decline';
      reasonNote?: string;
      photos?: string[];
    }) => {
      if (!returnIds.length) throw new Error('No pending return on this order');
      for (const rid of returnIds) {
        if (decision === 'accept') await acceptReturn(rid);
        else await declineReturn(rid, reasonNote ?? '', photos ?? []);
      }
    },
    onSettled: (_d, _e, v) => invalidate(v.orderId),
  });
}
