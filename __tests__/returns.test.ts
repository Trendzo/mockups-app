/**
 * Request shaping for the returns queue + the store's moves on a return
 * (GET /retailer/returns…, verify, decline, mark-received, pay-cash), with the HTTP
 * client mocked, plus the pure queue maths.
 */
jest.mock('../src/store/auth', () => ({
  useAuth: { getState: () => ({ token: null }), setState: () => {}, subscribe: () => () => {} },
}));

jest.mock('../src/api/client', () => {
  const actual = jest.requireActual('../src/api/client');
  return {
    ...actual,
    http: { get: jest.fn(), post: jest.fn() },
  };
});

import { http } from '../src/api/client';
import { acceptReturn, declineReturn } from '../src/api/orders';
import {
  getReturn,
  listReturns,
  markReturnReceived,
  payCashRefund,
  returnListParams,
} from '../src/api/returns';
import { goodsAtStore, returnDecisionMeta } from '../src/types/returns';
import type { ReturnRow } from '../src/types/returns';
import { cashOwedTotal, sortReturnsQueue, verificationWindowLeft } from '../src/utils/orders';

const get = http.get as jest.Mock;
const post = http.post as jest.Mock;
const ok = (data: unknown) => Promise.resolve({ data: { success: true, data } });

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe('returns API', () => {
  it('lists with the decision filter and a limit, or with nothing at all', async () => {
    get.mockReturnValue(ok([]));
    await listReturns({ decision: 'pending', limit: 100 });
    expect(get).toHaveBeenLastCalledWith('/retailer/returns', { params: { decision: 'pending', limit: 100 } });
    await listReturns();
    expect(get).toHaveBeenLastCalledWith('/retailer/returns', { params: {} });
    expect(returnListParams({ limit: 999 })).toEqual({ limit: 200 });
  });

  it('reads one return and defaults the photo / held-item arrays', async () => {
    get.mockReturnValueOnce(
      ok({
        id: 'ret_1',
        kind: 'door_return',
        storeDecision: 'pending',
        cashRefundDue: { refundId: 'rf_1', disbursementId: 'rd_1', amountPaise: 49900 },
      }),
    );
    const r = await getReturn('ret_1');
    expect(get).toHaveBeenCalledWith('/retailer/returns/ret_1');
    expect(r.consumerPhotos).toEqual([]);
    expect(r.storeRejectPhotos).toEqual([]);
    expect(r.heldItems).toEqual([]);
    expect(r.cashRefundDue?.disbursementId).toBe('rd_1');
  });

  it('marks received with an empty JSON body', async () => {
    post.mockReturnValueOnce(ok({ returnId: 'ret_1', verificationWindowExpiresAt: '2026-10-08T10:00:00.000Z' }));
    const r = await markReturnReceived('ret_1');
    expect(post).toHaveBeenCalledWith('/retailer/returns/ret_1/mark-received', {});
    expect(r.verificationWindowExpiresAt).toBe('2026-10-08T10:00:00.000Z');
  });

  it('accepts via /verify with decision "accepted" only (the server has no reject here)', async () => {
    post.mockReturnValue(ok({}));
    await acceptReturn('ret_1');
    expect(post).toHaveBeenLastCalledWith('/retailer/returns/ret_1/verify', { decision: 'accepted' });
    await acceptReturn('ret_1', '  looks fine ');
    expect(post).toHaveBeenLastCalledWith('/retailer/returns/ret_1/verify', {
      decision: 'accepted',
      reasonNote: 'looks fine',
    });
  });

  it('declines via /decline with the note and up to 5 photos', async () => {
    post.mockReturnValue(ok({}));
    await declineReturn('ret_1', 'Item worn', ['https://cdn.example/1.jpg']);
    expect(post).toHaveBeenLastCalledWith('/retailer/returns/ret_1/decline', {
      reasonNote: 'Item worn',
      rejectPhotos: ['https://cdn.example/1.jpg'],
    });
  });

  it('records cash handed over: exact amount, optional trimmed note capped at 300', async () => {
    post.mockReturnValue(ok({}));
    await payCashRefund('rf_1', 'rd_1', 49900);
    expect(post).toHaveBeenLastCalledWith('/retailer/refunds/rf_1/disbursements/rd_1/pay-cash', {
      amountPaise: 49900,
    });
    await payCashRefund('rf_1', 'rd_1', 49900, `  ${'x'.repeat(400)}  `);
    expect(post).toHaveBeenLastCalledWith('/retailer/refunds/rf_1/disbursements/rd_1/pay-cash', {
      amountPaise: 49900,
      note: 'x'.repeat(300),
    });
  });

  it('surfaces the 409 disbursement_already_terminal code on a replay', async () => {
    post.mockReturnValueOnce(
      Promise.reject({
        isAxiosError: true,
        response: {
          status: 409,
          data: {
            success: false,
            error: { code: 'disbursement_already_terminal', message: "Disbursement is already 'succeeded'" },
          },
        },
      }),
    );
    await expect(payCashRefund('rf_1', 'rd_1', 49900)).rejects.toMatchObject({
      status: 409,
      code: 'disbursement_already_terminal',
    });
  });
});

