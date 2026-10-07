/**
 * Alert-settings contract: GET defaults are null-safe, and PUT (which REPLACES the row server-side)
 * always carries every field.
 */
jest.mock('../src/api/request', () => ({
  http: { get: jest.fn(), put: jest.fn(), post: jest.fn() },
  req: async (fn: () => Promise<{ data: unknown }>) => {
    const res = await fn();
    const d = res.data as { data?: unknown } | null;
    return d && typeof d === 'object' && 'data' in d ? d.data : d;
  },
  pollUnlessForbidden: () => false,
  retryUnlessClientError: () => false,
}));

import { getNotificationPrefs, normalizePrefs, prefsPayload, putNotificationPrefs } from '../src/api/notifications';
import { http } from '../src/api/request';
import { DASHBOARD_TILES, DEFAULT_NOTIFICATION_PREFS } from '../src/types/notifications';

const get = http.get as jest.Mock;
const put = http.put as jest.Mock;

describe('GET /retailer/notification-prefs', () => {
  it('fills a never-saved row (server returns dashboardTiles: null, language en-IN) from the app defaults', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: {
          pushEnabled: true,
          emailEnabled: true,
          smsEnabled: false,
          dailyDigestEnabled: false,
          language: 'en-IN',
          dashboardTiles: null,
        },
      },
    });
    const p = await getNotificationPrefs();
    expect(p.dashboardTiles).toEqual(DEFAULT_NOTIFICATION_PREFS.dashboardTiles);
    expect(p.language).toBe('en-IN'); // kept as the server sent it (lossless on the next PUT)
  });

  it('copes with a null/empty body and wrong-typed fields', () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(normalizePrefs({ pushEnabled: 'yes', dashboardTiles: 'sales', language: '' })).toEqual(
      DEFAULT_NOTIFICATION_PREFS,
    );
    expect(normalizePrefs({ pushEnabled: false, dashboardTiles: ['sales', 7, 'compliance'] })).toMatchObject({
      pushEnabled: false,
      dashboardTiles: ['sales', 'compliance'],
    });
  });
});

describe('PUT /retailer/notification-prefs (replaces everything)', () => {
  beforeEach(() => put.mockResolvedValue({ data: { success: true, data: {} } }));

  it('always sends the full object, never a partial patch', async () => {
    const full = {
      pushEnabled: false,
      emailEnabled: true,
      smsEnabled: true,
      dailyDigestEnabled: true,
      language: 'hi',
      dashboardTiles: ['orders', 'compliance'],
    } as const;
    await putNotificationPrefs({ ...full, dashboardTiles: [...full.dashboardTiles] });
    expect(put).toHaveBeenCalledWith('/retailer/notification-prefs', full);
    expect(Object.keys(put.mock.calls[0][1]).sort()).toEqual([
      'dailyDigestEnabled',
      'emailEnabled',
      'language',
      'dashboardTiles',
      'pushEnabled',
      'smsEnabled',
    ].sort());
  });

  it('toggling only push keeps every other setting from the last GET', () => {
    const fromGet = normalizePrefs({
      pushEnabled: true,
      emailEnabled: false,
      smsEnabled: true,
      dailyDigestEnabled: true,
      language: 'ta',
      dashboardTiles: ['inventory'],
    });
    const body = prefsPayload({ ...fromGet, pushEnabled: false });
    expect(body).toEqual({
      pushEnabled: false,
      emailEnabled: false,
      smsEnabled: true,
      dailyDigestEnabled: true,
      language: 'ta',
      dashboardTiles: ['inventory'],
    });
    // the payload is a copy, not the cached object
    expect(body.dashboardTiles).not.toBe(fromGet.dashboardTiles);
  });
});

describe('dashboard tiles', () => {
  it('lists the six tile ids the web portal uses', () => {
    expect(DASHBOARD_TILES.map((t) => t.id)).toEqual([
      'sales',
      'orders',
      'inventory',
      'top_products',
      'recent_products',
      'compliance',
    ]);
  });
});
