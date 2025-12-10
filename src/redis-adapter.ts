export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'PX', ttlMs: number, flag?: 'NX'): Promise<unknown>;
  pttl(key: string): Promise<number>;
}

export class RedisCooldownAdapter {
  client: RedisClientLike;
  prefix: string;
  constructor(client: RedisClientLike, prefix = 'rg:endpoint:cooldown') {
    this.client = client;
    this.prefix = prefix;
  }
  buildKey(endpointKey: string) {
    return `${this.prefix}:${encodeURIComponent(endpointKey)}`;
  }
  async get(endpointKey: string) {
    const k = this.buildKey(endpointKey);
    const v = await this.client.get(k);
    return v !== null ? v : null;
  }
  async setNxWithTtl(endpointKey: string, retryUntilMs: number, ttlMs: number) {
    const k = this.buildKey(endpointKey);
    // NX semantics return 'OK' on success
    return await this.client.set(k, String(retryUntilMs), 'PX', ttlMs, 'NX');
  }
  async pttl(endpointKey: string) {
    const k = this.buildKey(endpointKey);
    return await this.client.pttl(k);
  }
}

export class MockRedisClient implements RedisClientLike {
  store = new Map<string, { value: string; expiresAt: number }>();
  constructor() {}
  async get(key: string) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }
  async set(key: string, value: string, mode: 'PX', ttlMs: number, flag?: 'NX') {
    const existing = this.store.get(key);
    if (flag === 'NX' && existing && Date.now() < existing.expiresAt) return null;
    const expiresAt = Date.now() + ttlMs;
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }
  async pttl(key: string) {
    const entry = this.store.get(key);
    if (!entry) return -2;
    const remain = entry.expiresAt - Date.now();
    if (remain <= 0) {
      this.store.delete(key);
      return -2;
    }
    return remain;
  }
}
