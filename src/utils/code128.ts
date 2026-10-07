/**
 * Minimal Code 128 (Code Set B) → SVG string. No dependency; same encoder the web portal prints with,
 * so a label printed from the phone scans exactly like one printed from the counter PC.
 *
 * Set B covers ASCII 32–127 (digits, letters, common punctuation) — enough for retail SKUs and
 * EAN/UPC numbers. (Set C would be denser for all-digit codes but scans identically.)
 */

// Bar/space module widths for symbol values 0–106 (the canonical Code 128 table). Each is 6 modules
// (bar, space, bar, space, bar, space) except the stop symbol (106), which is 7.
const PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const STOP = 106;
/** Quiet zone each side, in modules (the spec asks for 10). */
const QUIET = 10;

/** Characters Code 128 set B can't carry are dropped (never thrown), matching the web encoder. */
export function code128Printable(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const v = value.charCodeAt(i) - 32;
    if (v >= 0 && v <= 94) out += value[i];
  }
  return out;
}

/** Module-width digits for the whole symbol (start + data + checksum + stop). */
export function code128Modules(value: string): string {
  const codes: number[] = [START_B];
  let checksum = START_B;
  const clean = code128Printable(value);
  for (let i = 0; i < clean.length; i++) {
    const v = clean.charCodeAt(i) - 32;
    codes.push(v);
    checksum += v * (i + 1);
  }
  codes.push(checksum % 103);
  codes.push(STOP);
  return codes.map((c) => PATTERNS[c]).join('');
}

/**
 * `value` as a Code 128 SVG. The viewBox is in modules (quiet zones included) so CSS can scale it to
 * any label width; `height` is the bar height in viewBox units.
 */
export function code128Svg(value: string, opts: { height?: number } = {}): string {
  const height = opts.height ?? 40;
  const widths = code128Modules(value);
  let x = QUIET;
  let isBar = true;
  const bars: string[] = [];
  for (const ch of widths) {
    const w = Number(ch);
    if (isBar) bars.push(`M${x} 0h${w}v${height}h-${w}z`);
    x += w;
    isBar = !isBar;
  }
  const total = x + QUIET;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height}" preserveAspectRatio="none" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${height}" fill="#fff"/><path d="${bars.join('')}" fill="#000"/></svg>`
  );
}
