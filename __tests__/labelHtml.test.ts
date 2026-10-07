/**
 * Price-tag labels: sizes in mm, the QR payload the Register scanner understands, the fields the
 * cashier toggles, copies, and the settings that are remembered between sessions.
 */
import {
  DEFAULT_LABEL_CONFIG,
  LABEL_SIZES,
  LabelConfig,
  LabelPick,
  buildLabelSheet,
  clampCopies,
  humanCode,
  isLabelSize,
  mergeLabelConfig,
  qrPayload,
} from '../src/utils/labelHtml';
import { code128Modules, code128Printable, code128Svg } from '../src/utils/code128';
import qrcode from 'qrcode-generator';
import { qrSvg } from '../src/utils/qrSvg';

const pick = (extra: Partial<LabelPick> = {}): LabelPick => ({
  variantId: 'var_01HXYZ',
  listingId: 'lst_77',
  name: 'Cotton Kurta',
  attributesLabel: 'M / Blue',
  sku: 'KUR-M-BL',
  barcode: '8901234567890',
  pricePaise: 799_00,
  compareAtPaise: 1299_00,
  copies: 1,
  ...extra,
});

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('label sizes', () => {
  it('are the three stock tag sizes, in mm', () => {
    expect(LABEL_SIZES.sm).toMatchObject({ w: 38, h: 25 });
    expect(LABEL_SIZES.md).toMatchObject({ w: 50, h: 25 });
    expect(LABEL_SIZES.lg).toMatchObject({ w: 65, h: 38 });
  });

  it('are applied to each tag as mm dimensions', () => {
    for (const [key, dim] of Object.entries(LABEL_SIZES)) {
      const { html } = buildLabelSheet({ picks: [pick()], size: key as 'sm' | 'md' | 'lg', config: DEFAULT_LABEL_CONFIG });
      expect(html).toContain(`width: ${dim.w}mm; height: ${dim.h}mm`);
    }
  });
});

describe('the code on the tag', () => {
  it('the QR encodes cx:v:<variantId> — what the Register scanner resolves', () => {
    expect(qrPayload('var_01HXYZ')).toBe('cx:v:var_01HXYZ');
    const { html } = buildLabelSheet({ picks: [pick()], size: 'md', config: DEFAULT_LABEL_CONFIG });
    expect(html).toContain(qrSvg('cx:v:var_01HXYZ'));
    expect(html).toContain('class="label qr"');
  });

  it('different variants get different QR codes', () => {
    expect(qrSvg('cx:v:a')).not.toBe(qrSvg('cx:v:b'));
  });

  it('qrSvg is a compact, self-contained SVG with a quiet zone', () => {
    const svg = qrSvg('cx:v:var_01HXYZ');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 ');
    expect(svg).toContain('<path d="M');
    // far smaller than the library's one-path-per-module output (~10KB for this payload)
    expect(svg.length).toBeLessThan(4000);
    // 15 characters → a version-2 symbol (25 modules) + a 2-module quiet zone on each side
    expect(svg).toContain('viewBox="0 0 29 29"');
  });

  it('qrSvg draws exactly the modules the QR library computed (run-merging is lossless)', () => {
    const text = 'cx:v:var_01HXYZ';
    const svg = qrSvg(text);
    const qr = qrcode(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    const dark = new Set<string>();
    for (const m of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      const [x, y, len] = [Number(m[1]), Number(m[2]), Number(m[3])];
      for (let i = 0; i < len; i++) dark.add(`${y - 2},${x - 2 + i}`);
    }
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) expect(dark.has(`${r},${c}`)).toBe(qr.isDark(r, c));
    }
  });

  it('barcode mode prints Code 128 of the barcode, falling back to the SKU', () => {
    const cfg: LabelConfig = { ...DEFAULT_LABEL_CONFIG, codeType: 'barcode' };
    const a = buildLabelSheet({ picks: [pick()], size: 'md', config: cfg });
    expect(a.html).toContain(code128Svg('8901234567890', { height: 30 }));
    expect(a.html).toContain('class="label barcode"');
    const b = buildLabelSheet({ picks: [pick({ barcode: null })], size: 'md', config: cfg });
    expect(b.html).toContain(code128Svg('KUR-M-BL', { height: 30 }));
    expect(humanCode(pick({ barcode: null }))).toBe('KUR-M-BL');
    expect(humanCode(pick({ barcode: null, sku: null }))).toBe('');
  });

  it('barcode mode skips (and reports) a product with no barcode or SKU, printing the rest', () => {
    const cfg: LabelConfig = { ...DEFAULT_LABEL_CONFIG, codeType: 'barcode' };
    const sheet = buildLabelSheet({
      picks: [pick({ name: 'Plain Tee', barcode: null, sku: null }), pick({ variantId: 'var_2', name: 'Kurta' })],
      size: 'md',
      config: cfg,
    });
    expect(sheet.skipped).toEqual(['Plain Tee']);
    expect(sheet.count).toBe(1);
    expect(sheet.html).not.toContain('Plain Tee');
    // QR mode never skips: the variant id is always there
    const qr = buildLabelSheet({ picks: [pick({ barcode: null, sku: null })], size: 'md', config: DEFAULT_LABEL_CONFIG });
    expect(qr.skipped).toEqual([]);
    expect(qr.count).toBe(1);
  });

  it('Code 128 matches the web encoder: start B + data + checksum + stop', () => {
    // "A": start(104)=… value 33; checksum = (104 + 33*1) % 103 = 34
    const modules = code128Modules('A');
    // 3 symbols of 6 modules (start, 'A', checksum) + the 7-module stop pattern
    expect(modules.length).toBe(6 * 3 + 7);
    expect(modules.split('').reduce((s, d) => s + Number(d), 0)).toBe(11 * 3 + 13);
    expect(modules.startsWith('211214')).toBe(true); // start code B
    expect(modules.endsWith('2331112')).toBe(true); // stop
    // exact symbol sequence: start B, 'A' (value 33), checksum 34, stop
    expect(modules).toBe('211214' + '111323' + '131123' + '2331112');
    // a longer code: checksum = (104 + Σ value × position) mod 103
    const value = '12'.split('').reduce((sum, ch, i) => sum + (ch.charCodeAt(0) - 32) * (i + 1), 104) % 103;
    expect(code128Modules('12').length).toBe(6 * 4 + 7);
    expect(value).toBe((104 + 17 * 1 + 18 * 2) % 103);
    expect(code128Printable('A₹é1')).toBe('A1');
    expect(code128Svg('A')).toContain('viewBox="0 0 ');
  });
});

