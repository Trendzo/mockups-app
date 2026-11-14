jest.mock('../src/api/client', () => ({
  getJson: jest.fn(),
  postJson: jest.fn(),
  unwrapEnvelope: (payload: { data?: unknown }) => payload?.data ?? payload,
}));
jest.mock('../src/api/auth', () => ({
  authHttp: { get: jest.fn(), post: jest.fn() },
  normalizeAuthError: (error: unknown) => error,
}));
jest.mock('../src/utils/image', () => ({ toFormFile: jest.fn() }));

import { authHttp } from '../src/api/auth';
import { getJson, postJson } from '../src/api/client';
import { checkIdentity, submitApplication, uploadDocument } from '../src/api/onboarding';
import { useOnboarding } from '../src/store/onboarding';
import type { ApplicationInput } from '../src/types/onboarding';

const publicHttp = authHttp as unknown as { get: jest.Mock; post: jest.Mock };

beforeEach(() => {
  publicHttp.get.mockReset();
  publicHttp.post.mockReset();
  (getJson as jest.Mock).mockReset();
  (postJson as jest.Mock).mockReset();
});

it('checks signup identity through the same service as login, without the protected API client', async () => {
  publicHttp.get.mockResolvedValue({ data: { data: { accountExists: false } } });
  await checkIdentity(' Owner@Example.com ', '+919876543210');
  expect(publicHttp.get).toHaveBeenCalledWith('/applications/check-identity', {
    params: { email: 'owner@example.com', phone: '+919876543210' },
  });
  expect(getJson).not.toHaveBeenCalled();
});

it('submits consent and application details through the signup service', async () => {
  publicHttp.post.mockResolvedValue({ data: { data: { id: 'app_1', status: 'pending' } } });
  const input = {
    legalName: ' Test Store ', gstin: '27ABCDE1234F1Z5', ownerName: ' Test Owner ',
    ownerEmail: ' Owner@Example.com ', ownerPhone: '+919876543210',
    addressLine: ' Test address ', pincode: '400001', stateCode: '27',
    acceptLegal: true,
  } as ApplicationInput;
  await submitApplication(input);
  expect(publicHttp.post).toHaveBeenCalledWith('/applications', expect.objectContaining({
    legalName: 'Test Store', ownerEmail: 'owner@example.com', acceptLegal: true,
  }));
  expect(postJson).not.toHaveBeenCalled();
});

it('uses a phone-verified applicant token only for the scoped document endpoint', async () => {
  useOnboarding.getState().setUploadToken('signup-upload-token');
  publicHttp.post.mockResolvedValue({ data: { data: { url: 'https://example.com/photo.jpg' } } });
  await uploadDocument({ uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg' });
  expect(publicHttp.post).toHaveBeenCalledWith(
    '/uploads/onboarding', expect.any(FormData),
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer signup-upload-token' }),
    }),
  );
  useOnboarding.getState().setUploadToken(null);
});
