import { useCallback, useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeDay,
  createSale,
  findCustomers,
  getDaySummary,
  getSale,
  holdSale,
  listHeldBills,
  listSales,
  lookupProducts,
  openDay,
  quoteBill,
  voidSale,
} from './pos';
import { retryUnlessClientError } from './request';
import { PosCreateSaleRequest, PosHoldRequest, PosQuoteRequest } from '../types/pos';

/** `value` once it has stopped changing for `ms` (typeahead / search boxes). */
export function useDebouncedValue<T>(value: T, ms = 220): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/**
 * Typeahead product search (call with an already-debounced query). The last
 * results stay up while the next term loads, so the list doesn't blink.
 */
export function useProductLookup(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: ['pos', 'lookup', term],
    queryFn: () => lookupProducts(term),
    enabled: term.length >= 2,
    staleTime: 15_000,
    retry: 0,
    placeholderData: keepPreviousData,
  });
}

/** Look a term up right now (Enter key), sharing the typeahead's cache. */
export function useLookupNow() {
  const qc = useQueryClient();
  return useCallback(
    (q: string) => {
      const term = q.trim();
      return qc.fetchQuery({
        queryKey: ['pos', 'lookup', term],
        queryFn: () => lookupProducts(term),
        staleTime: 15_000,
        retry: 0,
      });
    },
    [qc],
  );
}

/**
 * Live bill totals. Re-quotes on every cart change and keeps the previous
 * totals on screen while the next quote is in flight (no flicker to blank).
 */
export function useBillQuote(body: PosQuoteRequest, enabled: boolean) {
  return useQuery({
    queryKey: ['pos', 'quote', body],
    queryFn: () => quoteBill(body),
    enabled: enabled && body.lines.length > 0,
    staleTime: 0,
    retry: 0,
    placeholderData: keepPreviousData,
  });
}

export function useHeldBills(enabled = true) {
  return useQuery({
    queryKey: ['pos', 'held'],
    queryFn: listHeldBills,
    enabled,
    retry: retryUnlessClientError,
    staleTime: 10_000,
  });
}

export function useCustomerLookup(phoneDigits: string) {
  return useQuery({
    queryKey: ['pos', 'customers', phoneDigits],
    queryFn: () => findCustomers(phoneDigits),
    enabled: phoneDigits.length === 10,
    retry: 0,
    staleTime: 60_000,
  });
}

export function usePosSales(params: { q?: string; from?: string; to?: string }) {
  return useQuery({
    queryKey: ['pos', 'sales', params],
    queryFn: () => listSales(params),
    retry: retryUnlessClientError,
    staleTime: 10_000,
    // Keep the current list up while a new search / date range loads (no
    // flash back to a spinner and lost scroll position).
    placeholderData: keepPreviousData,
  });
}

export function usePosSale(id?: string) {
  return useQuery({
    queryKey: ['pos', 'sale', id],
    queryFn: () => getSale(id as string),
    enabled: !!id,
    retry: retryUnlessClientError,
  });
}

export function useDaySummary(date: string, enabled = true) {
  return useQuery({
    queryKey: ['pos', 'day-summary', date],
    queryFn: () => getDaySummary(date),
    enabled,
    retry: retryUnlessClientError,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

/** After anything that moves money or stock at the counter. */
function useInvalidatePos() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['pos'] });
    void qc.invalidateQueries({ queryKey: ['inventory'] });
    void qc.invalidateQueries({ queryKey: ['listings'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useCreateSale() {
  const invalidate = useInvalidatePos();
  return useMutation({
    mutationFn: (body: PosCreateSaleRequest) => createSale(body),
    onSuccess: invalidate,
  });
}

export function useHoldSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PosHoldRequest) => holdSale(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos', 'held'] }),
  });
}

export function useVoidSale() {
  const invalidate = useInvalidatePos();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => voidSale(id, reason),
    onSuccess: invalidate,
  });
}

export function useOpenDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ floatPaise, date }: { floatPaise: number; date: string }) =>
      openDay(floatPaise, date),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos', 'day-summary'] }),
  });
}

export function useCloseDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ countedPaise, date, note }: { countedPaise: number; date: string; note?: string }) =>
      closeDay(countedPaise, date, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos', 'day-summary'] }),
  });
}
