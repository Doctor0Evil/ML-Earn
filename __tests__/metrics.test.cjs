const nock = require('nock');
const { GitHubRateGovernor, PrometheusSink } = require('../dist/index.js');

beforeAll(() => {
  nock.disableNetConnect();
});

afterAll(() => {
  nock.enableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
});

describe('Metrics integration', () => {
  test('backoff and request complete metrics increment', async () => {
    const sink = new (class {
      constructor(){ this.counts = {complete:0, backoff:0, retry:0, cacheHit:0 }; }
      onRequestComplete(){ this.counts.complete +=1; }
      onRetry(){ this.counts.retry +=1; }
      onBackoff(){ this.counts.backoff +=1; }
      onCacheHit(){ this.counts.cacheHit +=1; }
    })();

    const gov = new GitHubRateGovernor({ metricsSink: sink, sleepFn: ms => Promise.resolve(), randomFn: () => 0 });

    const API_BASE = 'https://api.github.com';
    const path = '/test/metrics/backoff';

    const scope = nock(API_BASE)
      .get(path)
      .reply(429, '', {})
      .get(path)
      .reply(200, [{ id: 1 }], { ETag: '"m1"' });

    const res = await gov.perform('GET', `${API_BASE}${path}`, {}, null, { etag_key: 'm1' });
    expect(res.status).toBe(200);
    expect(sink.counts.backoff).toBeGreaterThanOrEqual(1);
    expect(sink.counts.complete).toBeGreaterThanOrEqual(1);
    expect(scope.isDone()).toBe(true);
  });

  test('cache hit increments metrics', async () => {
    const sink = new (class {
      constructor(){ this.counts = {complete:0, backoff:0, retry:0, cacheHit:0 }; }
      onRequestComplete(){ this.counts.complete +=1; }
      onRetry(){ this.counts.retry +=1; }
      onBackoff(){ this.counts.backoff +=1; }
      onCacheHit(){ this.counts.cacheHit +=1; }
    })();

    const gov = new GitHubRateGovernor({ metricsSink: sink, sleepFn: ms => Promise.resolve(), randomFn: () => 0 });

    const API_BASE = 'https://api.github.com';
    const basePath = '/test/metrics/paginated';
    const p1 = `${API_BASE}${basePath}?page=1&per_page=100`;
    const p2 = `${API_BASE}${basePath}?page=2&per_page=100`;

    const scope1 = nock(API_BASE)
      .get(basePath)
      .query({ page: 1, per_page: 100 })
      .reply(200, [{ id: 1 }], { ETag: '"p1"' })
      .get(basePath)
      .query({ page: 2, per_page: 100 })
      .reply(200, [{ id: 2 }], { ETag: '"p2"' });

    const r1 = await gov.paginateWithETag(`${API_BASE}${basePath}`, 100);
    expect(r1.changed).toBe(true);
    expect(sink.counts.cacheHit).toBe(0);

    // Next run: page1 304 -> cache hit
    const scope2 = nock(API_BASE)
      .get(basePath)
      .query({ page: 1, per_page: 100 })
      .reply(304, '', {});

    const r2 = await gov.paginateWithETag(`${API_BASE}${basePath}`, 100);
    expect(r2.changed).toBe(false);
    expect(sink.counts.cacheHit).toBeGreaterThanOrEqual(1);
  });
});
