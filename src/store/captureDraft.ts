import { create } from 'zustand';
import { LocalPhoto } from '../navigation/types';

/** Garment photo slots. front is required; the rest are optional references. */
export type PhotoSlot = 'front' | 'back' | 'pattern' | 'logo' | 'tag';

interface CaptureDraftState {
  front: LocalPhoto | null;
  back: LocalPhoto | null;
  pattern: LocalPhoto | null; // fabric texture / pattern close-up
  logo: LocalPhoto | null; // logo / monogram close-up
  tag: LocalPhoto | null; // brand tag / label photo
  setPhoto: (slot: PhotoSlot, photo: LocalPhoto | null) => void;
  clear: () => void;
}

/**
 * Holds the garment photos while the user moves between the two-card picker and
 * the camera: front (required) + back and three optional close-ups (pattern,
 * logo, tag). Session-only (not persisted).
 */
export const useCaptureDraft = create<CaptureDraftState>((set) => ({
  front: null,
  back: null,
  pattern: null,
  logo: null,
  tag: null,
  setPhoto: (slot, photo) =>
    set({ [slot]: photo } as Partial<CaptureDraftState>),
  clear: () =>
    set({ front: null, back: null, pattern: null, logo: null, tag: null }),
}));
