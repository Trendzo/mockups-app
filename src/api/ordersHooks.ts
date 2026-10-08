import {
  InfiniteData,
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { acceptReturn, declineReturn, getOrder, listOrders, orderAction } from './orders';
import { pollUnlessForbidden, retryUnlessClientError } from './request';
import { dedupeOrders, nextOrderOffset } from '../utils/orders';
import { ACTIVE_STATUSES, DeliveryMethod, DONE_STATUSES, OrderRow, OrderStatus } from '../types/orders';

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

/** Rows per "Load more" step on the Finished tabs (server max is 200). */
export const FINISHED_PAGE_SIZE = 50;

// Module-level so the query keeps the same `select` between renders.
const flattenFinished = (data: InfiniteData<OrderRow[]>) => dedupeOrders(data.pages);

/** Date / delivery-method narrowing for the history tabs (all optional). */
export interface FinishedOrderFilters {
  /** ISO instant lower bound on `placedAt`. */
  from?: string;
  to?: string;
  deliveryMethod?: DeliveryMethod;
}

/**
 * Finished orders (history) with search, filters and "Load more". Each
 * (statuses, search, from, to, deliveryMethod) combination is its own key, so
 * changing any of them restarts at page 1 while the previous rows stay on
 * screen until the new ones land.
 *
 * Paging uses `offset`, search uses `q`, and the date / delivery filters use
 * `from`/`to`/`deliveryMethod` — all newer backend params. An older server
 * drops them silently, so the hook guards itself: a short page ends the list,
 * and a page that adds nothing new (a server that ignores `offset` keeps
 * answering with page 1) ends it too instead of looping on duplicates. The
 * screen also re-applies the same filters client-side, so an old server can
 * never show rows outside the chosen window.
 */
export function useFinishedOrders(
  statuses: OrderStatus[],
  search: string,
  enabled = true,
  filters: FinishedOrderFilters = {},
) {
  const q = search.trim();
  const { from, to, deliveryMethod } = filters;
  return useInfiniteQuery({
    queryKey: ['orders', 'finished', statuses.join(','), q, from ?? '', to ?? '', deliveryMethod ?? ''],
    queryFn: ({ pageParam }) =>
      listOrders(statuses, FINISHED_PAGE_SIZE, {
        offset: pageParam,
        q,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(deliveryMethod ? { deliveryMethod } : {}),
      }),
    initialPageParam: 0,
    getNextPageParam: (_last, all) => nextOrderOffset(all, FINISHED_PAGE_SIZE),
    select: flattenFinished,
    enabled,
    retry: retryUnlessClientError,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
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

/** After any write on an order: the lists, this order, stock, returns and disputes. */
export function useInvalidateOrder() {
  const qc = useQueryClient();
  return (id: string) => {
    void qc.invalidateQueries({ queryKey: ['orders'] });
    void qc.invalidateQueries({ queryKey: ['order', id] });
    void qc.invalidateQueries({ queryKey: ['inventory'] });
    void qc.invalidateQueries({ queryKey: ['returns'] });
    void qc.invalidateQueries({ queryKey: ['issues'] });
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
