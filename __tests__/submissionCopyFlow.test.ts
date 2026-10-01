/**
 * End-to-end (app side) for AI copy: a real submission reply from the server, through
 * the API layer's normalisation, into the product draft exactly as ReviewResults'
 * "Approve → Add to product" does it.
 */
// The auth store pulls in React Native (query client); only the token getter is used here.
jest.mock('../src/store/auth', () => ({
  useAuth: { getState: () => ({ token: null }), setState: () => {}, subscribe: () => () => {} },
}));

// Native image compression is irrelevant here: uploads are mocked, files pass through.
jest.mock('../src/utils/image', () => ({ toFormFile: async (f: unknown) => f }));

jest.mock('../src/api/client', () => {
  const actual = jest.requireActual('../src/api/client');
  return {
    ...actual,
    isMock: () => false,
    getJson: jest.fn(),
    postJson: jest.fn(),
    postMultipart: jest.fn(),
  };
});

import { getJson, postJson, postMultipart } from '../src/api/client';
import { createSubmission, getSubmission } from '../src/api/catalog';
import { useProductDraft } from '../src/store/productDraft';

// Shape of a live reply from the AI catalog (abridged URLs; fields as the server sends).
const ROW = {
  id: 'aic_9dbbf97a37c407409511265b6b368d6c',
  storeId: 'str_1',
  listingId: null,
  mode: 'without_model',
  prompt: '',
  status: 'ready_for_review',
  referenceImageUrls: ['https://closetx-media.synquic.tech/trendzo-media/uploads/a.jpg'],
  rawPhotos: ['https://closetx-media.synquic.tech/trendzo-media/uploads/a.jpg'],
  outputUrls: [
    'https://closetx-media.synquic.tech/trendzo-media/ai-catalog-beta/1.png',
    'https://closetx-media.synquic.tech/trendzo-media/ai-catalog-beta/2.png',
  ],
  errorMessage: null,
  copy: {
    name: "Men's Light Grey Geometric Print Casual Shirt",
    model: 'gemini-flash-latest',
    description: 'Smart and versatile, this light grey casual shirt features an all-over geometric pattern.',
    generatedAt: '2026-10-01T12:02:19.903Z',
    descriptionLong: 'Upgrade your daily wardrobe.\n\n• Fabric: Lightweight woven fabric',
  },
  at: '2026-10-01T12:02:16.000Z',
};

const draft = () => useProductDraft.getState();

/** What ReviewResults.onApprove does after the accept decision succeeds. */
function approve(submission: { copy?: unknown }, urls: string[]) {
  const d = useProductDraft.getState();
  if (d.pendingMockup) {
    d.addGalleryUrls(urls);
    d.setPendingMockup(false);
  } else {
    d.startCreate();
    d.addGalleryUrls(urls);
  }
  return d.applyAiCopy(submission.copy as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  draft().startCreate();
});

test('GET reply → draft: name and both descriptions are prefilled', async () => {
  (getJson as jest.Mock).mockResolvedValue({ success: true, data: ROW });
  const sub = await getSubmission(ROW.id);
  expect(sub.copy?.name).toBe(ROW.copy.name);

  const filled = approve(sub, ROW.outputUrls);
  expect(filled).toEqual(['name', 'description', 'descriptionLong']);
  expect(draft().name).toBe(ROW.copy.name);
  expect(draft().description).toBe(ROW.copy.description);
  expect(draft().descriptionLong).toBe(ROW.copy.descriptionLong);
  expect(draft().gallery).toEqual(ROW.outputUrls);
});

test('POST reply (fresh generation) carries the copy through too', async () => {
  (postMultipart as jest.Mock).mockResolvedValue({ data: { url: ROW.rawPhotos[0] } });
  (postJson as jest.Mock).mockResolvedValue({ success: true, data: ROW });
  const sub = await createSubmission({
    mode: 'without_model',
    apparel: { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' },
  } as never);
  approve(sub, ROW.outputUrls);
  expect(draft().description).toBe(ROW.copy.description);
});

test('detour from the wizard keeps typed text and fills only the blank fields', async () => {
  draft().setBasics({ name: 'My own name' });
  draft().setPendingMockup(true);
  (getJson as jest.Mock).mockResolvedValue({ success: true, data: ROW });
  const filled = approve(await getSubmission(ROW.id), ROW.outputUrls);
  expect(filled).toEqual(['description', 'descriptionLong']);
  expect(draft().name).toBe('My own name');
  expect(draft().aiCopy?.name).toBe(ROW.copy.name); // still one tap away
});
