import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The phone numbers the user has recently logged in with, most-recent first.
 * Persisted so returning users can tap to refill instead of retyping.
 */
interface RecentPhonesState {
  phones: string[];
  add: (phone: string) => void;
  remove: (phone: string) => void;
}

const MAX = 4;

export const useRecentPhones = create<RecentPhonesState>()(
  persist(
    (set) => ({
      phones: [],
      add: (phone) =>
        set((s) => {
          const p = phone.trim();
          if (!p) return s;
          return { phones: [p, ...s.phones.filter((x) => x !== p)].slice(0, MAX) };
        }),
      remove: (phone) =>
        set((s) => ({ phones: s.phones.filter((x) => x !== phone) })),
    }),
    {
      name: 'trendzo.recentPhones.v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
