import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Submission } from '../types/api';
import { SubmissionStatus } from '../types/enums';

export interface RecentSubmission {
  id: string;
  mode: Submission['mode'];
  status: SubmissionStatus;
  outputUrls: string[];
  rawPhotos: string[];
  createdAt: number;
  name?: string; // set once published
}

interface SessionState {
  recent: RecentSubmission[];
  upsert: (s: Submission, createdAt: number) => void;
  setStatus: (id: string, status: SubmissionStatus) => void;
  setName: (id: string, name: string) => void;
  remove: (id: string) => void;
  draftsCount: () => number;
}

const MAX_RECENT = 30;

/**
 * Recent submissions, persisted so a crash doesn't lose in-flight work (§7).
 * `createdAt` is injected by the caller (Date.now lives in the UI layer).
 */
export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      recent: [],
      upsert: (s, createdAt) =>
        set((state) => {
          const existing = state.recent.find((r) => r.id === s.id);
          const entry: RecentSubmission = {
            id: s.id,
            mode: s.mode,
            status: s.status,
            outputUrls: s.outputUrls ?? [],
            rawPhotos: s.rawPhotos ?? [],
            createdAt: existing?.createdAt ?? createdAt,
            name: existing?.name,
          };
          const rest = state.recent.filter((r) => r.id !== s.id);
          return { recent: [entry, ...rest].slice(0, MAX_RECENT) };
        }),
      setStatus: (id, status) =>
        set((state) => ({
          recent: state.recent.map((r) => (r.id === id ? { ...r, status } : r)),
        })),
      setName: (id, name) =>
        set((state) => ({
          recent: state.recent.map((r) => (r.id === id ? { ...r, name } : r)),
        })),
      remove: (id) =>
        set((state) => ({ recent: state.recent.filter((r) => r.id !== id) })),
      draftsCount: () =>
        get().recent.filter(
          (r) =>
            r.status === SubmissionStatus.Accepted ||
            r.status === SubmissionStatus.ReadyForReview,
        ).length,
    }),
    {
      name: 'trenzo.session.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ recent: s.recent }),
    },
  ),
);
