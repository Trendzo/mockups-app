import { isRetiredBaseUrl, replaceRetiredBaseUrls } from '../src/utils/baseUrl';

const DEFAULTS = {
  baseUrl: 'https://api.trendzonow.com/api/v1',
  authBaseUrl: 'https://api.trendzonow.com/api/v1',
};

describe('isRetiredBaseUrl', () => {
  it('matches the retired CloudFront and Render hosts', () => {
    expect(isRetiredBaseUrl('https://d208iwmfjcjzy.cloudfront.net/api/v1')).toBe(true);
    expect(isRetiredBaseUrl(' https://D208IWMFJCJZY.cloudfront.net/api/v1/ ')).toBe(true);
    expect(isRetiredBaseUrl('https://backend-qpmx.onrender.com/api/v1')).toBe(true);
    expect(isRetiredBaseUrl('http://trendzo-backend-86wn.onrender.com:443/api/v1')).toBe(true);
  });

  it('leaves current, custom and malformed values alone', () => {
    expect(isRetiredBaseUrl('https://api.trendzonow.com/api/v1')).toBe(false);
    expect(isRetiredBaseUrl('http://localhost:3099/api/v1')).toBe(false);
    expect(isRetiredBaseUrl('https://evil.com/d208iwmfjcjzy.cloudfront.net')).toBe(false);
    expect(isRetiredBaseUrl('not a url')).toBe(false);
    expect(isRetiredBaseUrl(undefined)).toBe(false);
  });
});

describe('replaceRetiredBaseUrls', () => {
  it('moves a persisted retired URL to the current default and keeps other fields', () => {
    const out = replaceRetiredBaseUrls(
      {
        baseUrl: 'https://d208iwmfjcjzy.cloudfront.net/api/v1',
        authBaseUrl: 'https://backend-qpmx.onrender.com/api/v1',
        mock: false,
      },
      DEFAULTS,
    );
    expect(out).toEqual({ ...DEFAULTS, mock: false });
  });

  it('keeps a custom dev URL', () => {
    const persisted = {
      baseUrl: 'http://localhost:3099/api/v1',
      authBaseUrl: 'https://d208iwmfjcjzy.cloudfront.net/api/v1',
    };
    expect(replaceRetiredBaseUrls(persisted, DEFAULTS)).toEqual({
      baseUrl: 'http://localhost:3099/api/v1',
      authBaseUrl: DEFAULTS.authBaseUrl,
    });
  });
});
