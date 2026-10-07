import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createEarlyDisbursement,
  getFees,
  getPayout,
  getPayoutDeductions,
  getUpcomingPayout,
  listEarlyDisbursements,
  listPayouts,
} from './earnings';
import { pollUnlessForbidden, retryUnlessClientError } from './request';
import type { PayoutRow } from '../types/earnings';

/** Unsettled earnings + next payout. Polled lightly so a fresh sale reflects. */
export function useUpcomingPayout(enabled = true) {
  return useQuery({
    queryKey: ['earnings', 'upcoming'],
    queryFn: getUpcomingPayout,
    enabled,
    retry: (n, e) => {
      const s = (e as { status?: number })?.status;
      if (s === 401 || s === 403) return false;
      return n < 2;
    },
    staleTime: 30_000,
    refetchInterval: pollUnlessForbidden(60_000),
  });
}

export function useEarlyDisbursements(enabled = true) {
  return useQuery({
    queryKey: ['earnings', 'early-disbursement'],
    queryFn: listEarlyDisbursements,
    enabled,
    retry: 0,
    staleTime: 30_000,
  });
}

export function useCreateEarlyDisbursement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { amountPaise: number; reason: string }) => createEarlyDisbursement(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['earnings', 'early-disbursement'] });
    },
  });
}

export function usePayouts(enabled = true) {
  return useQuery({
    queryKey: ['earnings', 'payouts'],
    queryFn: listPayouts,
    enabled,
    retry: retryUnlessClientError,
    staleTime: 60_000,
  });
}

export function usePayout(id?: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['earnings', 'payout', id],
    queryFn: () => getPayout(id as string),
    enabled: !!id,
    retry: retryUnlessClientError,
    // Same shape as a history row: show the cached row instantly while the
    // detail loads (opened from Payout history).
    placeholderData: () =>
      qc.getQueryData<PayoutRow[]>(['earnings', 'payouts'])?.find((p) => p.id === id),
  });
}

export function usePayoutDeductions(id?: string) {
  return useQuery({
    queryKey: ['earnings', 'payout', id, 'deductions'],
    queryFn: () => getPayoutDeductions(id as string),
    enabled: !!id,
    retry: retryUnlessClientError,
  });
}

/** Commission / TCS / payout-cadence rates (permission-gated server-side). */
export function useFees(enabled = true) {
  return useQuery({
    queryKey: ['earnings', 'fees'],
    queryFn: getFees,
    enabled,
    retry: 0,
    staleTime: 10 * 60_000,
  });
}
