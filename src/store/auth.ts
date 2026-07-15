import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthResult, Retailer } from '../types/auth';
import { queryClient } from '../api/queryClient';

/** Why the session ended - drives whether Login shows a "session expired" notice. */
export type LogoutReason = 'user' | 'expired';

interface AuthState {
  token: string | null;
  retailer: Retailer | null;
  hydrated: boolean;
  /** Set when the last logout was involuntary; cleared once surfaced/replaced. */
  logoutReason: LogoutReason | null;
  setAuth: (result: AuthResult) => void;
  logout: (reason?: LogoutReason) => void;
  clearLogoutReason: () => void;
  _setHydrated: () => void;
}

/**
 * Retailer session (JWT access token + profile), persisted so the user stays
 * logged in across launches.
 *
 * The backend issues a single access token and exposes NO refresh endpoint, so
 * the server is authoritative on expiry: an expired/invalid token surfaces as a
 * 401 on the next authed call, which triggers `logout('expired')` (see the
 * response interceptor in api/client.ts). Login then shows a session-expired
 * notice. There is deliberately no client-side token refresh.
 */
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      retailer: null,
      hydrated: false,
      logoutReason: null,
      setAuth: (result) => {
        // Drop any prior account's cached queries before adopting the new session.
        queryClient.clear();
        set({
          token: result.token,
          retailer: result.retailer,
          logoutReason: null,
        });
      },
      logout: (reason: LogoutReason = 'user') => {
        // Clear the query cache so a previous account's /retailer/me (which drives
        // the app gate), KYC, etc. can't leak into the next session.
        queryClient.clear();
        set({ token: null, retailer: null, logoutReason: reason });
      },
      clearLogoutReason: () => set({ logoutReason: null }),
      _setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'trendzo.auth.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ token: s.token, retailer: s.retailer }),
      // Flip `hydrated` on BOTH success and error. On a rehydration failure
      // (corrupt persisted JSON / storage read that rejects) zustand calls this
      // with state===undefined; going through the store instance guarantees the
      // app gate never hangs on a permanent splash.
      onRehydrateStorage: () => () => {
        useAuth.setState({ hydrated: true });
      },
    },
  ),
);
