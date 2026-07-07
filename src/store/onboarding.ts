import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface OnboardingState {
  applicationId: string | null;
  ownerEmail: string | null;
  hydrated: boolean;
  setApplication: (id: string, email: string) => void;
  clearApplication: () => void;
  _setHydrated: () => void;
}

/**
 * Remembers a submitted application so a returning, not-yet-approved user lands
 * back on their Status screen (ownerEmail is the secret for public status polls).
 */
export const useOnboarding = create<OnboardingState>()(
  persist(
    (set) => ({
      applicationId: null,
      ownerEmail: null,
      hydrated: false,
      setApplication: (id, email) =>
        set({ applicationId: id, ownerEmail: email.trim().toLowerCase() }),
      clearApplication: () => set({ applicationId: null, ownerEmail: null }),
      _setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'trendzo.onboarding.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        applicationId: s.applicationId,
        ownerEmail: s.ownerEmail,
      }),
      // Flip `hydrated` on both success and error (state is undefined on a
      // rehydration failure) so the app gate can never hang on a blank screen.
      onRehydrateStorage: () => () => {
        useOnboarding.setState({ hydrated: true });
      },
    },
  ),
);
