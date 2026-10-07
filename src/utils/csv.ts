/**
 * Minimal pure-JS CSV reader/writer (no native deps, safe under jest).
 *
 * Reader: RFC-4180-ish, matching the web portal's inventory parser - commas
 * separate fields, double quotes wrap fields containing commas / quotes /
 * newlines, `""` inside a quoted field is a literal quote. On top of that it
 * strips one leading UTF-8 BOM (Excel / Numbers add it) and accepts CRLF, LF and
 * a bare CR as record separators.
 */

const BOM = 0xfeff;

/** Split CSV text into records of raw (unparsed, untrimmed) cells. */
export function parseCsv(input: string): string[][] {
  let text = input;
  // Strip exactly one BOM: without this the first header cell becomes "﻿sku".
  if (text.charCodeAt(0) === BOM) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      // CRLF is one separator, not two.
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  // Trailing record without a final newline.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** One cell, quoted only when it has to be. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value == null) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Serialise records to CSV text (LF line ends, no trailing newline). Pass
 * `bom: true` for files people open in Excel so non-ASCII text survives.
 */
export function toCsv(
  rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>,
  opts: { bom?: boolean } = {},
): string {
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\n');
  return opts.bom ? `﻿${body}` : body;
}
