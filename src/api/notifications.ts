import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, pollUnlessForbidden, req, retryUnlessClientError } from './request';
import {
  DEFAULT_NOTIFICATION_PREFS,
  InboxItem,
  NotificationPrefs,
} from '../types/notifications';

/** GET /retailer/inbox — latest notifications (bare array, newest first). */
export async function listInbox(limit = 50): Promise<InboxItem[]> {
  const data = await req<unknown>(() => http.get('/retailer/inbox', { params: { limit } }));
  if (Array.isArray(data)) return data as InboxItem[];
  const d = data as { items?: InboxItem[]; rows?: InboxItem[] } | null;
  return d?.items ?? d?.rows ?? [];
}

export const markInboxRead = (id: string) =>
  req<unknown>(() => http.post(`/retailer/inbox/${encodeURIComponent(id)}/read`, {}));

export const markAllInboxRead = () => req<unknown>(() => http.post('/retailer/inbox/read-all', {}));

export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const data = await req<Partial<NotificationPrefs> | null>(() =>
    http.get('/retailer/notification-prefs'),
  );
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(data ?? {}) };
}

export const putNotificationPrefs = (prefs: NotificationPrefs) =>
  req<unknown>(() => http.put('/retailer/notification-prefs', prefs));

// ---- hooks ----

/** Inbox + unread count (bell badge). Polled so new order alerts surface. */
export function useInbox(enabled = true) {
  const q = useQuery({
    queryKey: ['inbox'],
    queryFn: () => listInbox(50),
    enabled,
    retry: retryUnlessClientError,
    staleTime: 20_000,
    refetchInterval: pollUnlessForbidden(60_000),
  });
  const unread = (q.data ?? []).filter((n) => !n.readAt).length;
  return { ...q, unread };
}

/** Optimistically flips readAt so the dot clears instantly. */
export function useMarkInboxRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markInboxRead(id),
    onMutate: (id) => {
      qc.setQueryData<InboxItem[]>(['inbox'], (cur) =>
        cur?.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['inbox'] }),
  });
}

export function useMarkAllInboxRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markAllInboxRead,
    onMutate: () => {
      const now = new Date().toISOString();
      qc.setQueryData<InboxItem[]>(['inbox'], (cur) =>
        cur?.map((n) => (n.readAt ? n : { ...n, readAt: now })),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['inbox'] }),
  });
}

export function useNotificationPrefs() {
  return useQuery({
    queryKey: ['notification-prefs'],
    queryFn: getNotificationPrefs,
    retry: retryUnlessClientError,
    staleTime: 5 * 60_000,
  });
}

export function useSaveNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs: NotificationPrefs) => putNotificationPrefs(prefs),
    onSuccess: (_d, prefs) => qc.setQueryData(['notification-prefs'], prefs),
  });
}
