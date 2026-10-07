import { csvCell, parseCsv, toCsv } from '../src/utils/csv';

describe('parseCsv', () => {
  it('splits plain rows and cells', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps commas, newlines and doubled quotes inside quoted cells', () => {
    const rows = parseCsv('name,note\n"Shirt, linen","He said ""hi""\nthen left"\n');
    expect(rows).toEqual([
      ['name', 'note'],
      ['Shirt, linen', 'He said "hi"\nthen left'],
    ]);
  });

  it('treats CRLF as one record separator, and a bare CR as one too', () => {
    expect(parseCsv('a,b\r\n1,2\r\n3,4\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(parseCsv('a,b\r1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips exactly one leading BOM so the first header is usable', () => {
    const rows = parseCsv('﻿sku,stock\nA,1');
    expect(rows[0][0]).toBe('sku');
    // A second BOM is data, not ours to eat.
    expect(parseCsv('﻿﻿sku')[0][0]).toBe('﻿sku');
  });

  it('flushes the last record when there is no trailing newline, and none when there is', () => {
    expect(parseCsv('a,b\n1,2')).toHaveLength(2);
    expect(parseCsv('a,b\n1,2\n')).toHaveLength(2);
  });

  it('keeps blank lines as one empty cell so row numbers stay aligned with the file', () => {
    expect(parseCsv('a\n\nb')).toEqual([['a'], [''], ['b']]);
  });

  it('keeps empty cells and a trailing empty cell', () => {
    expect(parseCsv('a,,c,\n')).toEqual([['a', '', 'c', '']]);
  });

  it('returns nothing for empty text', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('csvCell / toCsv', () => {
  it('quotes only when needed', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "x"')).toBe('"say ""x"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(0)).toBe('0');
  });

  it('round-trips through parseCsv, with an optional BOM', () => {
    const rows = [
      ['sku', 'note'],
      ['A-1', 'comma, "quote" and\nnewline'],
      ['', '0'],
    ];
    const csv = toCsv(rows, { bom: true });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(parseCsv(csv)).toEqual(rows);
    expect(toCsv(rows).charCodeAt(0)).not.toBe(0xfeff);
  });
});
