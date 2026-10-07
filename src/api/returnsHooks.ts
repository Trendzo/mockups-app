import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptReturn, declineReturn } from './orders';
import { getReturn, listReturns, markReturnReceived, payCashRefund } from './returns';
import { pollUnlessForbidden, retryUnlessClientError } from './request';
import type { CashRefundDue, ReturnFilters } from '../types/returns';

/** Returns queue, refreshed every 30s (verification windows are hours long). */
export function useReturns(filters: ReturnFilters = {}, enabled = true) {
  return useQuery({
    queryKey: ['returns', 'list', filters],
    queryFn: () => listReturns(filters),
    enabled,
    retry: retryUnlessClientError,
    staleTime: 10_000,
    refetchInterval: pollUnlessForbidden(30_000),
  });
}

export function useReturn(id?: string) {
  return useQuery({
    queryKey: ['returns', 'detail', id],
    queryFn: () => getReturn(id as string),
    enabled: !!id,
    retry: retryUnlessClientError,
    staleTime: 5_000,
    refetchInterval: pollUnlessForbidden(15_000),
  });
}

/**
 * A decision on a return changes the queue, the return, the order it belongs to
 * and (via the refund) the stock — refresh all of it.
 */
export function useInvalidateReturns() {
  const qc = useQueryClient();
  return (returnId?: string, orderId?: string | null) => {
    void qc.invalidateQueries({ queryKey: ['returns', 'list'] });
    if (returnId) void qc.invalidateQueries({ queryKey: ['returns', 'detail', returnId] });
    void qc.invalidateQueries({ queryKey: ['orders'] });
    if (orderId) void qc.invalidateQueries({ queryKey: ['order', orderId] });
    void qc.invalidateQueries({ queryKey: ['inventory'] });
    void qc.invalidateQueries({ queryKey: ['issues'] });
  };
}

/** Accept (refund the customer) or decline (dispute + hold) ONE return. */
export function useReturnDecision(returnId: string, orderId?: string | null) {
  const invalidate = useInvalidateReturns();
  return useMutation({
    mutationFn: (v: { decision: 'accept' } | { decision: 'decline'; reasonNote: string; photos: string[] }) =>
      v.decision === 'accept' ? acceptReturn(returnId) : declineReturn(returnId, v.reasonNote, v.photos),
    onSettled: () => invalidate(returnId, orderId),
  });
}

/** "The goods are here" on a standard return — starts the verification window. */
export function useMarkReturnReceived(returnId: string, orderId?: string | null) {
  const invalidate = useInvalidateReturns();
  return useMutation({
    mutationFn: () => markReturnReceived(returnId),
    onSettled: () => invalidate(returnId, orderId),
  });
}

/** Cash handed across the counter for a COD refund (exactly once). */
export function usePayCashRefund(returnId: string, orderId?: string | null) {
  const invalidate = useInvalidateReturns();
  return useMutation({
    mutationFn: (v: { due: CashRefundDue; note?: string }) =>
      payCashRefund(v.due.refundId, v.due.disbursementId, v.due.amountPaise, v.note),
    onSettled: () => invalidate(returnId, orderId),
  });
}
