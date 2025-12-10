const nock = require('nock');
const { GitHubRateGovernor } = require('../dist/index.js');

const API_BASE = 'https://api.github.com';
const RESOURCE_PATH = '/test/concurrency';

function makeGovernor(overrides = {}) {
  const baseConfig = {
    globalMaxConcurrent: 2,
    softBurstWindowMs: 60000,
    softBurstMaxReq: 50,
    globalQps: 50,
    baseBackoffMs: 500,
    maxBackoffMs: 60000,
    jitterRatio: 0.5,
  };
  // Provide a fast no-op sleep for the test (except when waiting for replies)
  const sleepFn = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  return new GitHubRateGovernor(Object.assign(baseConfig, overrides, { sleepFn }));
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

describe('Concurrency and QPS behavior', () => {
  test('limits concurrent in-flight requests to configured globalMaxConcurrent', async () => {
    const gov = makeGovernor({ globalMaxConcurrent: 2 });
    const baseUrl = `${API_BASE}${RESOURCE_PATH}`;

    // We'll track in-flight on the mock server side
    let inFlight = 0;
    let maxInFlightObserved = 0;

    const scope = nock(API_BASE)
      .persist()
      .get(RESOURCE_PATH)
      .reply(function(uri, requestBody, cb) {
        inFlight += 1;
        maxInFlightObserved = Math.max(maxInFlightObserved, inFlight);
        // Simulate delayed response to keep requests in-flight
        setTimeout(() => {
          inFlight -= 1;
          cb(null, [200, JSON.stringify([{ id: 1 }]), { ETag: '"p1-v1"' }]);
        }, 150);
      });

    // Fire off 5 concurrent requests
    const jobs = [];
    for (let i = 0; i < 5; i++) {
      jobs.push(gov.perform('GET', baseUrl, {}, null, { etag_key: `test-${i}` }));
    }

    await Promise.all(jobs);

    // Allow nock to finish
    scope.persist(false);
    expect(maxInFlightObserved).toBeLessThanOrEqual(2);
  }, 10000);
});
