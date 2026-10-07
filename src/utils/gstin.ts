/**
 * GSTIN structure: 2-digit state code, the holder's 10-character PAN (5 letters, 4 digits, 1 letter),
 * an entity number (1-9 / A-Z), a fixed "Z", and a check character.
 *
 * It matters on the counter: the server decides IGST vs CGST + SGST from the FIRST TWO characters
 * (buyer state ≠ store state → IGST), so a mistyped prefix would silently flip the invoice's tax split.
 */
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Upper-cased, whitespace removed (what gets stored and sent). */
export const normalizeGstin = (s: string | null | undefined): string =>
  (s ?? '').replace(/\s+/g, '').toUpperCase();

export const isValidGstin = (s: string | null | undefined): boolean => GSTIN_RE.test(normalizeGstin(s));

/** Error text for the field, or null when the value is a well-formed GSTIN. */
export function gstinError(s: string | null | undefined): string | null {
  const g = normalizeGstin(s);
  if (!g) return 'Enter the customer GSTIN';
  if (g.length !== 15) return 'A GSTIN is 15 characters';
  if (!/^[0-9]{2}/.test(g)) return 'A GSTIN starts with the 2-digit state code (e.g. 27)';
  return GSTIN_RE.test(g) ? null : 'That GSTIN doesn’t look right — check it against the customer’s certificate';
}
