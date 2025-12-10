import https from 'https';
import { URL } from 'url';

export interface RateGovernorConfig {
  readonly globalMaxConcurrent: number;
  readonly softBurstWindowMs: number;
  readonly softBurstMaxReq: number;
  readonly globalQps: number;
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
  readonly maxAttempts: number;
  readonly randomFn?: () => number;
  readonly sleepFn?: (ms: number) => Promise<void>;
  readonly tokenRefresh?: () => Promise<string>;
  readonly redisClient?: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, mode: 'PX', ttlMs: number, nxFlag: 'NX'): Promise<unknown>;
    pttl(key: string): Promise<number>;
  } | null;
  readonly redisAdapter?: import('./redis-adapter').RedisCooldownAdapter | null;
  readonly redisCooldownPrefix?: string;
  readonly redisCooldownBehavior?: 'sleep' | 'synthetic';
  readonly jitterMs?: number;
  readonly metricsSink?: import('./metrics').MetricsSink | null;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface PaginateResult {
  changed: boolean;
  pageCount: number;
  cacheHit: boolean;
  items: unknown[];
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
export type EndpointKey = string & { __endpointKey?: never };
export type EtagKey = string & { __etagKey?: never };

const GLOBAL_MAX_CONCURRENT = 4;
const GLOBAL_SAFE_QPS = 1.0;
const MIN_SLEEP_MS = 250;
const JITTER_MS = 250;

export class GitHubRateGovernor {
  private currentConcurrent = 0;
  private queue: Array<() => void> = [];
  private lastRequestTs = 0;
  private recentWindow: number[] = [];
  private etagCache: Record<string, string> = {};
  public remainingLimit = 5000;
  public resetAt = new Date(0);
  public hardBlockUntil = new Date(0);
  private _getAuthHeader?: () => Promise<string>;
  private _tokenRefreshFn?: () => Promise<string>;
  private config: RateGovernorConfig;
  public metricsSink?: import('./metrics').MetricsSink;
  private randomFn?: () => number;
  private redisClient: NonNullable<RateGovernorConfig['redisClient']> | null = null;
  private redisAdapter: import('./redis-adapter').RedisCooldownAdapter | null = null;
  private sleepFn?: (ms: number) => Promise<void>;

  constructor(config: Partial<RateGovernorConfig> = {}) {
    this.config = Object.assign(
      {
        globalMaxConcurrent: GLOBAL_MAX_CONCURRENT,
        softBurstWindowMs: 60_000,
        softBurstMaxReq: 50,
        globalQps: GLOBAL_SAFE_QPS,
        backoffBaseMs: 1000,
        backoffMaxMs: 60_000,
        maxAttempts: 5,
        randomFn: undefined,
        jitterMs: JITTER_MS,
        sleepFn: undefined,
        tokenRefresh: undefined,
        redisClient: null,
        redisCooldownPrefix: 'rg:endpoint:cooldown',
        redisCooldownBehavior: 'sleep',
      } as RateGovernorConfig,
      config as RateGovernorConfig
    );

    this.randomFn = this.config.randomFn;
    this.redisClient = this.config.redisClient || null;
    this.redisAdapter = (this.config as any).redisAdapter || null;
    this._tokenRefreshFn = this.config.tokenRefresh;
    this.sleepFn = this.config.sleepFn;
    this.metricsSink = this.config.metricsSink || undefined;
  }

  private jitterMs(base: number): number {
    const rand = this.randomFn ? this.randomFn() : Math.random();
    const j = Math.floor(rand * (this.config ? (this.config.jitterMs || JITTER_MS) : JITTER_MS));
    return base + j;
  }

  private sleep(ms: number) {
    if (this.sleepFn) {
      return this.sleepFn(ms);
    }
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private purgeOldTimestamps(nowMs: number) {
    const cutoff = nowMs - (this.config.softBurstWindowMs || 60_000);
    while (this.recentWindow.length && this.recentWindow[0] < cutoff) {
      this.recentWindow.shift();
    }
  }

  private updateFromHeaders(h: Record<string, string>) {
    const getHeader = (name: string): string | undefined => {
      const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
      return key ? h[key] : undefined;
    };
    const rem = getHeader('x-ratelimit-remaining');
    if (rem !== undefined) {
      const parsed = parseInt(rem, 10);
      if (!Number.isNaN(parsed)) this.remainingLimit = parsed;
    }
    const reset = getHeader('x-ratelimit-reset');
    if (reset !== undefined) {
      const epoch = parseInt(reset, 10);
      if (!Number.isNaN(epoch) && epoch > 0) this.resetAt = new Date(epoch * 1000);
    }
  }

  private computeRetryAfterMs(headers: Record<string, string>, attempt: number) {
    const getHeader = (name: string): string | undefined => {
      const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
      return key ? headers[key] : undefined;
    };
    const ra = getHeader('retry-after');
    if (ra !== undefined) {
      const sec = parseInt(ra, 10);
      const val = (Number.isNaN(sec) ? 60 : sec) * 1000;
      return this.jitterMs(val);
    }
    const base = (this.config.backoffBaseMs || 1000) * Math.pow(2, Math.max(0, attempt - 1));
    const max = this.config.backoffMaxMs || 60_000;
    const capped = base > max ? max : base;
    const jittered = this.jitterMs(capped);
    const maxVal = this.config.backoffMaxMs || 60000;
    return jittered > maxVal ? maxVal : jittered;
  }

  private async requestRaw(method: HttpMethod, urlStr: string, headers: Record<string, string>, body: string | null): Promise<HttpResponse> {
    const url = new URL(urlStr);
    const opts: any = {
      method: method.toUpperCase(),
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers,
    };
    if (body && !opts.headers['Content-Length']) opts.headers['Content-Length'] = Buffer.byteLength(body);
    return new Promise<HttpResponse>((resolve, reject) => {
      const req = https.request(opts, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          const lowerHeaders: Record<string, string> = {};
          Object.keys(res.headers).forEach((k) => {
            const val = res.headers[k];
            lowerHeaders[k as string] = Array.isArray(val) ? val.join(',') : (val || '');
          });
          resolve({ status: res.statusCode || 0, headers: lowerHeaders, body: data });
        });
      });
      req.on('error', (err) => reject(err));
      if (body) req.write(body);
      req.end();
    });
  }

  private async acquireToken(): Promise<void> {
    if (this.currentConcurrent < (this.config.globalMaxConcurrent || GLOBAL_MAX_CONCURRENT)) {
      this.currentConcurrent += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
    this.currentConcurrent += 1;
  }

  private releaseToken(): void {
    if (this.currentConcurrent > 0) this.currentConcurrent -= 1;
    if (this.queue.length > 0 && this.currentConcurrent < (this.config.globalMaxConcurrent || GLOBAL_MAX_CONCURRENT)) {
      const resolve = this.queue.shift();
      if (resolve) resolve();
    }
  }

  defaultHeaders(): Record<string, string> {
    return { 'User-Agent': 'RaptorMini-GitHubRateGovernor/1.0', Accept: 'application/vnd.github+json' };
  }

  setAuthProvider(fn: () => Promise<string>) {
    this._getAuthHeader = fn;
  }

  getEtagCacheSnapshot(): Record<string, string> {
    return Object.assign({}, this.etagCache);
  }

  async perform(method: HttpMethod, url: string, headers: Record<string, string> = {}, body: string | null = null, opts: any = {}): Promise<HttpResponse> {
    const endpointKey: EndpointKey = (opts.endpointKey as EndpointKey) || (`${method.toUpperCase()} ${url}` as EndpointKey);
    // Redis cooldown check
    if (this.redisAdapter) {
      try {
        const v = await this.redisAdapter.get(endpointKey as string);
        if (v) {
          const retryUntil = parseInt(v, 10);
          const nowMs = Date.now();
          if (!Number.isNaN(retryUntil) && retryUntil > nowMs) {
            const sleepMs = Math.max(0, retryUntil - nowMs);
            if (this.config.redisCooldownBehavior === 'synthetic') return { status: 529, headers: {}, body: '' };
            await this.sleep(sleepMs);
          }
        }
      } catch (err) {}
    } else if (this.redisClient) {
      try {
        const ridKey = `${this.config.redisCooldownPrefix}:${encodeURIComponent(endpointKey)}`;
        const v = await this.redisClient.get(ridKey);
        if (v) {
          const retryUntil = parseInt(v, 10);
          const nowMs = Date.now();
          if (!Number.isNaN(retryUntil) && retryUntil > nowMs) {
            const sleepMs = Math.max(0, retryUntil - nowMs);
            if (this.config.redisCooldownBehavior === 'synthetic') return { status: 529, headers: {}, body: '' };
              await this.sleep(sleepMs);
          }
        }
      } catch (err) {}
    }

    const now = Date.now();
    if (now < this.hardBlockUntil.getTime()) {
      const sleepMs = Math.max(0, this.hardBlockUntil.getTime() - now);
      await this.sleep(sleepMs);
    }

    await this.acquireToken();
    try {
      this.purgeOldTimestamps(Date.now());
      while (this.recentWindow.length >= (this.config.softBurstMaxReq || 50)) {
        await this.sleep(this.jitterMs(1000));
        this.purgeOldTimestamps(Date.now());
      }
      if (this.remainingLimit <= 5 && Date.now() < this.resetAt.getTime()) {
        const cooldownMs = Math.max(0, this.resetAt.getTime() - Date.now());
        await this.sleep(cooldownMs);
      }
      const etagKey: EtagKey = (opts.etag_key as EtagKey) || (url as EtagKey);
      const cachedEtag = this.etagCache[etagKey];
      if (cachedEtag !== undefined && cachedEtag !== null && cachedEtag !== '') {
        headers['If-None-Match'] = cachedEtag;
      }
      headers = Object.assign(this.defaultHeaders(), headers);

      let attempt = 0;
      let resp: HttpResponse | null = null;
      const maxAttempts = this.config.maxAttempts || 5;
      while (true) {
        attempt += 1;
        this.lastRequestTs = Date.now();
        const qps = this.config.globalQps || GLOBAL_SAFE_QPS;
        await this.sleep(this.jitterMs(Math.floor(1000 / qps)));
        try {
          resp = await this.requestRaw(method, url, headers, body);
        } catch (err) {
          const retryMs = this.computeRetryAfterMs({}, attempt);
          await this.sleep(retryMs);
          if (this.metricsSink) {
            this.metricsSink.onRetry(endpointKey, 'network', attempt);
          }
          if (attempt >= maxAttempts) throw err;
          continue;
        }
        this.recentWindow.push(Date.now());
        this.updateFromHeaders(resp.headers || {});
        const respEtag = ((): string | undefined => {
          const found = Object.keys(resp.headers).find(k => k.toLowerCase() === 'etag');
          return found ? resp.headers[found] : undefined;
        })();
        if (respEtag !== undefined && respEtag !== null && resp.status === 200) this.etagCache[etagKey] = respEtag;
        // metrics: request complete
        if (this.metricsSink) {
          const duration = Date.now() - this.lastRequestTs;
          this.metricsSink.onRequestComplete(endpointKey, resp.status, duration);
        }
        if (resp.status === 304) break;
        if (resp.status === 401 && this._tokenRefreshFn) {
          try {
            await this._tokenRefreshFn();
            if (this._getAuthHeader) {
              const auth = await this._getAuthHeader();
              if (auth) headers['Authorization'] = auth;
            }
            if (this.metricsSink) this.metricsSink.onRetry(endpointKey, 'auth', attempt);
            if (attempt >= maxAttempts) break;
            continue;
          } catch (err) {}
        }
        if (resp.status === 403 || resp.status === 429) {
          const retryAfterMs = this.computeRetryAfterMs(resp.headers, attempt);
          this.hardBlockUntil = new Date(Date.now() + retryAfterMs);
          if (this.metricsSink) this.metricsSink.onBackoff(endpointKey, `status_${resp.status}`, retryAfterMs);
          if (this.redisAdapter) {
            try {
              const retryUntilMs = Date.now() + retryAfterMs;
              const ttlMs = retryAfterMs + 250;
              await this.redisAdapter.setNxWithTtl(endpointKey as string, retryUntilMs, ttlMs);
            } catch (err) {}
          } else if (this.redisClient) {
            try {
              const retryUntilMs = Date.now() + retryAfterMs;
              const ttlMs = retryAfterMs + 250;
              const ridKey = `${this.config.redisCooldownPrefix}:${encodeURIComponent(endpointKey)}`;
              await this.redisClient.set(ridKey, String(retryUntilMs), 'PX', ttlMs, 'NX');
            } catch (err) {}
          }
          await this.sleep(retryAfterMs);
          if (attempt >= maxAttempts) break;
          continue;
        }
        break;
      }
      return (resp as HttpResponse);
    } finally {
      this.releaseToken();
    }
  }

  async paginateWithETag(baseUrl: string, perPage = 100): Promise<PaginateResult> {
    let page = 1;
    let items: unknown[] = [];
    let changed = false;
    let cacheHit = false;
    let pagesFetched = 0;
    while (true) {
      const pageUrl = `${baseUrl}?page=${page}&per_page=${perPage}`;
      const etagKey = `GET ${pageUrl}`;
      const headers: Record<string, string> = {};
      if (this.etagCache[etagKey]) headers['If-None-Match'] = this.etagCache[etagKey];
      if (this._getAuthHeader) {
        const auth = await this._getAuthHeader();
        if (auth) headers['Authorization'] = auth;
      }
      const resp = await this.perform('GET', pageUrl, headers, null, { etag_key: etagKey });
      if (resp.status === 304) {
        if (this.metricsSink) this.metricsSink.onCacheHit(etagKey);
        if (page === 1) {
          cacheHit = true;
          break;
        }
        break;
      }
      if (resp.status !== 200) break;
      changed = true;
      pagesFetched += 1;
      try {
        const parsed = JSON.parse(resp.body || '[]');
        if (Array.isArray(parsed)) {
          items = items.concat(parsed);
          if (parsed.length < perPage) break;
        } else break;
      } catch (e) {
        break;
      }
      page += 1;
    }
    return { changed, pageCount: pagesFetched, items, cacheHit };
  }
}

export const defaultGovernor = new GitHubRateGovernor();
