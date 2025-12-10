// scripts/github-rate-governor.cjs
// RaptorMini.GitHubRateGovernor — Node CommonJS implementation

const https = require('https');
const { URL } = require('url');

const GLOBAL_MAX_CONCURRENT = 4;
const GLOBAL_SAFE_QPS = 1.0; // 1 req/sec
const MIN_SLEEP_MS = 250;
const JITTER_MS = 250;
const SOFT_BURST_WINDOW_SEC = 60;
const SOFT_BURST_MAX_REQ = 50;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 60_000;

class GitHubRateGovernor {
    constructor(config = {}) {
        this.currentConcurrent = 0;
        this.queue = []; // waiting resolvers for acquiring a token

        this.lastRequestTs = 0;
        this.recentWindow = []; // timestamps (ms)
        this.etagCache = {};
        this.remainingLimit = 5000;
        this.resetAt = new Date(0);
        this.hardBlockUntil = new Date(0);
        this._getAuthHeader = null;
        this._tokenRefreshFn = config.tokenRefresh || null;
        this.config = Object.assign({ globalMaxConcurrent: GLOBAL_MAX_CONCURRENT, globalQps: GLOBAL_SAFE_QPS, backoffBaseMs: BACKOFF_BASE_MS, backoffMaxMs: BACKOFF_MAX_MS, jitterMs: JITTER_MS, maxAttempts: 5, redisCooldownPrefix: 'rg:endpoint:cooldown', redisCooldownBehavior: 'sleep' }, config);
        this.randomFn = (typeof config.randomFn === 'function') ? config.randomFn : null;
        this.redisClient = config.redisClient || null;
        this.sleepFn = (typeof config.sleepFn === 'function') ? config.sleepFn : null;
    }

    jitterMs(base) {
        const rand = this.randomFn ? this.randomFn() : Math.random();
        const j = Math.floor(rand * (this.config.jitterMs || JITTER_MS));
        return base + j;
    }

