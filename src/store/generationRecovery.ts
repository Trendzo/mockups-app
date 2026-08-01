import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CreateSubmissionInput } from '../types/api';

export interface ActiveGeneration {
  submissionId: string;
  startedAt: number;
  input: CreateSubmissionInput;
}

interface GenerationRecoveryState {
  active: ActiveGeneration | null;
  hydrated: boolean;
  begin: (submissionId: string, input: CreateSubmissionInput, startedAt?: number) => void;
  clear: () => void;
}

export const useGenerationRecovery = create<GenerationRecoveryState>()(
  persist(
    (set) => ({
      active: null,
      hydrated: false,
      begin: (submissionId, input, startedAt = Date.now()) =>
        set({ active: { submissionId, input, startedAt } }),
      clear: () => set({ active: null }),
    }),
    {
      name: 'trendzo.generation-recovery.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ active: s.active }),
      onRehydrateStorage: () => () => {
        useGenerationRecovery.setState({ hydrated: true });
      },
    },
  ),
);
