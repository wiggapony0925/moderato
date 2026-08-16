/**
 * A tiny TTL + LRU memo for text screenings.
 *
 * The field hook re-screens every time typing pauses, and people retype the
 * same sentence constantly — backspace a word, put it back, tab away, tab
 * in. Without a memo you pay the provider (and the latency) for the same
 * string over and over, and on a remote provider that is the difference
 * between a hook you can put on every input and one you can't.
 *
 * Text only, deliberately: hashing image bytes costs more than the call it
 * would save, and an image picked twice is usually a different file.
 */

export interface CacheEntry<T> {
  value: T;
  expires: number;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
    /** Injectable so tests don't have to sleep. */
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: string): T | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expires <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Re-insert to mark it most-recently-used: Map keeps insertion order,
    // so the oldest key is always the first one iteration yields.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.value;
  }

  set(key: string, value: T): void {
    if (this.maxEntries <= 0) return;
    this.entries.delete(key);
    this.entries.set(key, { value, expires: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
