import { create } from 'zustand';
import { LocalPhoto } from '../navigation/types';

export type PhotoSlot = 'front' | 'back';

interface CaptureDraftState {
  front: LocalPhoto | null;
  back: LocalPhoto | null;
  setPhoto: (slot: PhotoSlot, photo: LocalPhoto | null) => void;
  clear: () => void;
}

/**
 * Holds the front (required) + back (optional) garment photos while the user
 * moves between the two-card picker and the camera. Session-only (not persisted).
 */
export const useCaptureDraft = create<CaptureDraftState>((set) => ({
  front: null,
  back: null,
  setPhoto: (slot, photo) => set({ [slot]: photo } as Partial<CaptureDraftState>),
  clear: () => set({ front: null, back: null }),
}));
