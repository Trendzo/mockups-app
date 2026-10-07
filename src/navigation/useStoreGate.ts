import { useRetailerMe } from '../api/onboardingHooks';
import { usePermissions } from '../utils/usePermission';
import { storeGate, type StoreGate } from './storeGate';

/**
 * The live gate for screens: `/retailer/me` + this login's permissions. Cheap enough to
 * recompute every render (a handful of comparisons), so it is not memoised.
 */
export function useStoreGate(): StoreGate & { loading: boolean } {
  const me = useRetailerMe();
  const { can } = usePermissions();
  return { ...storeGate(me.data, can), loading: me.isLoading };
}