describe('what shows on the tag', () => {
  const fields = (cfg: Partial<LabelConfig>, p: Partial<LabelPick> = {}) =>
    buildLabelSheet({ picks: [pick(p)], size: 'md', config: { ...DEFAULT_LABEL_CONFIG, ...cfg } }).html;

  it('defaults: name, variant, price and MRP — no SKU / ID / code text', () => {
    const html = fields({});
    expect(html).toContain('Cotton Kurta');
    expect(html).toContain('M / Blue');
    expect(html).toContain('₹799');
    expect(html).toContain('₹1,299');
    expect(html).not.toContain('KUR-M-BL');
    expect(html).not.toContain('lst_77');
    expect(html).not.toContain('>Code<');
  });

  it('each toggle turns its field on / off', () => {
    expect(fields({ showName: false })).not.toContain('Cotton Kurta');
    expect(fields({ showVariant: false })).not.toContain('M / Blue');
    expect(fields({ showPrice: false })).not.toContain('₹799');
    expect(fields({ showPrice: false })).not.toContain('₹1,299');
    expect(fields({ showCompareAt: false })).not.toContain('₹1,299');
    expect(fields({ showCompareAt: false })).toContain('₹799');
    expect(fields({ showSku: true })).toContain('KUR-M-BL');
    expect(fields({ showProductId: true })).toContain('lst_77');
    expect(fields({ showCode: true })).toContain('8901234567890');
  });

  it('MRP only shows when it is actually higher than the price', () => {
    expect(fields({}, { compareAtPaise: null })).not.toContain('MRP');
    expect(fields({}, { compareAtPaise: 799_00 })).not.toContain('MRP');
    expect(fields({}, { compareAtPaise: 500_00 })).not.toContain('MRP');
    expect(fields({})).toContain('MRP');
  });

  it('escapes product text', () => {
    const html = fields({}, { name: 'Tee <b>&</b>' });
    expect(html).toContain('Tee &lt;b&gt;&amp;&lt;/b&gt;');
    expect(html).not.toContain('<b>');
  });
});

describe('copies', () => {
  it('prints one tag per copy, per product', () => {
    const sheet = buildLabelSheet({
      picks: [pick({ copies: 3 }), pick({ variantId: 'var_2', name: 'Shirt', copies: 2 })],
      size: 'sm',
      config: DEFAULT_LABEL_CONFIG,
    });
    expect(sheet.count).toBe(5);
    expect(count(sheet.html, '<div class="label qr">')).toBe(5);
    expect(count(sheet.html, 'Shirt')).toBe(2);
  });

  it('clamps copies to 1…200', () => {
    expect(clampCopies(0)).toBe(1);
    expect(clampCopies(-4)).toBe(1);
    expect(clampCopies(7.9)).toBe(7);
    expect(clampCopies(5000)).toBe(200);
    expect(clampCopies(NaN)).toBe(1);
    expect(buildLabelSheet({ picks: [pick({ copies: 0 })], size: 'md', config: DEFAULT_LABEL_CONFIG }).count).toBe(1);
  });

  it('an empty selection is an empty sheet', () => {
    expect(buildLabelSheet({ picks: [], size: 'md', config: DEFAULT_LABEL_CONFIG }).count).toBe(0);
  });
});

describe('remembered settings', () => {
  it('fall back to the defaults when nothing (or junk) was saved', () => {
    expect(mergeLabelConfig(undefined)).toEqual(DEFAULT_LABEL_CONFIG);
    expect(mergeLabelConfig('nope')).toEqual(DEFAULT_LABEL_CONFIG);
    expect(mergeLabelConfig({ codeType: 'hologram', showName: 'yes', bogus: 1 })).toEqual(DEFAULT_LABEL_CONFIG);
  });

  it('keep only known keys of the right type', () => {
    expect(mergeLabelConfig({ codeType: 'barcode', showSku: true, showName: false, extra: 1 })).toEqual({
      ...DEFAULT_LABEL_CONFIG,
      codeType: 'barcode',
      showSku: true,
      showName: false,
    });
  });

  it('knows a valid size key', () => {
    expect(isLabelSize('md')).toBe(true);
    expect(isLabelSize('xl')).toBe(false);
    expect(isLabelSize(undefined)).toBe(false);
  });
});
