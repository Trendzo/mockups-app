import {
  InfiniteData,
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  adjustVariantStock,
  createBrand,
  getBestSellers,
  getCatalogBrands,
  getCatalogCategories,
  getCatalogSizeScales,
  getDeadStock,
  getInventory,
  getListing,
  getListings,
  getReservations,
  getStockAdjustments,
  patchInventorySettings,
  patchVariant,
} from './catalogManagement';
import { applyInventoryImport, dryRunInventoryImport } from './inventoryImport';
import { errorCode, retryUnlessClientError } from './request';
import {
  AdjustStockInput,
  InventoryFlag,
  InventoryPage,
  InventoryRow,
  ListingStatus,
  PatchVariantInput,
} from '../types/catalog';

export function useListings(status?: ListingStatus, sort?: string) {
  return useQuery({
    queryKey: ['listings', status ?? 'all', sort ?? 'updated_desc'],
    queryFn: () => getListings({ status, sort }),
    staleTime: 15_000,
  });
}

export function useListing(id?: string) {
  return useQuery({
    queryKey: ['listing', id],
    queryFn: () => getListing(id as string),
    enabled: !!id,
    staleTime: 10_000,
  });
}

export function useCatalogCategories(gender?: string) {
  return useQuery({
    queryKey: ['catalog-categories', gender ?? 'all'],
    queryFn: () => getCatalogCategories(gender),
    staleTime: 5 * 60_000,
  });
}

/** Category-aware size pick-lists (same /catalog/size-scales the web portal uses). */
export function useCatalogSizeScales(categoryId?: string | null) {
  return useQuery({
    queryKey: ['catalog-size-scales', categoryId ?? 'all'],
    queryFn: () => getCatalogSizeScales(categoryId),
    staleTime: 5 * 60_000,
  });
}

export function useCatalogBrands() {
  return useQuery({
    queryKey: ['catalog-brands'],
    queryFn: getCatalogBrands,
    staleTime: 5 * 60_000,
  });
}

/** Create a brand inline; refreshes the brand picker so the new one is selectable. */
export function useCreateBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBrand,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalog-brands'] }),
  });
}

export interface InventoryQuery {
  q?: string;
  status?: ListingStatus;
  flag?: InventoryFlag;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}

export function useInventory(params: InventoryQuery) {
  return useQuery({
    queryKey: ['inventory', params],
    queryFn: () => getInventory(params),
    staleTime: 10_000,
    // Keep the current page on screen while a filter/page change loads.
    placeholderData: keepPreviousData,
  });
}

export const INVENTORY_PAGE_SIZE = 50;

/**
 * Inventory list with "Load more": pages accumulate client-side. Each search /
 * filter combo is its own key, so a change starts again at page 1 while the
 * previous rows stay on screen until the new ones land.
 */
export function useInventoryInfinite(params: Omit<InventoryQuery, 'page' | 'pageSize'>) {
  return useInfiniteQuery({
    queryKey: ['inventory', 'infinite', params],
    queryFn: ({ pageParam }) =>
      getInventory({ ...params, page: pageParam, pageSize: INVENTORY_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.rows.length, 0);
      // An empty page means the list shrank under us - stop instead of looping.
      return last.rows.length > 0 && loaded < last.total ? all.length + 1 : undefined;
    },
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

/** Store's saved low-stock threshold (rides on the inventory response; 5 when unset). */
export function useLowStockThreshold() {
  const q = useQuery({
    queryKey: ['inventory', { page: 1, pageSize: 1 }],
    queryFn: () => getInventory({ page: 1, pageSize: 1 }),
    staleTime: 60_000,
  });
  return { ...q, threshold: q.data?.lowStockThreshold ?? 5 };
}

export function useReservations(variantId: string | null) {
  return useQuery({
    queryKey: ['inventory', 'reservations', variantId],
    queryFn: () => getReservations(variantId as string, 10),
    enabled: !!variantId,
    staleTime: 30_000,
    retry: 0,
  });
}

/**
 * Stock ledger, newest first. Pass `variantId` for one variant's history (the
 * server filters it, so the 200-entry page is all that variant's changes);
 * `from`/`to` are ISO instants.
 */
export function useStockAdjustments(
  range: { variantId?: string; from?: string; to?: string; limit?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: ['inventory', 'adjustments', range],
    queryFn: () => getStockAdjustments(range),
    enabled,
    staleTime: 30_000,
    retry: 0,
  });
}

/** Dead-stock report; re-queried whenever the days threshold changes. */
export function useDeadStock(daysWithoutSale: number, enabled = true) {
  return useQuery({
    queryKey: ['inventory', 'dead-stock', daysWithoutSale],
    queryFn: () => getDeadStock({ daysWithoutSale }),
    enabled,
    staleTime: 60_000,
    retry: retryUnlessClientError,
    placeholderData: keepPreviousData,
  });
}

export function useBestSellers(days = 30, limit = 5) {
  return useQuery({
    queryKey: ['inventory', 'best-sellers', days, limit],
    queryFn: () => getBestSellers(days, limit),
    staleTime: 5 * 60_000,
    retry: 0,
  });
}

/** After any stock / price / availability write. */
function useInvalidateStock() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['inventory'] });
    void qc.invalidateQueries({ queryKey: ['listings'] });
    void qc.invalidateQueries({ queryKey: ['listing'] });
  };
}

