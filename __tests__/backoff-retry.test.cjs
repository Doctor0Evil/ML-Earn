const nock = require('nock');
const { GitHubRateGovernor } = require('../dist/index.js');

const API_BASE = 'https://api.github.com';
const RESOURCE_PATH = '/test/backoff';

beforeAll(() => {
  nock.disableNetConnect();
});

afterAll(() => {
  nock.enableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
});

describe('Backoff & Retry-After behavior', () => {
  test('Scenario 1: 429 with Retry-After header triggers sleep of approximate duration and 2 upstream calls', async () => {
    const sleepCalls = [];
    const sleepFn = (ms) => {
      sleepCalls.push(ms);
      return Promise.resolve();
    };

    const gov = new GitHubRateGovernor({ sleepFn, randomFn: () => 0 });
    const baseUrl = `${API_BASE}${RESOURCE_PATH}`;

    const scope = nock(API_BASE)
      .get(RESOURCE_PATH)
      .reply(429, '', { 'Retry-After': '3' })
      .get(RESOURCE_PATH)
      .reply(200, [{ id: 1 }], { ETag: '"p1-v1"' });

    const resp = await gov.perform('GET', baseUrl, {}, null, { etag_key: 'b1' });

    expect(resp.status).toBe(200);
    // assert sleep was called for about 3000ms (jitter 0)
    expect(sleepCalls.length).toBeGreaterThanOrEqual(1);
    expect(sleepCalls).toContainEqual(expect.any(Number));
    // find the sleep call equal or close to 3000
    const found = sleepCalls.some(ms => Math.abs(ms - 3000) <= 50);
    expect(found).toBe(true);
    expect(scope.isDone()).toBe(true);
  }, 10000);

  test('Scenario 2: 403/429 without Retry-After uses exponential backoff (no Retry-After header)', async () => {
    // deterministic jitter with randomFn returning 0
    const sleepCalls = [];
    const sleepFn = (ms) => {
      sleepCalls.push(ms);
      return Promise.resolve();
    };

    const gov = new GitHubRateGovernor({ sleepFn, randomFn: () => 0, backoffBaseMs: 500, maxAttempts: 3 });
    const baseUrl = `${API_BASE}${RESOURCE_PATH}`;

    // replies: 429, 429, 200 (third attempt successful)
    const scope = nock(API_BASE)
      .get(RESOURCE_PATH)
      .reply(429, '', {})
      .get(RESOURCE_PATH)
      .reply(429, '', {})
      .get(RESOURCE_PATH)
      .reply(200, [{ id: 1 }], { ETag: '"p1-v1"' });

    const resp = await gov.perform('GET', baseUrl, {}, null, { etag_key: 'b2' });
    expect(resp.status).toBe(200);

    // backoff pattern: 500ms, 1000ms (approx) for two retries
    expect(sleepCalls.length).toBeGreaterThanOrEqual(2);
    // Check first two sleep durations include the exponential bases
    const approx500 = sleepCalls.some(ms => Math.abs(ms - 500) <= 50);
    const approx1000 = sleepCalls.some(ms => Math.abs(ms - 1000) <= 100);
    expect(approx500).toBe(true);
    expect(approx1000).toBe(true);

    // hardBlockUntil should be set at least once
    expect(gov.hardBlockUntil.getTime()).toBeGreaterThan(Date.now() - 100);
    expect(scope.isDone()).toBe(true);
  }, 20000);

  test('Scenario: missing X-RateLimit headers are handled safely', async () => {
    const sleepCalls = [];
    const sleepFn = (ms) => {
      sleepCalls.push(ms);
      return Promise.resolve();
    };

    const gov = new GitHubRateGovernor({ sleepFn, randomFn: () => 0 });
    const baseUrl = `${API_BASE}${RESOURCE_PATH}`;

    // Nock returns no X-RateLimit headers
    const scope = nock(API_BASE)
      .get(RESOURCE_PATH)
      .reply(200, [{ id: 1 }], { ETag: '"no-rate-headers"' });

    const beforeRemaining = gov.remainingLimit;
    const beforeReset = gov.resetAt.getTime();

    const resp = await gov.perform('GET', baseUrl, {}, null, { etag_key: 'b-no-rl' });
    expect(resp.status).toBe(200);
    expect(gov.remainingLimit).toBe(beforeRemaining); // unchanged
    expect(gov.resetAt.getTime()).toBe(beforeReset); // unchanged
    expect(scope.isDone()).toBe(true);
  }, 10000);

  test('Scenario 3: shared hard block causes other requests to be delayed', async () => {
    const sleepCalls = [];
    const sleepFn = (ms) => {
      sleepCalls.push(ms);
      return Promise.resolve();
    };

    // Setup governor with deterministic jitter
    const gov = new GitHubRateGovernor({ sleepFn, randomFn: () => 0, backoffBaseMs: 500 });
    const baseUrl = `${API_BASE}${RESOURCE_PATH}`;

    // First call returns 429 with Retry-After: 2 -> sets hardBlockUntil
    const scope = nock(API_BASE)
      .get(RESOURCE_PATH)
      .reply(429, '', { 'Retry-After': '2' })
      .get(RESOURCE_PATH)
      .reply(200, [{ id: 1 }], { ETag: '"p1-v1"' })
      .persist();

    const p1 = gov.perform('GET', baseUrl, {}, null, { etag_key: 'b3' });

    // Fire another perform while the first is in backoff; it should sleep before making a request or be delayed
    const p2 = gov.perform('GET', baseUrl, {}, null, { etag_key: 'b3-2' });

    const results = await Promise.all([p1, p2]);
    expect(results.every(r => r.status === 200)).toBe(true);

    // Some sleep was recorded for backoff and for second request waiting for the hardBlockUntil.
    expect(sleepCalls.length).toBeGreaterThanOrEqual(1);
    const found2 = sleepCalls.some(ms => Math.abs(ms - 2000) <= 100);
    expect(found2).toBe(true);

    scope.persist(false);
  }, 20000);
});
