const { GitHubRateGovernor } = require('../dist/index.js');

describe('Backoff/Jitter property tests', () => {
  const randomVals = [0, 0.25, 0.5, 0.75, 1];
  const basePairs = [
    { base: 200, max: 10000 },
    { base: 500, max: 5000 },
    { base: 100, max: 2000 },
    { base: 0, max: 10000 },
  ];

  test('computeRetryAfterMs invariants across attempts, random values, and base/max pairs', () => {
    for (const pair of basePairs) {
      for (const jitterRand of randomVals) {
        for (let attempt = 1; attempt <= 12; attempt++) {
          const gov = new GitHubRateGovernor({ backoffBaseMs: pair.base, backoffMaxMs: pair.max, jitterMs: 250, randomFn: () => jitterRand, sleepFn: ms => Promise.resolve() });
          const computed = (gov as any).computeRetryAfterMs({}, attempt);
          // Non-negativity
          expect(computed).toBeGreaterThanOrEqual(0);
          // Upper bound: computed should never exceed backoffMaxMs
          expect(computed).toBeLessThanOrEqual(pair.max);
        }
      }
    }
  });

  test('monotonicity and jitter range property', () => {
    const base = 500;
    const max = 5000;
    const jitterMax = 1000;
    // For each random value, test monotonicity across attempts
    for (const r of randomVals) {
      const gov = new GitHubRateGovernor({ backoffBaseMs: base, backoffMaxMs: max, jitterMs: jitterMax, randomFn: () => r, sleepFn: ms => Promise.resolve() });
      let prev = -1;
      for (let attempt = 1; attempt <= 10; attempt++) {
        const v = (gov as any).computeRetryAfterMs({}, attempt);
        // v should be >= previous value (monotonic until saturation)
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
        // Bound checks: lower bound capped at basePow; upper bound <= max
        const basePow = base * Math.pow(2, Math.max(0, attempt - 1));
        const capped = Math.min(basePow, max);
        const jitterUpper = Math.min(max, capped + jitterMax);
        expect(v).toBeGreaterThanOrEqual(capped);
        expect(v).toBeLessThanOrEqual(jitterUpper);
      }
    }
  });

  test('edge cases: base = 0 and very large attempts saturate at max', () => {
    const base = 0;
    const max = 10000;
    const gov = new GitHubRateGovernor({ backoffBaseMs: base, backoffMaxMs: max, jitterMs: 500, randomFn: () => 0.5, sleepFn: ms => Promise.resolve() });
    for (let attempt = 1; attempt <= 20; attempt++) {
      const v = (gov as any).computeRetryAfterMs({}, attempt);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(max);
    }
  });

  test('maxAttempts=0 behavior in perform: no infinite loop', async () => {
    const sleepCalls = [];
    const sleepFn = (ms) => { sleepCalls.push(ms); return Promise.resolve(); };
    const gov = new GitHubRateGovernor({ backoffBaseMs: 200, backoffMaxMs: 5000, jitterMs: 100, randomFn: () => 0.5, sleepFn, maxAttempts: 0 });
    const nock = require('nock');
    nock.disableNetConnect();
    const API_BASE = 'https://api.github.com';
    nock(API_BASE)
      .get('/test/max-attempts-zero')
      .reply(429, '', {})
      .get('/test/max-attempts-zero')
      .reply(200, [{ id: 1 }], {});
    const resp = await gov.perform('GET', `${API_BASE}/test/max-attempts-zero`, {}, null, { etag_key: 'p' });
    // It should either succeed or return the 429 result; the key is no infinite loop and sleep called at most once
    expect(sleepCalls.length).toBeLessThanOrEqual(1);
  });

  test('sleep durations observed in perform match computeRetryAfterMs bounds', async () => {
    const sleepCalls = [];
    const sleepFn = (ms) => { sleepCalls.push(ms); return Promise.resolve(); };
    const gov = new GitHubRateGovernor({ backoffBaseMs: 200, backoffMaxMs: 3000, jitterMs: 200, randomFn: () => 0.5, sleepFn, maxAttempts: 5 });
    const nock = require('nock');
    nock.disableNetConnect();
    const API_BASE = 'https://api.github.com';
    nock(API_BASE)
      .get('/test/backoff-property')
      .reply(429, '', {})
      .get('/test/backoff-property')
      .reply(429, '', {})
      .get('/test/backoff-property')
      .reply(200, [{ id: 1 }], {});

    await gov.perform('GET', `${API_BASE}/test/backoff-property`, {}, null, { etag_key: 'p2' });
    // Compare recorded sleep calls to compute for attempts 1..n
    for (let i = 0; i < sleepCalls.length; i++) {
      const attempt = i + 1;
      const expected = (gov as any).computeRetryAfterMs({}, attempt);
      expect(Math.abs(sleepCalls[i] - expected)).toBeLessThanOrEqual(50);
    }
  });
});
