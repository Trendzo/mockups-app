import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addHoliday,
  addPickupSlot,
  deletePickupSlot,
  getChangeRequestCurrentValues,
  getStoreBank,
  getStoreDocuments,
  getStoreHours,
  listHolidays,
  listPickupSlots,
  pauseStore,
  putStoreHours,
  removeHoliday,
  requestPosActivation,
  resumeStore,
  submitStoreDocument,
  updateStoreProfile,
} from './storeSettings';
import {
  getAccountAppeal,
  postAccountAppeal,
  requestAccountClosure,
  requestAccountReopen,
} from './onboarding';
import { retryUnlessClientError } from './request';
import { PauseInput, PickupSlotInput, StoreHours, StoreProfilePatch } from '../types/store';

/** The store lives on /retailer/me, so every store write refreshes it. */
function useRefreshMe() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['retailer-me'] });
}

export function useUpdateStoreProfile() {
  const refreshMe = useRefreshMe();
  return useMutation({
    mutationFn: (patch: StoreProfilePatch) => updateStoreProfile(patch),
    onSuccess: refreshMe,
  });
}

export function useStoreHours() {
  return useQuery({
    queryKey: ['store', 'hours'],
    queryFn: getStoreHours,
    retry: retryUnlessClientError,
    staleTime: 60_000,
  });
}

export function useSaveStoreHours() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hours: StoreHours) => putStoreHours(hours),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store', 'hours'] }),
  });
}

export function useStoreBank(enabled = true) {
  return useQuery({
    queryKey: ['store', 'bank'],
    queryFn: getStoreBank,
    enabled,
    retry: retryUnlessClientError,
    staleTime: 5 * 60_000,
  });
}

export function useStoreDocuments(enabled = true) {
  return useQuery({
    queryKey: ['store', 'documents'],
    queryFn: getStoreDocuments,
    enabled,
    retry: retryUnlessClientError,
    staleTime: 60_000,
  });
}

export function useSubmitStoreDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) => submitStoreDocument(id, url),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store', 'documents'] }),
  });
}

export function usePauseStore() {
  const refreshMe = useRefreshMe();
  return useMutation({ mutationFn: (input: PauseInput) => pauseStore(input), onSuccess: refreshMe });
}

export function useResumeStore() {
  const refreshMe = useRefreshMe();
  return useMutation({ mutationFn: () => resumeStore(), onSuccess: refreshMe });
}

export function useHolidays() {
  return useQuery({
    queryKey: ['store', 'holidays'],
    queryFn: listHolidays,
    retry: retryUnlessClientError,
    staleTime: 60_000,
  });
}

export function useAddHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, reason }: { date: string; reason?: string }) => addHoliday(date, reason),
    onSettled: () => qc.invalidateQueries({ queryKey: ['store', 'holidays'] }),
  });
}

export function useRemoveHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => removeHoliday(date),
    onSettled: () => qc.invalidateQueries({ queryKey: ['store', 'holidays'] }),
  });
}

export function usePickupSlots() {
  return useQuery({
    queryKey: ['store', 'pickup-slots'],
    queryFn: listPickupSlots,
    retry: retryUnlessClientError,
    staleTime: 60_000,
  });
}

export function useAddPickupSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PickupSlotInput) => addPickupSlot(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store', 'pickup-slots'] }),
  });
}

export function useDeletePickupSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePickupSlot(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store', 'pickup-slots'] }),
  });
}

export function useChangeRequestCurrentValues(enabled = true) {
  return useQuery({
    queryKey: ['change-requests', 'current-values'],
    queryFn: getChangeRequestCurrentValues,
    enabled,
    retry: 0,
    staleTime: 60_000,
  });
}

export function useRequestPosActivation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: requestPosActivation,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['change-requests'] }),
  });
}

/** Suspension / termination / closure conversation with the Trendzo team. */
export function useAccountAppeal(enabled = true) {
  return useQuery({
    queryKey: ['account-appeal'],
    queryFn: getAccountAppeal,
    enabled,
    retry: 0,
    refetchInterval: enabled ? 25_000 : false,
  });
}

export function usePostAppeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; attachmentUrls?: string[] }) => postAccountAppeal(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['account-appeal'] }),
  });
}

export function useRequestClosure() {
  const refreshMe = useRefreshMe();
  return useMutation({
    mutationFn: (reason?: string) => requestAccountClosure(reason),
    onSuccess: refreshMe,
  });
}

export function useRequestReopen() {
  const refreshMe = useRefreshMe();
  return useMutation({ mutationFn: () => requestAccountReopen(), onSuccess: refreshMe });
}
