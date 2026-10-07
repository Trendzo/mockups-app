/**
 * Request shaping for the disputes API (GET/POST /retailer/issues…): the URLs, the
 * query strings and the bodies the app sends, with the HTTP client mocked.
 */
// The auth store pulls in React Native (query client); only the token getter is used here.
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
import {
  createIssue,
  getIssue,
  handBackIssue,
  issueListParams,
  listIssues,
  postIssueMessage,
} from '../src/api/issues';
import {
  AWAITING_LABEL,
  issueDecisionLabel,
  issueStatusMeta,
  needsRetailerResponse,
} from '../src/types/issues';

const get = http.get as jest.Mock;
const post = http.post as jest.Mock;

/** The server's envelope around a payload. */
const ok = (data: unknown) => Promise.resolve({ data: { success: true, data } });

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe('issues API', () => {
  it('lists with only the filters that were set', async () => {
    get.mockReturnValueOnce(ok([{ id: 'iss_1' }]));
    const rows = await listIssues({ status: 'open', awaitingParty: 'retailer', orderId: 'ord_9' });
    expect(get).toHaveBeenCalledWith('/retailer/issues', {
      params: { status: 'open', awaitingParty: 'retailer', orderId: 'ord_9' },
    });
    expect(rows).toEqual([{ id: 'iss_1' }]);
  });

  it('sends no query when unfiltered, and caps limit at the server max of 200', () => {
    expect(issueListParams()).toEqual({});
    expect(issueListParams({ limit: 500 })).toEqual({ limit: 200 });
    expect(issueListParams({ limit: 0 })).toEqual({});
    expect(issueListParams({ kind: 'dispute', awaitingParty: 'none' })).toEqual({
      kind: 'dispute',
      awaitingParty: 'none',
    });
  });

  it('returns an empty list for a non-array reply', async () => {
    get.mockReturnValueOnce(ok(null));
    expect(await listIssues()).toEqual([]);
  });

  it('reads one issue with its thread, defaulting missing arrays', async () => {
    get.mockReturnValueOnce(ok({ id: 'iss/1', subject: 's' }));
    const d = await getIssue('iss/1');
    expect(get).toHaveBeenCalledWith('/retailer/issues/iss%2F1');
    expect(d.messages).toEqual([]);
    expect(d.transitions).toEqual([]);
    expect(d.evidence).toEqual([]);
  });

  it('raises a dispute with kind "dispute", trimmed text and the evidence urls', async () => {
    post.mockReturnValueOnce(ok({ issueId: 'iss_new' }));
    const r = await createIssue({
      orderId: 'ord_1',
      subject: '  Refund request ',
      description: ' Customer wants money back\n',
      evidence: ['https://cdn.example/a.jpg'],
    });
    expect(post).toHaveBeenCalledWith('/retailer/issues', {
      kind: 'dispute',
      orderId: 'ord_1',
      subject: 'Refund request',
      description: 'Customer wants money back',
      evidence: ['https://cdn.example/a.jpg'],
    });
    expect(r).toEqual({ issueId: 'iss_new' });
  });

  it('files against a return and defaults evidence to []', async () => {
    post.mockReturnValueOnce(ok({ issueId: 'iss_2' }));
    await createIssue({ returnId: 'ret_1', subject: 'S', description: 'D' });
    expect(post).toHaveBeenCalledWith('/retailer/issues', {
      kind: 'dispute',
      returnId: 'ret_1',
      subject: 'S',
      description: 'D',
      evidence: [],
    });
  });

  it('posts a reply with trimmed body and attachments', async () => {
    post.mockReturnValueOnce(ok({ messageId: 'm_1' }));
    await postIssueMessage('iss_1', '  here is the photo ', ['https://cdn.example/p.jpg']);
    expect(post).toHaveBeenCalledWith('/retailer/issues/iss_1/messages', {
      body: 'here is the photo',
      attachments: ['https://cdn.example/p.jpg'],
    });
  });

  it('hands back with an empty JSON body (a bodiless POST would be rejected)', async () => {
    post.mockReturnValueOnce(ok({ id: 'iss_1' }));
    await handBackIssue('iss_1');
    expect(post).toHaveBeenCalledWith('/retailer/issues/iss_1/hand-back', {});
  });

  it('surfaces the server error code and message (409 hand-back)', async () => {
    post.mockReturnValueOnce(
      Promise.reject({
        isAxiosError: true,
        response: {
          status: 409,
          data: { success: false, error: { code: 'invalid_state', message: 'Issue is not awaiting retailer' } },
        },
      }),
    );
    await expect(handBackIssue('iss_1')).rejects.toMatchObject({
      status: 409,
      code: 'invalid_state',
    });
  });
});

describe('issue helpers', () => {
  it('knows when the ball is in the store court', () => {
    expect(needsRetailerResponse({ status: 'open', awaitingParty: 'retailer' })).toBe(true);
    expect(needsRetailerResponse({ status: 'open', awaitingParty: 'admin' })).toBe(false);
    // a finished issue awaits no one, whatever the stale party says
    expect(needsRetailerResponse({ status: 'decided', awaitingParty: 'retailer' })).toBe(false);
    expect(needsRetailerResponse({ status: 'awaiting_retailer', awaitingParty: 'none' })).toBe(true);
  });

  it('labels statuses, decisions and parties, tolerating unknown values', () => {
    expect(issueStatusMeta('requested_evidence').label).toBe('Evidence requested');
    expect(issueStatusMeta('decided').tone).toBe('success');
    expect(issueStatusMeta('some_new_state').label).toBe('Some new state');
    expect(issueDecisionLabel('fresh_delivery')).toBe('Fresh delivery');
    expect(issueDecisionLabel(null)).toBe('—');
    expect(AWAITING_LABEL.admin).toBe('Trendzo');
  });
});
