/**
 * A variant always has a real price. A draft with no price yet saves as a listing WITHOUT a
 * variant; unfinished variant details stay on the listing for a later visit.
 */
jest.mock('../src/api/catalogManagement', () => ({
  createGroup: jest.fn(async () => ({ id: 'grp_1' })),
  createGroupVariant: jest.fn(async () => ({ id: 'var_1' })),
  createListing: jest.fn(async () => ({ id: 'lst_1' })),
  deleteVariant: jest.fn(),
  ensureDefaultVariantGroup: jest.fn(async () => ({ id: 'default_1' })),
  getListing: jest.fn(async () => ({ id: 'lst_1' })),
  patchVariant: jest.fn(async () => ({ id: 'var_1' })),
  setDefaultVariant: jest.fn(async () => ({ id: 'var_1' })),
  updateListing: jest.fn(async () => ({ id: 'lst_1' })),
}));

import * as api from '../src/api/catalogManagement';
import { commitProductDraft, validateProductDraft } from '../src/api/productCommit';
import { useProductDraft } from '../src/store/productDraft';

const draft = () => useProductDraft.getState();
const m = api as jest.Mocked<typeof api>;

beforeEach(() => {
  jest.clearAllMocks();
  draft().startCreate();
  draft().setBasics({ name: 'Shirt', categoryId: 'cat_1' });
});

describe('single product', () => {
  test('unpriced draft with nothing else is valid and saves the listing without a variant', async () => {
    expect(validateProductDraft()).toEqual([]);
    await commitProductDraft({ publish: false });
    expect(m.createListing).toHaveBeenCalledTimes(1);
    expect(m.setDefaultVariant).not.toHaveBeenCalled();
    expect(m.patchVariant).not.toHaveBeenCalled();
  });

  test.each([
    ['stock', { stock: '5' }],
    ['size', { size: 'M' }],
    ['sku', { sku: 'SKU-1' }],
    ['images', { imageUrls: ['https://x/a.png'] }],
  ])('variant details (%s) without a price are staged on the draft', async (_n, patch) => {
    draft().setSingle(patch);
    expect(validateProductDraft()).toEqual([]);
    await commitProductDraft({ publish: false });
    expect(m.createListing).toHaveBeenCalledWith(expect.objectContaining({
      draftVariantData: expect.objectContaining({ single: expect.objectContaining(patch) }),
    }));
  });

  test('an unfinished MRP remains in the draft', async () => {
    draft().setBasics({ baseMrp: '999' });
    expect(validateProductDraft()).toEqual([]);
    await commitProductDraft({ publish: false });
    expect(m.createListing).toHaveBeenCalledWith(expect.objectContaining({
      draftVariantData: expect.objectContaining({ baseMrp: '999' }),
    }));
    draft().setBasics({ basePrice: '999', baseMrp: '500' });
    expect(validateProductDraft()).toEqual([]);
  });

  test('a price of 0 is not a price', () => {
    draft().setBasics({ basePrice: '0' });
    draft().setSingle({ stock: '3' });
    expect(validateProductDraft()).toEqual([]);
  });

  test('a priced draft creates the default variant with a positive price in paise', async () => {
    draft().setBasics({ basePrice: '499', baseMrp: '699' });
    draft().setSingle({ stock: '4' });
    expect(validateProductDraft()).toEqual([]);
    await commitProductDraft({ publish: false });
    expect(m.setDefaultVariant).toHaveBeenCalledWith(
      'lst_1',
      expect.objectContaining({ pricePaise: 49900, compareAtPrice: 69900, stock: 4 }),
    );
  });
});

describe('colour variants', () => {
  const colourDraft = () => {
    draft().setVariantMode('color_size');
  };

  test('the untouched starter row is not a variant', async () => {
    colourDraft();
    expect(validateProductDraft()).toEqual([]);
    await commitProductDraft({ publish: false });
    expect(m.createGroupVariant).not.toHaveBeenCalled();
  });

  test('a sized row with no price is saved for later', async () => {
    colourDraft();
    const c = draft().colors[0]!;
    draft().updateColor(c.id, { name: 'Black' });
    draft().updateSizeRow(c.id, c.sizes[0]!.id, { size: 'M' });
    expect(validateProductDraft()).toEqual([]);
    await commitProductDraft({ publish: false });
    expect(m.createListing).toHaveBeenCalledWith(expect.objectContaining({
      draftVariantData: expect.objectContaining({ colors: expect.arrayContaining([
        expect.objectContaining({ name: 'Black' }),
      ]) }),
    }));
  });

  test('base price covers a row without its own; a row price overrides it', async () => {
    colourDraft();
    draft().setBasics({ basePrice: '500' });
    const c = draft().colors[0]!;
    draft().updateColor(c.id, { name: 'Black' });
    draft().updateSizeRow(c.id, c.sizes[0]!.id, { size: 'M' });
    draft().addSizeRow(c.id);
    const second = draft().colors[0]!.sizes[1]!;
    draft().updateSizeRow(c.id, second.id, { size: 'L', price: '650' });
    expect(validateProductDraft()).toEqual([]);
    await commitProductDraft({ publish: false });
    const prices = m.createGroupVariant.mock.calls.map((c2) => (c2[2] as { pricePaise: number }).pricePaise);
    expect(prices).toEqual([50000, 65000]);
  });
});
