import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DocKind } from '../types/onboarding';

export interface ApplicationFields {
  legalName: string;
  gstin: string;
  storeName: string;
  pan: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  contactPhone: string; // alternate/contact phone (backend: contactPhone)
  password: string;
  addressLine: string;
  pincode: string;
  stateCode: string;
  bankLegalName: string;
  bankAccountNumber: string;
  bankIfsc: string;
}

export const EMPTY_APPLICATION: ApplicationFields = {
  legalName: '',
  gstin: '',
  storeName: '',
  pan: '',
  ownerName: '',
  ownerEmail: '',
  ownerPhone: '',
  contactPhone: '',
  password: '',
  addressLine: '',
  pincode: '',
  stateCode: '',
  bankLegalName: '',
  bankAccountNumber: '',
  bankIfsc: '',
};

interface ApplicationDraftState {
  fields: ApplicationFields;
  docs: Partial<Record<DocKind, string>>;
  znfFinance: boolean; // store opts into ZNF Finance (yes/no)
  step: number;
  hydrated: boolean;
  setField: (k: keyof ApplicationFields, v: string) => void;
  setDoc: (kind: DocKind, url: string | undefined) => void;
  setZnfFinance: (v: boolean) => void;
  setStep: (n: number) => void;
  clear: () => void;
  _setHydrated: () => void;
}

/**
 * Draft of the retailer application, persisted so a user who leaves mid-form
 * returns to exactly where they were - same fields, docs, and step.
 *
 * The password is deliberately NOT persisted: writing a plaintext credential to
 * AsyncStorage is a security risk. It is re-entered on return and validated at
 * submit. Everything else survives an app restart.
 */
export const useApplicationDraft = create<ApplicationDraftState>()(
  persist(
    (set) => ({
      fields: EMPTY_APPLICATION,
      docs: {},
      znfFinance: false,
      step: 0,
      hydrated: false,
      setField: (k, v) => set((s) => ({ fields: { ...s.fields, [k]: v } })),
      setDoc: (kind, url) =>
        set((s) => {
          const docs = { ...s.docs };
          if (url) docs[kind] = url;
          else delete docs[kind];
          return { docs };
        }),
      setZnfFinance: (v) => set({ znfFinance: v }),
      setStep: (n) => set({ step: n }),
      clear: () => set({ fields: EMPTY_APPLICATION, docs: {}, znfFinance: false, step: 0 }),
      _setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'trendzo.applicationDraft.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        // Never persist the password.
        fields: { ...s.fields, password: '' },
        docs: s.docs,
        znfFinance: s.znfFinance,
        step: s.step,
      }),
      // Flip `hydrated` on BOTH success and error. On a rehydration failure
      // (corrupt/unparseable persisted JSON, or a storage read that rejects)
      // zustand calls this with state===undefined; going through the store
      // instance guarantees we never strand the form on a blank screen.
      onRehydrateStorage: () => () => {
        useApplicationDraft.setState({ hydrated: true });
      },
    },
  ),
);
