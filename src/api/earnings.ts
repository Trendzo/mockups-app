import { getJson, postJson, unwrapEnvelope } from './client';
import { normalizeAuthError } from './auth';
import { http, req } from './request';
import {
  BillingStatement,
  BillingStatementDetail,
  EarlyDisbursementRequest,
  PayoutDeductions,
  PayoutRow,
  StoreFees,
  toBillingStatement,
  toBillingStatementDetail,
  toPayoutRow,
  UpcomingPayout,
} from '../types/earnings';

/** GET /retailer/payouts/upcoming — unsettled amount owed + breakdown + next payout. */
export async function getUpcomingPayout(): Promise<UpcomingPayout> {
  try {
    const res = await getJson<{ data: UpcomingPayout }>('/retailer/payouts/upcoming');
    return unwrapEnvelope<UpcomingPayout>(res);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

/** GET /retailer/early-disbursement — this store's early-payout requests. */
export async function listEarlyDisbursements(): Promise<EarlyDisbursementRequest[]> {
  try {
    const res = await getJson<{ data: EarlyDisbursementRequest[] }>('/retailer/early-disbursement');
    return unwrapEnvelope<EarlyDisbursementRequest[]>(res);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

/** POST /retailer/early-disbursement — request early release of part of the balance. */
export async function createEarlyDisbursement(input: {
  amountPaise: number;
  reason: string;
}): Promise<{ id: string; status: string }> {
  try {
    const res = await postJson<{ data: { id: string; status: string } }>(
      '/retailer/early-disbursement',
      input,
    );
    return unwrapEnvelope<{ id: string; status: string }>(res);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

/** GET /retailer/payouts — every settlement cycle, newest first. */
export async function listPayouts(): Promise<PayoutRow[]> {
  const data = await req<unknown>(() => http.get('/retailer/payouts'));
  return rowsOf(data).map(toPayoutRow);
}

export const getPayout = async (id: string): Promise<PayoutRow> =>
  toPayoutRow(await req<unknown>(() => http.get(`/retailer/payouts/${encodeURIComponent(id)}`)));

export const getPayoutDeductions = (id: string) =>
  req<PayoutDeductions>(() =>
    http.get(`/retailer/payouts/${encodeURIComponent(id)}/deductions`),
  );

export const getFees = () => req<StoreFees>(() => http.get('/retailer/fees'));

/** Accept a bare array or an `{ rows | items }` wrapper. */
function rowsOf(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const d = data as { rows?: unknown; items?: unknown } | null;
  if (Array.isArray(d?.rows)) return d.rows;
  if (Array.isArray(d?.items)) return d.items;
  return [];
}

/**
 * GET /retailer/billing-statements — one per settlement cycle, newest first
 * (`payouts.view`). The ids are payout ids. Server max `limit` is 100.
 */
export async function listBillingStatements(limit = 50): Promise<BillingStatement[]> {
  const data = await req<unknown>(() =>
    http.get('/retailer/billing-statements', { params: { limit: Math.min(100, limit) } }),
  );
  return rowsOf(data).map(toBillingStatement);
}

/** GET /retailer/billing-statements/:id — the statement plus its dispute outcomes. */
export async function getBillingStatement(id: string): Promise<BillingStatementDetail> {
  const data = await req<unknown>(() =>
    http.get(`/retailer/billing-statements/${encodeURIComponent(id)}`),
  );
  return toBillingStatementDetail(data);
}
