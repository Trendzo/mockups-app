import { useProductDraft } from '../src/store/productDraft';
import { listingCreateBody, listingUpdateBody } from '../src/api/listingPayload';
import type { Listing } from '../src/types/catalog';

const copy = {
  name: 'Olive Cotton Kurta',
  description: 'A relaxed olive kurta.',
  descriptionLong: 'Easy everyday kurta.\n\n• Soft cotton',
};

const draft = () => useProductDraft.getState();

const listing = (descriptionLong: string | null) =>
  ({
    id: 'lst_1',
    name: 'Existing',
    status: 'draft',
    categoryId: 'cat_1',
    gender: 'her',
    listingPolicy: 'return',
    description: 'Short',
    descriptionLong,
    galleryUrls: [],
    variants: [],
    variantGroups: [],
  }) as unknown as Listing;

beforeEach(() => draft().startCreate());

test('fills blank fields, reports them, and marks them as AI-drafted', () => {
  expect(draft().applyAiCopy(copy)).toEqual(['name', 'description', 'descriptionLong']);
  expect(draft().name).toBe(copy.name);
  expect(draft().descriptionLong).toBe(copy.descriptionLong);
  expect(draft().aiFilled).toEqual({ name: true, description: true, descriptionLong: true });
});

test('never overwrites existing text - retailer-typed OR an earlier AI fill', () => {
  draft().setBasics({ name: 'My Kurta' });
  expect(draft().applyAiCopy(copy)).toEqual(['description', 'descriptionLong']);
  expect(draft().name).toBe('My Kurta');

  // A later generation (e.g. another photo) keeps the first AI fill.
  const newer = { ...copy, description: 'A different photo.' };
  expect(draft().applyAiCopy(newer)).toEqual([]);
  expect(draft().description).toBe(copy.description);
  expect(draft().aiCopy).toEqual(newer); // still one tap away

  draft().acceptAiSuggestion('description');
  expect(draft().description).toBe('A different photo.');
});

test('editing clears the AI marker; null copy is a no-op', () => {
  draft().applyAiCopy(copy);
  draft().setDetails({ description: 'Edited' });
  expect(draft().aiFilled.description).toBeUndefined();
  expect(draft().aiFilled.descriptionLong).toBe(true);
  expect(draft().applyAiCopy(null)).toEqual([]);
  expect(draft().description).toBe('Edited');
});

test('startCreate resets AI + long-description state', () => {
  draft().applyAiCopy(copy);
  draft().startCreate();
  expect(draft().aiCopy).toBeNull();
  expect(draft().aiFilled).toEqual({});
  expect(draft().descriptionLongDirty).toBe(false);
  expect(draft().descriptionLongEditable).toBe(true);
});

test('edit: simple HTML becomes editable text and is NOT re-sent unless changed', () => {
  draft().startEdit(listing('<p>Intro</p><ul><li>a</li><li>b</li></ul>'));
  expect(draft().descriptionLong).toBe('Intro\n\n• a\n• b');
  expect(draft().descriptionLongEditable).toBe(true);
  expect('descriptionLong' in listingUpdateBody(draft())).toBe(false);

  draft().setDetails({ descriptionLong: 'Intro\n\n• a' });
  expect(listingUpdateBody(draft()).descriptionLong).toBe('Intro\n\n• a');

  draft().setDetails({ descriptionLong: '   ' });
  expect(listingUpdateBody(draft()).descriptionLong).toBeNull(); // explicit clear
});

test('edit: rich web HTML is read-only - no edits, no AI fill, never sent', () => {
  draft().startEdit(listing('<p>Rich <strong>bold</strong></p>'));
  expect(draft().descriptionLongEditable).toBe(false);
  expect(draft().descriptionLong).toBe('Rich bold');

  draft().setDetails({ descriptionLong: 'overwrite attempt', hsn: '6109' });
  expect(draft().descriptionLong).toBe('Rich bold');
  expect(draft().hsn).toBe('6109');

  draft().acceptAiSuggestion('descriptionLong');
  expect(draft().descriptionLong).toBe('Rich bold');
  expect('descriptionLong' in listingUpdateBody(draft())).toBe(false);
});

test('an AI fill of the long description on an edit counts as a change', () => {
  draft().startEdit(listing(null));
  draft().applyAiCopy(copy);
  expect(listingUpdateBody(draft()).descriptionLong).toBe(copy.descriptionLong);
});

test('create always sends the plain long description', () => {
  draft().applyAiCopy(copy);
  expect(listingCreateBody(draft()).descriptionLong).toBe(copy.descriptionLong);
});
