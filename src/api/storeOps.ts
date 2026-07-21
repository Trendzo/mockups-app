import { getJson, putJson, unwrapEnvelope } from './client';
import { normalizeAuthError } from './auth';

export interface OrderAcceptance {
  accepting: boolean;
  /** Future ISO timestamp while offline (auto-reopen instant); null when online. */
  orderPauseUntil: string | null;
}

/** GET current online/offline (accepting-orders) state. */
export async function getOrderAcceptance(): Promise<OrderAcceptance> {
  try {
    const res = await getJson<{ data: OrderAcceptance }>('/retailer/store/order-acceptance');
    return unwrapEnvelope<OrderAcceptance>(res);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}

/** Flip the store online (accepting=true, reopen early) or offline (false). */
export async function setOrderAcceptance(accepting: boolean): Promise<OrderAcceptance> {
  try {
    const res = await putJson<{ data: OrderAcceptance }>('/retailer/store/order-acceptance', {
      accepting,
    });
    return unwrapEnvelope<OrderAcceptance>(res);
  } catch (e) {
    throw normalizeAuthError(e);
  }
}
