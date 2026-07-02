import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { envMockDefault, platformDefaultBaseUrl } from '../config/env';

interface SettingsState {
  baseUrl: string;
  mock: boolean;
  hydrated: boolean;
  setBaseUrl: (url: string) => void;
  resetBaseUrl: () => void;
  setMock: (mock: boolean) => void;
  _setHydrated: () => void;
}

const normalize = (url: string) => url.trim().replace(/\/+$/, '');

/**
 * App settings, persisted to AsyncStorage. The API client reads `baseUrl` and
 * `mock` from here at request time so the Dev Settings screen takes effect live.
 */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      baseUrl: platformDefaultBaseUrl(),
      mock: envMockDefault(),
      hydrated: false,
      setBaseUrl: (url) => set({ baseUrl: normalize(url) }),
      resetBaseUrl: () => set({ baseUrl: platformDefaultBaseUrl() }),
      setMock: (mock) => set({ mock }),
      _setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'trenzo.settings.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ baseUrl: s.baseUrl, mock: s.mock }),
      onRehydrateStorage: () => (state) => state?._setHydrated(),
    },
  ),
);
