import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createSubmission,
  decideSubmission,
  getBrands,
  getCategories,
  publishSubmission,
} from './catalog';
import { createMockups } from './mockups';
import { getHealth } from './health';
import { normalizeError } from './errors';
import {
  ApiError,
  Brand,
  Category,
  CreateMockupsInput,
  CreateSubmissionInput,
  DecisionInput,
  MockupsResult,
  PublishInput,
  PublishResult,
  Submission,
} from '../types/api';

/**
 * Run an async call and rethrow errors already normalized to `{ error }`, so
 * React Query's `error` is always an ApiError the UI can render directly.
 */
async function normalized<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw normalizeError(e);
  }
}

/** Generation/decision/publish are mutations; categories/brands are queries (§4.5). */

export function useCreateSubmission() {
  return useMutation<Submission, ApiError, CreateSubmissionInput>({
    mutationFn: (input) => normalized(() => createSubmission(input)),
  });
}

export function useDecideSubmission() {
  return useMutation<
    { id: string; status: Submission['status'] },
    ApiError,
    { id: string; input: DecisionInput }
  >({
    mutationFn: ({ id, input }) => normalized(() => decideSubmission(id, input)),
  });
}

export function usePublishSubmission() {
  return useMutation<PublishResult, ApiError, { id: string; input: PublishInput }>(
    {
      mutationFn: ({ id, input }) =>
        normalized(() => publishSubmission(id, input)),
    },
  );
}

export function useCreateMockups() {
  return useMutation<MockupsResult, ApiError, CreateMockupsInput>({
    mutationFn: (input) => normalized(() => createMockups(input)),
  });
}

export function useCategories() {
  return useQuery<Category[], ApiError>({
    queryKey: ['categories'],
    queryFn: () => normalized(getCategories),
  });
}

export function useBrands() {
  return useQuery<Brand[], ApiError>({
    queryKey: ['brands'],
    queryFn: () => normalized(getBrands),
  });
}

export function useHealth(enabled = true) {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => normalized(getHealth),
    enabled,
    retry: 0,
    staleTime: 0,
  });
}

export { normalizeError };
