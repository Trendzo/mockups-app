/**
 * Money helpers. Backend money is ALWAYS integer paise (₹1 = 100 paise).
 * Display with formatPaise(); parse user rupee input back to paise on submit.
 */

/** 49999 -> "₹499.99". Whole rupees render without decimals: 50000 -> "₹500". */
export function formatPaise(paise: number | null | undefined): string {
  if (paise == null || Number.isNaN(paise)) return '—';
  const rupees = paise / 100;
  const hasFraction = paise % 100 !== 0;
  const formatted = rupees.toLocaleString('en-IN', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `₹${formatted}`;
}

/**
 * Parse a rupee string the user typed ("499.99", "1,299", "₹500") into integer
 * paise. Returns null when it isn't a valid positive amount.
 */
export function parseRupeesToPaise(input: string): number | null {
  if (input == null) return null;
  const cleaned = input.replace(/[₹,\s]/g, '').trim();
  if (cleaned === '') return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const rupees = Number(cleaned);
  if (!Number.isFinite(rupees)) return null;
  const paise = Math.round(rupees * 100);
  return paise;
}

/** Inverse of parse: paise -> plain editable rupee string ("499.99"). */
export function paiseToRupeeInput(paise: number | null | undefined): string {
  if (paise == null) return '';
  return (paise / 100).toString();
}