function row(id: string, over: Partial<ReturnRow> = {}): ReturnRow {
  return {
    id,
    orderItemId: `oi_${id}`,
    kind: 'door_return',
    openedAt: '2026-10-01T10:00:00.000Z',
    reasonText: null,
    agentDisposition: null,
    storeDecision: 'pending',
    verificationWindowExpiresAt: null,
    orderItem: { id: `oi_${id}`, orderId: `ord_${id}`, listingNameSnap: 'Shirt', order: { id: `ord_${id}` } },
    cashRefundDue: null,
    ...over,
  };
}

describe('returns queue maths', () => {
  it('puts what needs a decision first (soonest deadline), then cash owed, then the rest newest first', () => {
    const sorted = sortReturnsQueue([
      row('old-accepted', { storeDecision: 'accepted', openedAt: '2026-09-01T00:00:00.000Z' }),
      row('cash', {
        storeDecision: 'accepted',
        openedAt: '2026-09-15T00:00:00.000Z',
        cashRefundDue: { refundId: 'rf', disbursementId: 'rd', amountPaise: 100 },
      }),
      row('later', { verificationWindowExpiresAt: '2026-10-09T00:00:00.000Z' }),
      row('sooner', { verificationWindowExpiresAt: '2026-10-08T00:00:00.000Z' }),
      row('no-window'),
      row('new-rejected', { storeDecision: 'rejected', openedAt: '2026-09-30T00:00:00.000Z' }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual([
      'sooner',
      'later',
      'no-window',
      'cash',
      'new-rejected',
      'old-accepted',
    ]);
  });

  it('counts each owed cash leg once even when two returns share an order', () => {
    const leg = { refundId: 'rf', disbursementId: 'rd_1', amountPaise: 25000 };
    const other = { refundId: 'rf2', disbursementId: 'rd_2', amountPaise: 5000 };
    const rows = [row('a', { cashRefundDue: leg }), row('b', { cashRefundDue: leg }), row('c', { cashRefundDue: other }), row('d')];
    expect(cashOwedTotal(rows)).toEqual({ paise: 30000, legs: 2 });
    expect(cashOwedTotal([row('x')])).toEqual({ paise: 0, legs: 0 });
  });

  it('reads the verification window: hours, minutes, urgency, expiry', () => {
    const now = Date.parse('2026-10-07T10:00:00.000Z');
    const at = (ms: number) => new Date(now + ms).toISOString();
    expect(verificationWindowLeft(null, now)).toBeNull();
    expect(verificationWindowLeft(at(5 * 3_600_000 + 12 * 60_000), now)).toEqual({
      expired: false,
      label: '5h 12m left',
      urgent: false,
    });
    expect(verificationWindowLeft(at(42 * 60_000), now)).toEqual({ expired: false, label: '42m left', urgent: true });
    expect(verificationWindowLeft(at(30 * 3_600_000), now)?.label).toBe('1d 6h left');
    expect(verificationWindowLeft(at(-1000), now)).toEqual({ expired: true, label: 'Expired', urgent: true });
  });

  it('treats custody as unknown only when the server omits the field', () => {
    expect(goodsAtStore({ goodsReceivedAt: null })).toBe(false);
    expect(goodsAtStore({ goodsReceivedAt: '2026-10-07T10:00:00.000Z' })).toBe(true);
    expect(goodsAtStore({})).toBe(true);
    expect(returnDecisionMeta('rejected').label).toBe('Declined');
  });
});
