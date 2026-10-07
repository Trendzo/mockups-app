/**
 * Date/time + id display helpers shared by the store-management screens.
 * Hand-rolled on purpose: Intl date formatting is unreliable on Hermes without
 * the Intl polyfill, so everything here builds strings from Date getters (local
 * time, which is IST on the retailer's device).
 */

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Parse an ISO instant; null when missing or invalid. */
export function parseDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "9:05 AM" */
export function formatTime(iso?: string | null): string {
  const d = parseDate(iso);
  if (!d) return '—';
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${pad2(d.getMinutes())} ${ampm}`;
}

/** "12 Aug 2025" */
export function formatDate(iso?: string | null): string {
  const d = parseDate(iso);
  if (!d) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Mon, 12 Aug" */
export function formatDayDate(iso?: string | null): string {
  const d = parseDate(iso);
  if (!d) return '—';
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "12 Aug, 9:05 AM" (year added when it isn't the current one). */
export function formatDateTime(iso?: string | null): string {
  const d = parseDate(iso);
  if (!d) return '—';
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}, ${formatTime(iso)}`;
}

/** "just now" · "5m ago" · "3h ago" · "Yesterday" · "12 Aug" */
export function timeAgo(iso?: string | null): string {
  const d = parseDate(iso);
  if (!d) return '—';
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24 && isSameDay(d, new Date())) return `${hrs}h ago`;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return formatDayDate(iso);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Local calendar date → "2025-08-12" (no UTC shift, unlike toISOString). */
export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "2025-08-12" → local midnight Date. */
export function fromYmd(ymd: string): Date {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** "2025-08-12" → "Tue, 12 Aug 2025" */
export function formatYmd(ymd?: string | null): string {
  if (!ymd) return '—';
  const d = fromYmd(ymd);
  if (Number.isNaN(d.getTime())) return ymd;
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Today as "2025-08-12" in local time. */
export const todayYmd = () => toYmd(new Date());

/** "14:30" (24h wall clock) → "2:30 PM". Passes through anything unparseable. */
export function formatHm(hm?: string | null): string {
  if (!hm) return '—';
  const m = /^(\d{1,2}):(\d{2})/.exec(hm);
  if (!m) return hm;
  let h = Number(m[1]);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ampm}`;
}

/** "14:30" → minutes since midnight (NaN when unparseable). */
export function hmToMinutes(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(hm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/** Minutes since midnight → "14:30". */
export function minutesToHm(total: number): string {
  const t = ((total % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`;
}

/**
 * Compact, human-readable reference for long server ids ("ord_01j9xk2m…" →
 * "#01J9XK2M") — the same 8 characters the web portal shows, so a retailer can
 * match an order between the app and the portal.
 */
export function shortRef(id?: string | null): string {
  if (!id) return '—';
  const body = id.includes('_') ? id.slice(id.indexOf('_') + 1) : id;
  return `#${body.slice(0, 8).toUpperCase()}`;
}

/** "1 item" / "3 items" */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "snake_case_status" → "Snake case status" */
export function humanize(s?: string | null): string {
  if (!s) return '—';
  const t = s.replace(/[_-]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
