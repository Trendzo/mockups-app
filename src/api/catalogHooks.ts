import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBrand,
  getCatalogBrands,
  getCatalogCategories,
  getInventory,
  getListing,
  getListings,
} from './catalogManagement';
import { InventoryFlag, ListingStatus } from '../types/catalog';

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
  });
}
