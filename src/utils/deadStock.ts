import { toCsv } from './csv';
import { formatDate, parseDate } from './format';
import type { DeadStockRow } from '../types/catalog';

/** Server bounds for `daysWithoutSale` (the web portal defaults to 30). */
export const DEAD_STOCK_DEFAULT_DAYS = 30;
export const DEAD_STOCK_MAX_DAYS = 3650;
/** The server's `limit` cap: a full page means there is more. */
export const DEAD_STOCK_LIMIT = 200;

/** The typed threshold as a valid day count (blank or junk -> the default, never < 1). */
export function clampDays(text: string): number {
  const n = Number.parseInt(text, 10);
  if (!Number.isFinite(n)) return DEAD_STOCK_DEFAULT_DAYS;
  return Math.min(DEAD_STOCK_MAX_DAYS, Math.max(1, n));
}

/** "Never sold" or "Last sold 12 Aug 2025 (45 days ago)". */
export function lastSoldLabel(iso: string | null, now: Date = new Date()): string {
  const d = parseDate(iso);
  if (!d) return 'Never sold';
  const days = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86_400_000));
  const ago = days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
  return `Last sold ${formatDate(iso)} (${ago})`;
}

/** Units sitting in the listed variants. */
export const totalUnits = (rows: ReadonlyArray<DeadStockRow>) =>
  rows.reduce((n, r) => n + (Number(r.totalStock) || 0), 0);

/** The CSV a retailer shares: one line per stuck variant, biggest pile first (as served). */
export function deadStockCsv(rows: ReadonlyArray<DeadStockRow>): string {
  return toCsv(
    [
      ['product', 'variant', 'sku', 'stock', 'last_sold'],
      ...rows.map((r) => [
        r.listingName,
        r.label,
        r.sku ?? '',
        r.totalStock,
        r.lastSoldAt ? r.lastSoldAt.slice(0, 10) : 'never',
      ]),
    ],
    { bom: true },
  );
}
