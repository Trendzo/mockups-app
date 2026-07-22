import { getJson, postJson, unwrapEnvelope } from './client';
import { normalizeAuthError } from './auth';
import { EarlyDisbursementRequest, UpcomingPayout } from '../types/earnings';

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
