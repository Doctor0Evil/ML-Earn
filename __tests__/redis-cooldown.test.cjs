const nock = require('nock');
const { GitHubRateGovernor, RedisCooldownAdapter, MockRedisClient } = require('../dist/index.js');

class MockRedis {
  constructor() {
    this.store = new Map(); // key -> { value, expiresAt }
  }
  async get(key) {
    const rec = this.store.get(key);
    if (!rec) return null;
    if (Date.now() >= rec.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return rec.value;
  }
  async set(key, value, pxKeyword, ttlMs, nxKeyword) {
    // pxKeyword expected 'PX' and nxKeyword expected 'NX'
    const now = Date.now();
    const rec = this.store.get(key);
    if (rec && Date.now() < rec.expiresAt) {
      return null; // NX fail
    }
    this.store.set(key, { value, expiresAt: now + ttlMs });
    return 'OK';
  }
  async pttl(key) {
    const rec = this.store.get(key);
    if (!rec) return -2; // key doesn't exist
    const remaining = rec.expiresAt - Date.now();
    if (remaining <= 0) {
      this.store.delete(key);
      return -2;
    }
    return remaining;
  }
  // Helper for tests
  setRaw(key, value, expiresAt) {
    this.store.set(key, { value, expiresAt });
  }
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

describe('Redis-backed endpoint cooldown', () => {
  test('Scenario 1: 429 sets redis cooldown key with proper TTL', async () => {
    const redis = new MockRedisClient();
    const sleepCalls = [];
    const sleepFn = (ms) => {
      sleepCalls.push(ms);
      return Promise.resolve();
    };

    const adapter = new RedisCooldownAdapter(redis, 'rg_test');
    const gov = new GitHubRateGovernor({ redisAdapter: adapter, redisCooldownPrefix: 'rg_test', redisCooldownBehavior: 'sleep', sleepFn, randomFn: () => 0 });
    const baseUrl = 'https://api.github.com/test/redis1';
    const key = `GET ${baseUrl}`;
    const ridKey = `rg_test:${encodeURIComponent(key)}`;

    const scope = nock('https://api.github.com')
      .get('/test/redis1')
      .reply(429, '', { 'Retry-After': '5' })
      .get('/test/redis1')
      .reply(200, [{ id: 1 }], { ETag: '"p1-v1"' });

    const res = await gov.perform('GET', baseUrl, {}, null, { etag_key: 'r1', endpointKey: key });
    expect(res.status).toBe(200);

    const v = await redis.get(ridKey);
    expect(v).not.toBeNull();
    const retryUntil = parseInt(String(v), 10);
    const now = Date.now();
    // retryUntil should be roughly now+5000
    expect(retryUntil).toBeGreaterThanOrEqual(now + 4500);
    expect(retryUntil).toBeLessThanOrEqual(now + 6000);
    const pttl = await redis.pttl(ridKey);
    expect(pttl).toBeGreaterThanOrEqual(4500);

    expect(scope.isDone()).toBe(true);
  }, 15000);

  test('Scenario 2: subsequent calls during cooldown do not hit nock (synthetic)', async () => {
    const redis = new MockRedisClient();
    const sleepCalls = [];
    const sleepFn = (ms) => {
      sleepCalls.push(ms);
      return Promise.resolve();
    };

    const adapter = new RedisCooldownAdapter(redis, 'rg_test');
    const gov = new GitHubRateGovernor({ redisAdapter: adapter, redisCooldownPrefix: 'rg_test', redisCooldownBehavior: 'synthetic', sleepFn });
    const baseUrl = 'https://api.github.com/test/redis2';
    const key = `GET ${baseUrl}`;
    const ridKey = `rg_test:${encodeURIComponent(key)}`;

    // Simulate existing cooldown by setting raw
    const future = Date.now() + 5000;
    redis.setRaw(ridKey, String(future), future);

    // No nock expectation; perform should return synthetic 529 and not hit upstream.
    const res = await gov.perform('GET', baseUrl, {}, null, { etag_key: 'r2', endpointKey: key });
    expect(res.status).toBe(529);
  });

  test('Scenario 3: after cooldown expires, request proceeds and clears/overwrites cooldown', async () => {
    const redis = new MockRedisClient();
    const sleepCalls = [];
    const sleepFn = (ms) => {
      sleepCalls.push(ms);
      return Promise.resolve();
    };

    const adapter = new RedisCooldownAdapter(redis, 'rg_test');
    const gov = new GitHubRateGovernor({ redisAdapter: adapter, redisCooldownPrefix: 'rg_test', redisCooldownBehavior: 'sleep', sleepFn, randomFn: () => 0 });
    const baseUrl = 'https://api.github.com/test/redis3';
    const key = `GET ${baseUrl}`;
    const ridKey = `rg_test:${encodeURIComponent(key)}`;

    // Simulate cooldown that's already expired by setting past expiresAt
    const past = Date.now() - 1000;
    redis.setRaw(ridKey, String(Date.now() - 1000), past);

    const scope = nock('https://api.github.com')
      .get('/test/redis3')
      .reply(200, [{ id: 1 }], { ETag: '"p1-v1"' });

    const res = await gov.perform('GET', baseUrl, {}, null, { etag_key: 'r3', endpointKey: key });
    expect(res.status).toBe(200);

    // After success, there should either be no cooldown key or it can be newly set (we don't enforce); ensure nock was hit
    expect(scope.isDone()).toBe(true);
  });

  test('Scenario 4: redis returns null (no cooldown) and governor proceeds', async () => {
    const redis = new MockRedisClient();
    const sleepCalls = [];
    const sleepFn = (ms) => {
      sleepCalls.push(ms);
      return Promise.resolve();
    };

    const adapter = new RedisCooldownAdapter(redis, 'rg_test');
    const gov = new GitHubRateGovernor({ redisAdapter: adapter, redisCooldownPrefix: 'rg_test', redisCooldownBehavior: 'sleep', sleepFn });
    const baseUrl = 'https://api.github.com/test/redis4';
    const key = `GET ${baseUrl}`;
    const ridKey = `rg_test:${encodeURIComponent(key)}`;

    // Ensure redis returns null (no key set)
    const v = await adapter.get(key);
    expect(v).toBeNull();

    const scope = nock('https://api.github.com')
      .get('/test/redis4')
      .reply(200, [{ id: 1 }], { ETag: '"p1-v1"' });

    const res = await gov.perform('GET', baseUrl, {}, null, { etag_key: 'r4', endpointKey: key });
    expect(res.status).toBe(200);
    expect(scope.isDone()).toBe(true);
  }, 15000);
});
