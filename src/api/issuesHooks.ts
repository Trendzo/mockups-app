import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createIssue, getIssue, handBackIssue, listIssues, postIssueMessage } from './issues';
import { pollUnlessForbidden, retryUnlessClientError } from './request';
import type { CreateIssueInput, IssueFilters } from '../types/issues';

/**
 * Issues list, polled every 10s (web parity) so a reply from Trendzo or a newly
 * opened dispute appears without a manual refresh. Polling stops on 401/403.
 */
export function useIssues(filters: IssueFilters = {}, enabled = true) {
  return useQuery({
    queryKey: ['issues', 'list', filters],
    queryFn: () => listIssues(filters),
    enabled,
    retry: retryUnlessClientError,
    staleTime: 5_000,
    refetchInterval: pollUnlessForbidden(10_000),
  });
}

/** How many disputes are waiting on the store — the badge on the Orders header. */
export function useIssuesAwaitingStore(enabled = true) {
  const q = useQuery({
    queryKey: ['issues', 'awaiting-store'],
    queryFn: () => listIssues({ awaitingParty: 'retailer', limit: 200 }),
    enabled,
    retry: retryUnlessClientError,
    staleTime: 15_000,
    refetchInterval: pollUnlessForbidden(30_000),
  });
  // A decided/closed issue is never awaiting anyone, but guard against stale rows.
  const count = (q.data ?? []).filter((i) => i.status !== 'decided').length;
  return { ...q, count };
}

/** One issue with its thread. The thread is polled so replies land live. */
export function useIssue(id?: string) {
  return useQuery({
    queryKey: ['issues', 'detail', id],
    queryFn: () => getIssue(id as string),
    enabled: !!id,
    retry: retryUnlessClientError,
    staleTime: 3_000,
    refetchInterval: pollUnlessForbidden(10_000),
  });
}

/** A write on an issue refreshes the list, the thread and the order it hangs off. */
function useInvalidateIssues() {
  const qc = useQueryClient();
  return (issueId?: string, orderId?: string | null) => {
    void qc.invalidateQueries({ queryKey: ['issues', 'list'] });
    void qc.invalidateQueries({ queryKey: ['issues', 'awaiting-store'] });
    if (issueId) void qc.invalidateQueries({ queryKey: ['issues', 'detail', issueId] });
    if (orderId) {
      void qc.invalidateQueries({ queryKey: ['order', orderId] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
    }
  };
}

export function useCreateIssue() {
  const invalidate = useInvalidateIssues();
  return useMutation({
    mutationFn: (input: CreateIssueInput) => createIssue(input),
    onSettled: (data, _e, v) => invalidate(data?.issueId, v.orderId),
  });
}

export function usePostIssueMessage(issueId: string) {
  const invalidate = useInvalidateIssues();
  return useMutation({
    mutationFn: (v: { body: string; attachments?: string[] }) =>
      postIssueMessage(issueId, v.body, v.attachments ?? []),
    onSettled: () => invalidate(issueId),
  });
}

export function useHandBackIssue(issueId: string) {
  const invalidate = useInvalidateIssues();
  return useMutation({
    mutationFn: () => handBackIssue(issueId),
    onSettled: () => invalidate(issueId),
  });
}
