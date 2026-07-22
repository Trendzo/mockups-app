import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createEarlyDisbursement,
  getUpcomingPayout,
  listEarlyDisbursements,
} from './earnings';

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
    refetchInterval: 60_000,
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
