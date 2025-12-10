const nock = require('nock');
const { GitHubRateGovernor } = require('../dist/index.js');

const API_BASE = 'https://api.github.com';
const RESOURCE_PATH = '/repos/octokit/core.js/issues';

function makeGovernor() {
  return new GitHubRateGovernor({
    globalMaxConcurrent: 4,
    softBurstWindowMs: 60000,
    softBurstMaxReq: 50,
    globalQps: 50,
    baseBackoffMs: 500,
    maxBackoffMs: 60000,
    jitterRatio: 0.5,
  });
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

describe('Paginated ETag conditional requests', () => {
  test('stops paging when page 1 is 304 with same ETag', async () => {
    const gov = makeGovernor();

    const baseUrl = `${API_BASE}${RESOURCE_PATH}`;
    const p1Query = { page: 1, per_page: 100 };
    const p2Query = { page: 2, per_page: 100 };

    const scope1 = nock(API_BASE)
      .get(RESOURCE_PATH)
      .query(p1Query)
      .reply(200, [{ id: 1 }], {
        ETag: '"p1-v1"',
        'Content-Type': 'application/json',
        Link: `<${baseUrl}?page=2&per_page=100>; rel="next"`,
      })
      .get(RESOURCE_PATH)
      .query(p2Query)
      .reply(200, [{ id: 2 }], {
        ETag: '"p2-v1"',
        'Content-Type': 'application/json',
      });

    const r1 = await gov.paginateWithETag(baseUrl, 100);

    expect(r1.changed).toBe(true);
    expect(r1.pageCount).toBe(2);
    expect(r1.items.map((x) => x.id).sort()).toEqual([1, 2]);
    expect(scope1.isDone()).toBe(true);

    const cache1 = gov.getEtagCacheSnapshot();
    const p1Key = `GET ${baseUrl}?page=1&per_page=100`;
    const p2Key = `GET ${baseUrl}?page=2&per_page=100`;
    expect(cache1[p1Key]).toBe('"p1-v1"');
    expect(cache1[p2Key]).toBe('"p2-v1"');

    const scope2 = nock(API_BASE)
      .get(RESOURCE_PATH)
      .query(p1Query)
      .matchHeader('If-None-Match', '"p1-v1"')
      .reply(304, '', {});

    const r2 = await gov.paginateWithETag(baseUrl, 100);
    expect(r2.changed).toBe(false);
    expect(r2.pageCount).toBe(0);
    expect(scope2.isDone()).toBe(true);

    const cache2 = gov.getEtagCacheSnapshot();
    expect(cache2[p1Key]).toBe('"p1-v1"');
    expect(cache2[p2Key]).toBe('"p2-v1"');
  });

  test('re-fetches all pages when page 1 ETag changes', async () => {
    const gov = makeGovernor();

    const baseUrl = `${API_BASE}${RESOURCE_PATH}`;
    const p1Query = { page: 1, per_page: 100 };
    const p2Query = { page: 2, per_page: 100 };

    const scope1 = nock(API_BASE)
      .get(RESOURCE_PATH)
      .query(p1Query)
      .reply(200, [{ id: 1 }], {
        ETag: '"p1-v1"',
        'Content-Type': 'application/json',
        Link: `<${baseUrl}?page=2&per_page=100>; rel="next"`,
      })
      .get(RESOURCE_PATH)
      .query(p2Query)
      .reply(200, [{ id: 2 }], {
        ETag: '"p2-v1"',
        'Content-Type': 'application/json',
      });

    const r1 = await gov.paginateWithETag(baseUrl, 100);
    expect(r1.changed).toBe(true);
    expect(r1.pageCount).toBe(2);
    expect(scope1.isDone()).toBe(true);

    const scope2 = nock(API_BASE)
      .get(RESOURCE_PATH)
      .query(p1Query)
      .matchHeader('If-None-Match', '"p1-v1"')
      .reply(200, [{ id: 1 }, { id: 3 }], {
        ETag: '"p1-v2"',
        'Content-Type': 'application/json',
        Link: `<${baseUrl}?page=2&per_page=100>; rel="next"`,
      })
      .get(RESOURCE_PATH)
      .query(p2Query)
      .matchHeader('If-None-Match', '"p2-v1"')
      .reply(304, '', {});

    const r2 = await gov.paginateWithETag(baseUrl, 100);
    expect(r2.changed).toBe(true);
    expect(r2.pageCount).toBe(2);
    expect(r2.items.map((x) => x.id).sort()).toEqual([1, 2, 3]);
    expect(scope2.isDone()).toBe(true);

    const cache = gov.getEtagCacheSnapshot();
    const p1Key = `GET ${baseUrl}?page=1&per_page=100`;
    const p2Key = `GET ${baseUrl}?page=2&per_page=100`;
    expect(cache[p1Key]).toBe('"p1-v2"');
    expect(cache[p2Key]).toBe('"p2-v1"');
  });

  test('handles 304 page 1 without Link header', async () => {
    const gov = makeGovernor();

    const baseUrl = `${API_BASE}${RESOURCE_PATH}`;
    const p1Query = { page: 1, per_page: 100 };

    const scope1 = nock(API_BASE)
      .get(RESOURCE_PATH)
      .query(p1Query)
      .reply(200, [{ id: 1 }], {
        ETag: '"p1-v1"',
        'Content-Type': 'application/json',
        Link: `<${baseUrl}?page=2&per_page=100>; rel="next"`,
      });

    const r1 = await gov.paginateWithETag(baseUrl, 100);
    expect(r1.changed).toBe(true);
    expect(r1.pageCount).toBe(1);
    expect(scope1.isDone()).toBe(true);

    const cache1 = gov.getEtagCacheSnapshot();
    const p1Key = `GET ${baseUrl}?page=1&per_page=100`;
    expect(cache1[p1Key]).toBe('"p1-v1"');

    const scope2 = nock(API_BASE)
      .get(RESOURCE_PATH)
      .query(p1Query)
      .matchHeader('If-None-Match', '"p1-v1"')
      .reply(304, '', {});

    const r2 = await gov.paginateWithETag(baseUrl, 100);
    expect(r2.changed).toBe(false);
    expect(r2.pageCount).toBe(0);
    expect(r2.cacheHit).toBe(true);
    expect(scope2.isDone()).toBe(true);

    // Ensure ETag cache remains unchanged when 304 contains no ETag and no Link header
    const cache3 = gov.getEtagCacheSnapshot();
    expect(cache3[p1Key]).toBe('"p1-v1"');
    expect(cache3[p2Key]).toBe('"p2-v1"');
  });

  test('page 1 304 with no ETag or Link does not crash and keeps cache', async () => {
    const gov = makeGovernor();
    const baseUrl = `${API_BASE}${RESOURCE_PATH}`;
    const p1Query = { page: 1, per_page: 100 };
    const p1Url = `${baseUrl}?page=1&per_page=100`;

    // Initial run: page 1 returns 200 with ETag
    const p1v1 = { status: 200, headers: { ETag: '"p1-v1"' }, body: JSON.stringify([{ id: 1 }]) };
    const scope = nock(API_BASE)
      .get(RESOURCE_PATH)
      .query(p1Query)
      .reply(200, [{ id: 1 }], { ETag: '"p1-v1"' });

    const r1 = await gov.paginateWithETag(baseUrl, 100);
    expect(r1.changed).toBe(true);
    expect(scope.isDone()).toBe(true);

    // Now simulate 304 with no ETag and no Link
    const scope2 = nock(API_BASE)
      .get(RESOURCE_PATH)
      .query(p1Query)
      .matchHeader('If-None-Match', '"p1-v1"')
      .reply(304, '', {});

    const r2 = await gov.paginateWithETag(baseUrl, 100);
    expect(r2.changed).toBe(false);
    expect(r2.cacheHit).toBe(true);
    expect(scope2.isDone()).toBe(true);

    const cache = gov.getEtagCacheSnapshot();
    expect(cache[p1Url]).toBe('"p1-v1"');
  });
});
