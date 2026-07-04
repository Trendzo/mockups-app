import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TARGET_ALL } from '../types/pos';

interface ScanTargetState {
  /** Which register a confirmed scan is sent to: a register id, or "all". */
  target: string;
  setTarget: (target: string) => void;
}

/**
 * Remembers the last-chosen register target for the scan screen so the picker
 * defaults to it across sessions. Defaults to "all" (every open register).
 */
export const useScanTarget = create<ScanTargetState>()(
  persist(
    (set) => ({
      target: TARGET_ALL,
      setTarget: (target) => set({ target }),
    }),
    {
      name: 'trenzo.scanTarget.v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