    sleep(ms) {
        if (this.sleepFn) {
            return this.sleepFn(ms);
        }
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    purgeOldTimestamps(nowMs) {
        const cutoff = nowMs - (SOFT_BURST_WINDOW_SEC * 1000);
        while (this.recentWindow.length && this.recentWindow[0] < cutoff) {
            this.recentWindow.shift();
        }
    }

    updateFromHeaders(h) {
        const hdr = (name) => {
            return Object.keys(h).find(k => k.toLowerCase() === name.toLowerCase());
        };

        const r = hdr('x-ratelimit-remaining');
        if (r) {
            const parsed = parseInt(h[r], 10);
            if (!Number.isNaN(parsed)) this.remainingLimit = parsed;
        }
        const z = hdr('x-ratelimit-reset');
        if (z) {
            const epoch = parseInt(h[z], 10);
            if (!Number.isNaN(epoch) && epoch > 0) {
                this.resetAt = new Date(epoch * 1000);
            }
        }
    }

    computeRetryAfterMs(h, attempt) {
        const hdr = (name) => {
            return Object.keys(h).find(k => k.toLowerCase() === name.toLowerCase());
        };
        const ra = hdr('retry-after');
        if (ra) {
            const sec = parseInt(h[ra], 10);
            const val = (Number.isNaN(sec) ? 60 : sec) * 1000;
            return this.jitterMs(val);
        }
        let base = this.config.backoffBaseMs * Math.pow(2, Math.max(0, attempt - 1));
        if (base > (this.config.backoffMaxMs || BACKOFF_MAX_MS)) base = (this.config.backoffMaxMs || BACKOFF_MAX_MS);
        return this.jitterMs(base);
    }

    async acquireToken() {
        if (this.currentConcurrent < (this.config && this.config.globalMaxConcurrent ? this.config.globalMaxConcurrent : GLOBAL_MAX_CONCURRENT)) {
            this.currentConcurrent += 1;
            return;
        }
        // otherwise enqueue
        await new Promise(resolve => {
            this.queue.push(resolve);
        });
        // token granted, increment
        this.currentConcurrent += 1;
    }

    releaseToken() {
        if (this.currentConcurrent > 0) {
            this.currentConcurrent -= 1;
        }
        // if there are queued waiters, grant one
        if (this.queue.length > 0 && this.currentConcurrent < (this.config && this.config.globalMaxConcurrent ? this.config.globalMaxConcurrent : GLOBAL_MAX_CONCURRENT)) {
            const resolve = this.queue.shift();
            if (resolve) resolve();
        }
    }

    defaultHeaders() {
        return {
            'User-Agent': 'RaptorMini-GitHubRateGovernor/1.0',
            'Accept': 'application/vnd.github+json',
        };
    }

    async requestRaw(method, urlStr, headers = {}, body = null) {
        const url = new URL(urlStr);
        const opts = {
            method: method.toUpperCase(),
            hostname: url.hostname,
            path: url.pathname + url.search,
            headers,
        };
        if (body && !opts.headers['Content-Length']) {
            opts.headers['Content-Length'] = Buffer.byteLength(body);
        }
        return new Promise((resolve, reject) => {
            const req = https.request(opts, (res) => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    const lowerHeaders = {};
                    Object.keys(res.headers).forEach(k => {
                        lowerHeaders[k] = res.headers[k];
                    });
                    resolve({ status: res.statusCode, headers: lowerHeaders, body: data });
                });
            });
            req.on('error', (err) => reject(err));
            if (body) req.write(body);
            req.end();
        });
    }

    async perform(method, url, headers = {}, body = null, opts = {}) {
        // endpointKey used for ETag scoping and Redis cooldown.
        const endpointKey = (opts && opts.endpointKey) ? opts.endpointKey : `${method.toUpperCase()} ${url}`;

        // 1. Redis per-endpoint cooldown check (if configured)
        if (this.redisClient) {
            try {
                const ridKey = `${this.config.redisCooldownPrefix}:${encodeURIComponent(endpointKey)}`;
                const v = await this.redisClient.get(ridKey);
                if (v) {
                    const retryUntil = parseInt(String(v), 10);
                    const nowMsCheck = Date.now();
                    if (!Number.isNaN(retryUntil) && retryUntil > nowMsCheck) {
                        const sleepMs = Math.max(0, retryUntil - nowMsCheck);
                        if (this.config.redisCooldownBehavior === 'synthetic') {
                            return { status: 529, headers: {}, body: '' };
                        } else {
                            await this.sleep(sleepMs);
                        }
                    }
                }
            } catch (err) {
                // ignore redis errors and continue
            }
        }

        // 2. Block if in hard-block window (after secondary limit)
        const now = Date.now();
        if (now < this.hardBlockUntil.getTime()) {
            const sleepMs = Math.max(0, this.hardBlockUntil.getTime() - now);
            await this.sleep(sleepMs);
        }

        // 2. Concurrency cap checkout
        await this.acquireToken();

        try {
            // 3. Sliding window burst control
            let nowMs = Date.now();
            this.purgeOldTimestamps(nowMs);

            while (this.recentWindow.length >= SOFT_BURST_MAX_REQ) {
                await this.sleep(this.jitterMs(1000));
                nowMs = Date.now();
                this.purgeOldTimestamps(nowMs);
            }

            // 4. Respect known remaining/reset headers
            nowMs = Date.now();
            if (this.remainingLimit <= 5 && nowMs < this.resetAt.getTime()) {
                const cooldownMs = Math.max(0, this.resetAt.getTime() - nowMs);
                await this.sleep(cooldownMs);
            }

            // 5. Optional ETag
            const etagKey = opts.etag_key || url;
            if (this.etagCache[etagKey]) {
                headers['If-None-Match'] = this.etagCache[etagKey];
            }

            // Merge default headers
            headers = Object.assign({}, this.defaultHeaders(), headers);

            // 6. Dispatch with retry loop
            let attempt = 0;
            let resp = null;
            const maxAttempts = (this.config && this.config.maxAttempts) ? this.config.maxAttempts : 5;

            while (true) {
                attempt += 1;
                this.lastRequestTs = Date.now();
                const qps = (this.config && this.config.globalQps) ? this.config.globalQps : GLOBAL_SAFE_QPS;
                await this.sleep(this.jitterMs(Math.floor(1000 / qps)));

                try {
                    resp = await this.requestRaw(method, url, headers, body);
                } catch (err) {
                    // treat as transient, backoff and retry
                    const retryMs = this.computeRetryAfterMs({}, attempt);
                    await this.sleep(retryMs);
                    if (attempt >= maxAttempts) {
                        throw err;
                    }
                    continue;
                }

                // Track timestamp in sliding window
                this.recentWindow.push(Date.now());
                this.updateFromHeaders(resp.headers);

                // ETag cache update
                if (resp.headers['etag'] && resp.status === 200) {
                    this.etagCache[etagKey] = resp.headers['etag'];
                }

                // 304 Not Modified: return success with 304
                if (resp.status === 304) {
                    break;
                }

                // 401: auth issue -> try refresh and retry once (if tokenRefresh exists)
                if (resp.status === 401 && this._tokenRefreshFn) {
                    try {
                        await this._tokenRefreshFn();
                        // update header for next try if auth provider exists
                        if (this._getAuthHeader) {
                            const auth = await this._getAuthHeader();
                            if (auth) headers['Authorization'] = auth;
                        }
                        if (attempt >= maxAttempts) break;
                        continue; // retry
                    } catch (err) {
                        // Token refresh failed; fall through and handle 401 normally
                    }
                }

                // 403 / 429 -> backoff
                if (resp.status === 403 || resp.status === 429) {
                    const retryAfterMs = this.computeRetryAfterMs(resp.headers, attempt);
                    this.hardBlockUntil = new Date(Date.now() + retryAfterMs);
                    // set Redis cooldown for endpoint if possible
                    if (this.redisClient) {
                        try {
                            const retryUntilMs = Date.now() + retryAfterMs;
                            const ttlMs = retryAfterMs + 250; // small safety margin
                            const ridKey = `${this.config.redisCooldownPrefix}:${encodeURIComponent(endpointKey)}`;
                            // NX: only set if not already present
                            if (typeof this.redisClient.set === 'function') {
                                // Redis clients often return 'OK' or null when NX fails
                                await this.redisClient.set(ridKey, String(retryUntilMs), 'PX', ttlMs, 'NX');
                            }
                        } catch (err) {
                            // ignore redis errors
                        }
                    }
                    await this.sleep(retryAfterMs);

                    if (attempt >= maxAttempts) break;
                    continue;
                }

                break;
            }
            return resp;
        } finally {
            this.releaseToken();
        }
    }

    setAuthProvider(fn) {
        this._getAuthHeader = fn;
    }

    getEtagCacheSnapshot() {
        // return a shallow copy of the cache keyed by etag_key
        return Object.assign({}, this.etagCache);
    }

    // Paginate helper that uses per-page ETag cache and page-1 sentinel behavior.
    async paginateWithETag(baseUrl, perPage = 100, opts = {}) {
        let page = 1;
        let items = [];
        let changed = false;
        let cacheHit = false;
        let pagesFetched = 0;
        while (true) {
            const pageUrl = `${baseUrl}?page=${page}&per_page=${perPage}`;
            const etagKey = `GET ${pageUrl}`;
            const headers = {};
            if (this.etagCache[etagKey]) {
                headers['If-None-Match'] = this.etagCache[etagKey];
            }
            // include Authorization if provider set
            if (this._getAuthHeader) {
                const auth = await this._getAuthHeader();
                if (auth) headers['Authorization'] = auth;
            }
            const resp = await this.perform('GET', pageUrl, headers, null, { etag_key: etagKey });
            if (resp.status === 304) {
                if (page === 1) {
                    // treat as whole collection unchanged
                    cacheHit = true;
                    break;
                } else {
                    // treat as no-change for the page; just stop
                    break;
                }
            }
            if (resp.status !== 200) {
                // treat non-200 as stopping condition
                break;
            }
            changed = true;
            pagesFetched += 1;
            try {
                const parsed = JSON.parse(resp.body || '[]');
                if (Array.isArray(parsed)) {
                    items = items.concat(parsed);
                    if (parsed.length < perPage) {
                        break;
                    }
                } else {
                    // not an array, stop
                    break;
                }
            } catch (e) {
                // parsing error; stop
                break;
            }
            page += 1;
        }
        return { changed, pageCount: pagesFetched, items, cacheHit };
    }
}

module.exports = {
    GitHubRateGovernor,
    // small helper
    defaultGovernor: new GitHubRateGovernor(),
};
