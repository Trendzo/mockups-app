import { create } from 'zustand';
import { LocalPhoto } from '../navigation/types';
import { Mode, ModelGender } from '../types/enums';

/** Garment photo slots. front is required; the rest are optional references. */
export type PhotoSlot = 'front' | 'back' | 'pattern' | 'logo' | 'tag';

/**
 * Generation settings chosen on the Configure screen. Kept in the draft (not
 * screen-local) so the Review screen can send the user back to tweak & regenerate
 * the SAME garment without re-capturing or losing the prior configuration.
 */
export interface MockupConfig {
  mode: Mode;
  modelGender: ModelGender | null; // only applies when mode === with_model
  design: LocalPhoto | null; // graphic to print onto the garment first
  prompt: string; // freeform styling instruction
  only: string[]; // limit generated views (view-name namespace matches mode)
}

const emptyConfig: MockupConfig = {
  mode: Mode.WithoutModel,
  modelGender: null,
  design: null,
  prompt: '',
  only: [],
};

interface CaptureDraftState {
  front: LocalPhoto | null;
  back: LocalPhoto | null;
  pattern: LocalPhoto | null; // fabric texture / pattern close-up
  logo: LocalPhoto | null; // logo / monogram close-up
  tag: LocalPhoto | null; // brand tag / label photo
  config: MockupConfig;
  setPhoto: (slot: PhotoSlot, photo: LocalPhoto | null) => void;
  setConfig: (patch: Partial<MockupConfig>) => void;
  clear: () => void;
}

/**
 * Holds the in-progress mockup draft while the user moves between the picker,
 * the camera, Configure, and Review: the garment photos (front + optional back
 * and three close-ups) plus the generation config. Retaining the config lets
 * "Adjust & regenerate" return to Configure with everything intact. Session-only
 * (not persisted); cleared whenever a brand-new mockup is started.
 */
export const useCaptureDraft = create<CaptureDraftState>((set) => ({
  front: null,
  back: null,
  pattern: null,
  logo: null,
  tag: null,
  config: emptyConfig,
  setPhoto: (slot, photo) =>
    set({ [slot]: photo } as Partial<CaptureDraftState>),
  setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
  clear: () =>
    set({
      front: null,
      back: null,
      pattern: null,
      logo: null,
      tag: null,
      config: emptyConfig,
    }),
}));
