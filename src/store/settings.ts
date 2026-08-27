import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  envMockDefault,
  platformDefaultAuthBaseUrl,
  platformDefaultBaseUrl,
} from '../config/env';

interface SettingsState {
  baseUrl: string;
  authBaseUrl: string;
  mock: boolean;
  hydrated: boolean;
  setBaseUrl: (url: string) => void;
  resetBaseUrl: () => void;
  setAuthBaseUrl: (url: string) => void;
  resetAuthBaseUrl: () => void;
  setMock: (mock: boolean) => void;
  _setHydrated: () => void;
}

const normalize = (url: string) => url.trim().replace(/\/+$/, '');

/**
 * App settings, persisted to AsyncStorage. The API/auth clients read the base
 * URLs from here at request time so the Dev Settings screen takes effect live.
 */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      baseUrl: platformDefaultBaseUrl(),
      authBaseUrl: platformDefaultAuthBaseUrl(),
      mock: envMockDefault(),
      hydrated: false,
      setBaseUrl: (url) => set({ baseUrl: normalize(url) }),
      resetBaseUrl: () => set({ baseUrl: platformDefaultBaseUrl() }),
      setAuthBaseUrl: (url) => set({ authBaseUrl: normalize(url) }),
      resetAuthBaseUrl: () => set({ authBaseUrl: platformDefaultAuthBaseUrl() }),
      setMock: (mock) => set({ mock }),
      _setHydrated: () => set({ hydrated: true }),
    }),
    {
      // Bumped on a base-URL change: the persisted value would otherwise keep
      // pinning existing installs to the previous host.
      name: 'trendzo.settings.v5',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        baseUrl: s.baseUrl,
        authBaseUrl: s.authBaseUrl,
        mock: s.mock,
      }),
      // Flip `hydrated` on both success and error (state is undefined on a
      // rehydration failure) so the app gate can never hang on a blank screen.
      onRehydrateStorage: () => () => {
        useSettings.setState({ hydrated: true });
      },
    },
  ),
);
