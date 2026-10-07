import {
  clampDays,
  DEAD_STOCK_DEFAULT_DAYS,
  DEAD_STOCK_MAX_DAYS,
  deadStockCsv,
  lastSoldLabel,
  totalUnits,
} from '../src/utils/deadStock';
import { parseCsv } from '../src/utils/csv';
import type { DeadStockRow } from '../src/types/catalog';

const row = (over: Partial<DeadStockRow> = {}): DeadStockRow => ({
  variantId: 'var_1',
  listingId: 'lst_1',
  listingName: 'Linen Shirt',
  label: 'M / White',
  sku: 'LS-M-W',
  totalStock: 12,
  lastSoldAt: '2025-06-01T10:00:00.000Z',
  ...over,
});

describe('dead stock threshold', () => {
  it('defaults to 30 days and stays inside what the server accepts', () => {
    expect(clampDays('')).toBe(DEAD_STOCK_DEFAULT_DAYS);
    expect(clampDays('abc')).toBe(30);
    expect(clampDays('0')).toBe(1);
    expect(clampDays('45')).toBe(45);
    expect(clampDays('99999')).toBe(DEAD_STOCK_MAX_DAYS);
  });
});

describe('dead stock labels', () => {
  it('says never sold when there is no sale date', () => {
    expect(lastSoldLabel(null)).toBe('Never sold');
  });

  it('shows the date and how long ago', () => {
    const now = new Date('2025-07-16T10:00:00.000Z');
    expect(lastSoldLabel('2025-06-01T10:00:00.000Z', now)).toBe('Last sold 1 Jun 2025 (45 days ago)');
    expect(lastSoldLabel('2025-07-15T10:00:00.000Z', now)).toContain('1 day ago');
    expect(lastSoldLabel('2025-07-16T09:00:00.000Z', now)).toContain('today');
  });

  it('totals the units sitting', () => {
    expect(totalUnits([row({ totalStock: 3 }), row({ totalStock: 4 })])).toBe(7);
    expect(totalUnits([])).toBe(0);
  });
});

describe('dead stock CSV share', () => {
  it('has a header, one line per variant, a BOM for Excel, and survives awkward text', () => {
    const csv = deadStockCsv([
      row(),
      row({ listingName: 'Tee, "Classic"', sku: null, totalStock: 2, lastSoldAt: null }),
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(parseCsv(csv)).toEqual([
      ['product', 'variant', 'sku', 'stock', 'last_sold'],
      ['Linen Shirt', 'M / White', 'LS-M-W', '12', '2025-06-01'],
      ['Tee, "Classic"', 'M / White', '', '2', 'never'],
    ]);
  });

  it('is just the header when nothing is stuck', () => {
    expect(parseCsv(deadStockCsv([]))).toEqual([['product', 'variant', 'sku', 'stock', 'last_sold']]);
  });
});
