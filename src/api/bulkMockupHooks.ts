import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bulkJobSummary,
  cancelBulkJob,
  dismissBulkJob,
  enqueueBulkMockup,
  listBulkJobs,
} from './bulkMockups';
import { CreateSubmissionInput } from '../types/api';
import { BulkJobStatus } from '../types/bulkMockup';

/** Badge count (queued + processing). Polled so it reflects the worker draining. */
export function useBulkJobSummary(enabled = true) {
  return useQuery({
    queryKey: ['bulk-jobs', 'summary'],
    queryFn: bulkJobSummary,
    enabled,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

/** Job list (optionally by status). Polled so queued→processing→ready shows live. */
export function useBulkJobs(status?: BulkJobStatus, enabled = true) {
  return useQuery({
    queryKey: ['bulk-jobs', 'list', status ?? 'all'],
    queryFn: () => listBulkJobs(status),
    enabled,
    staleTime: 5_000,
    refetchInterval: 8_000,
  });
}

function useInvalidateBulk() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['bulk-jobs'] });
}

export function useEnqueueBulkMockup() {
  const invalidate = useInvalidateBulk();
  return useMutation({
    mutationFn: (input: CreateSubmissionInput) => enqueueBulkMockup(input),
    onSuccess: invalidate,
  });
}

export function useCancelBulkJob() {
  const invalidate = useInvalidateBulk();
  return useMutation({ mutationFn: (id: string) => cancelBulkJob(id), onSuccess: invalidate });
}

export function useDismissBulkJob() {
  const invalidate = useInvalidateBulk();
  return useMutation({ mutationFn: (id: string) => dismissBulkJob(id), onSuccess: invalidate });
}