/** Inline stock / price / on-sale edit for one variant (PATCH /retailer/variants/:id). */
export function useUpdateVariant() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PatchVariantInput }) => patchVariant(id, patch),
    onSuccess: invalidate,
  });
}

/** The inline edits the Inventory screen makes (stock is an absolute count). */
export type InventoryRowPatch = Pick<PatchVariantInput, 'stock' | 'pricePaise' | 'isActive'>;

/** Write an edit into every loaded inventory page so the row updates before the refetch. */
function patchInventoryCache(
  qc: ReturnType<typeof useQueryClient>,
  id: string,
  patch: Partial<InventoryRow>,
) {
  qc.setQueriesData<InfiniteData<InventoryPage>>(
    { queryKey: ['inventory', 'infinite'] },
    (old) =>
      old && {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          rows: page.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
        })),
      },
  );
}

/**
 * useUpdateVariant for the Inventory list: the same PATCH, but the change is
 * also written into the loaded inventory pages straight away, so the row (and
 * its on-sale switch) updates without waiting for the refetch.
 */
export function useUpdateInventoryRow() {
  const qc = useQueryClient();
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: InventoryRowPatch }) => patchVariant(id, patch),
    onSuccess: (_variant, { id, patch }) => {
      patchInventoryCache(qc, id, patch);
      invalidate();
    },
    // Stock below reserved: our reserved count was stale, so pull the real one.
    onError: (e) => {
      if (errorCode(e) === 'invalid_state') invalidate();
    },
  });
}

/**
 * Stock correction for logins that hold `inventory.adjust` but not `listings.edit`
 * (floor staff): POST /retailer/inventory/:variantId/adjust. Same optimistic row
 * update and invalid_state refetch as the PATCH path.
 */
export function useAdjustStock() {
  const qc = useQueryClient();
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdjustStockInput }) =>
      adjustVariantStock(id, input),
    onSuccess: (_res, { id, input }) => {
      patchInventoryCache(qc, id, { stock: input.newStock });
      invalidate();
    },
    onError: (e) => {
      if (errorCode(e) === 'invalid_state') invalidate();
    },
  });
}

/**
 * Activate / deactivate many variants. There's no bulk endpoint, so this sends
 * one PATCH per variant in parallel (as the web portal does) and reports how
 * many failed instead of failing the whole batch.
 */
export function useBulkSetVariantsActive() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: async ({ ids, isActive }: { ids: string[]; isActive: boolean }) => {
      const results = await Promise.allSettled(ids.map((id) => patchVariant(id, { isActive })));
      return {
        updated: results.filter((r) => r.status === 'fulfilled').length,
        failed: results.filter((r) => r.status === 'rejected').length,
      };
    },
    onSettled: invalidate,
  });
}

/** Dry-run a parsed CSV: the plan and per-row errors, nothing written. */
export function useDryRunInventoryImport() {
  return useMutation({ mutationFn: dryRunInventoryImport });
}

/** Apply a parsed CSV (all-or-nothing); refreshes stock and product lists. */
export function useApplyInventoryImport() {
  const invalidate = useInvalidateStock();
  return useMutation({ mutationFn: applyInventoryImport, onSuccess: invalidate });
}

export function useSaveLowStockThreshold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (threshold: number) => patchInventorySettings(threshold),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  });
}
