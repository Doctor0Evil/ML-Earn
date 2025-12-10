export interface MetricsSink {
  onRequestComplete(endpointKey: string, status: number, durationMs: number): void;
  onRetry(endpointKey: string, reason: string, attempt: number): void;
  onBackoff(endpointKey: string, reason: string, durationMs: number): void;
  onCacheHit(endpointKey: string): void;
}

export class PrometheusSink implements MetricsSink {
  private counters: Record<string, number> = {};
  private histograms: Record<string, number[]> = {};
  constructor() {}
  onRequestComplete(endpointKey: string, status: number, durationMs: number) {
    const label = `request_complete_${status}`;
    this.counters[label] = (this.counters[label] || 0) + 1;
    this.histograms[label] = this.histograms[label] || [];
    this.histograms[label].push(durationMs);
  }
  onRetry(endpointKey: string, reason: string, attempt: number) {
    const label = `retry_${reason}`;
    this.counters[label] = (this.counters[label] || 0) + 1;
  }
  onBackoff(endpointKey: string, reason: string, durationMs: number) {
    const label = `backoff_${reason}`;
    this.counters[label] = (this.counters[label] || 0) + 1;
  }
  onCacheHit(endpointKey: string) {
    const label = `cache_hit`;
    this.counters[label] = (this.counters[label] || 0) + 1;
  }
  serialize(): string {
    // Minimal text serialization
    let out = '';
    for (const k in this.counters) {
      out += `${k} ${this.counters[k]}\n`;
    }
    return out;
  }
}
