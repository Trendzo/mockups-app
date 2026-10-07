import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PosReturnLineInput } from '../types/pos';
import { QtyMap, addReturned } from '../utils/posExchange';

interface PosReturnsState {
  /** Units handed back so far, per original sale item id — recorded on THIS device. */
  returned: QtyMap;
  record: (lines: PosReturnLineInput[]) => void;
}

/**
 * A local ledger of what's been returned from this device.
 *
 * The server only checks a return against the quantity SOLD, not against what's already been returned,
 * and a sale's own detail doesn't list the returns made against it — so without this, the same item
 * could be refunded twice. The ledger lets the Return / Exchange screens cap quantities at "what's
 * left". It only knows about returns made on this phone (a second device or the web portal would
 * still need a server-side guard), which is why it's a safety net, not the source of truth.
 */
export const usePosReturns = create<PosReturnsState>()(
  persist(
    (set) => ({
      returned: {},
      record: (lines) => set((s) => ({ returned: addReturned(s.returned, lines) })),
    }),
    {
      name: 'trendzo.pos.returned.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ returned: s.returned }),
    },
  ),
);
