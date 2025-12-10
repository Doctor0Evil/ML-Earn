const nock = require('nock');
const { GitHubRateGovernor } = require('../dist/index.js');

const API_BASE = 'https://api.github.com';
const RESOURCE_PATH = '/repos/octokit/core.js/issues';

function makeGovernor(overrides = {}) {
  return new GitHubRateGovernor(Object.assign({
    globalMaxConcurrent: 4,
    softBurstWindowMs: 60000,
    softBurstMaxReq: 50,
    globalQps: 50,
    baseBackoffMs: 500,
    maxBackoffMs: 60000,
    jitterRatio: 0.5,
  }, overrides));
}

beforeAll(() => {
  nock.disableNetConnect();
});

afterAll(() => {
  nock.enableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
});

describe('Paginated ETag + token refresh', () => {
  test('refreshes token on 401 and preserves ETag pagination semantics', async () => {
    let currentToken = 'token-v1';
    let refreshCalls = 0;

    async function getAuthHeader() {
      return `Bearer ${currentToken}`;
    }

    async function refreshToken() {
      refreshCalls += 1;
      currentToken = 'token-v2';
      return currentToken;
    }

    const gov = makeGovernor({ tokenRefresh: refreshToken });
    gov.setAuthProvider(getAuthHeader);

    const baseUrl = `${API_BASE}${RESOURCE_PATH}`;
    const p1Query = { page: 1, per_page: 100 };
    const p2Query = { page: 2, per_page: 100 };

    const scope1 = nock(API_BASE)
      .get(RESOURCE_PATH)
      .query(p1Query)
      .matchHeader('Authorization', 'Bearer token-v1')
      .reply(200, [{ id: 1 }], {
        ETag: '"p1-v1"',
        'Content-Type': 'application/json',
      })
      .get(RESOURCE_PATH)
      .query(p2Query)
      .matchHeader('Authorization', 'Bearer token-v1')
      .reply(200, [{ id: 2 }], {
        ETag: '"p2-v1"',
        'Content-Type': 'application/json',
      });

    const r1 = await gov.paginateWithETag(baseUrl, 100);
    expect(r1.changed).toBe(true);
    expect(r1.items.map((x) => x.id).sort()).toEqual([1, 2]);
    expect(scope1.isDone()).toBe(true);

    const p1Url = `${baseUrl}?page=1&per_page=100`;
    const p2Url = `${baseUrl}?page=2&per_page=100`;
    const cache1 = gov.getEtagCacheSnapshot();
    expect(cache1[`GET ${p1Url}`]).toBe('"p1-v1"');
    expect(cache1[`GET ${p2Url}`]).toBe('"p2-v1"');

    const scope2 = nock(API_BASE)
      .get(RESOURCE_PATH)
      .query(p1Query)
      .matchHeader('Authorization', 'Bearer token-v1')
      .reply(401, { message: 'Bad credentials' })
      .get(RESOURCE_PATH)
      .query(p1Query)
      .matchHeader('Authorization', 'Bearer token-v2')
      .matchHeader('If-None-Match', '"p1-v1"')
      .reply(304, '', {});

    const r2 = await gov.paginateWithETag(baseUrl, 100);
    expect(refreshCalls).toBe(1);
    expect(r2.changed).toBe(false);
    expect(r2.cacheHit).toBe(true);
    expect(r2.pageCount).toBe(0);
    expect(scope2.isDone()).toBe(true);
  });
});
