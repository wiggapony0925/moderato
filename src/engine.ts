/**
 * The engine: one `screen()` call for text + images + video, one verdict.
 *
 * Failure is open, but never silent. If the provider errors or times out,
 * the verdict is `failMode` (default "review") with a detail saying why —
 * a third party's outage should not become yours, and the alternative to
 * the review flag is content nobody ever looked at.
 */

import { TtlCache } from "./cache.js";
import { decide } from "./policy.js";
import { chainProviders } from "./providers/chain.js";
import { toImagePart } from "./media/image.js";
import { sampleFrames } from "./media/video.js";
import type {
  ImagePart,
  ModerationEvent,
  ModerationProvider,
  ModeratoConfig,
  NormalizedInput,
  PolicyConfig,
  ProviderResult,
  ScreenInput,
  Verdict,
} from "./types.js";
import { ALLOW, REVIEW } from "./types.js";

export const DEFAULT_TIMEOUT_MS = 6000;
export const DEFAULT_CACHE_ENTRIES = 200;
export const DEFAULT_CACHE_TTL_MS = 60_000;

/** How much screened text is copied onto a sink event. */
const EVENT_TEXT_CHARS = 500;

const allow = (detail?: string): Verdict => ({
  action: ALLOW,
  categories: [],
  score: 0,
  rule: "not-screened",
  screened: false,
  ...(detail ? { detail } : {}),
});

/**
 * A verdict plus the raw classifier output that produced it. The server
 * handler needs both: the decision for its own enforcement, and the raw
 * scores to forward to a client engine that may hold a stricter policy.
 */
export interface ScreenResult {
  verdict: Verdict;
  /** Null when nothing was classified (no provider, nothing to screen, a failure). */
  result: ProviderResult | null;
}

/** Per-call overrides. One engine can serve surfaces with different rules. */
export interface ScreenOptions {
  /**
   * Use this policy instead of the engine's. A username and a comment are
   * screened by the same classifier and judged by different rules — see
   * `POLICY_PRESETS.identity`.
   */
  policy?: PolicyConfig;
  /** Passed through to the sink untouched. Put your user id here. */
  context?: unknown;
  /** Caller's cancellation, honoured alongside the engine's timeout. */
  signal?: AbortSignal;
}

export class Moderato {
  private readonly provider: ModerationProvider | undefined;
  private readonly cache: TtlCache<ScreenResult> | undefined;

  constructor(private readonly config: ModeratoConfig = {}) {
    const configured = config.provider;
    this.provider = Array.isArray(configured)
      ? configured.length > 0
        ? chainProviders(configured)
        : undefined
      : configured;

    if (config.cache !== false) {
      const max = config.cache?.maxEntries ?? DEFAULT_CACHE_ENTRIES;
      if (max > 0) {
        this.cache = new TtlCache<ScreenResult>(
          max,
          config.cache?.ttlMs ?? DEFAULT_CACHE_TTL_MS,
        );
      }
    }
  }

  /** Is a provider configured, i.e. does screen() actually screen? */
  get enabled(): boolean {
    return Boolean(this.provider);
  }

  /** Forget every memoised screening. Call it when the policy changes. */
  clearCache(): void {
    this.cache?.clear();
  }

  /**
   * Screen a piece of content in ONE provider call. Returns "allow" when
   * there is nothing to screen or no provider is configured (that is the
   * server-authoritative mode, not a failure). Never throws.
   */
  async screen(input: ScreenInput, options: ScreenOptions = {}): Promise<Verdict> {
    return (await this.screenDetailed(input, options)).verdict;
  }

  /**
   * `screen()`, keeping the raw classifier output alongside the verdict.
   * Servers forwarding a screening to a client engine need the scores;
   * everyone else wants `screen()`.
   */
  async screenDetailed(
    input: ScreenInput,
    options: ScreenOptions = {},
  ): Promise<ScreenResult> {
    const provider = this.provider;
    const started = now();

    let normalized: NormalizedInput;
    try {
      normalized = await this.normalize(input);
    } catch (err) {
      // Couldn't even read the media (e.g. video with no decoder). That is
      // a screening failure, not an allow.
      if (!provider) return { verdict: allow(), result: null };
      const verdict = this.failed(err);
      this.emit(verdict, normalizedFallback(input), "normalize", started, options);
      return { verdict, result: null };
    }

    const nothingToScreen = !normalized.text && normalized.images.length === 0;
    // NO PROVIDER IS NOT THE SAME AS A FAILED CHECK. Unconfigured means
    // screening is off on purpose — the server (or nobody) is the screen.
    if (nothingToScreen || !provider) return { verdict: allow(), result: null };

    const policy = options.policy ?? this.config.policy;
    const key = this.cacheKey(normalized, policy);
    if (key !== undefined) {
      const hit = this.cache?.get(key);
      if (hit) {
        this.emit(hit.verdict, normalized, "cache", started, options);
        return hit;
      }
    }

    const screened = await this.classify(
      provider,
      normalized,
      policy,
      options.signal,
    );
    if (key !== undefined && screened.verdict.rule !== "failed") {
      this.cache?.set(key, screened);
    }
    this.emit(screened.verdict, normalized, provider.name, started, options);
    return screened;
  }

  /** Screen plain text. The common case, spelled the short way. */
  screenText(text: string, options: ScreenOptions = {}): Promise<Verdict> {
    return this.screen({ text }, options);
  }

  private async classify(
    provider: ModerationProvider,
    normalized: NormalizedInput,
    policy: PolicyConfig | undefined,
    caller: AbortSignal | undefined,
  ): Promise<ScreenResult> {
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const onCallerAbort = () => controller.abort();
    caller?.addEventListener("abort", onCallerAbort, { once: true });
    if (caller?.aborted) controller.abort();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // Race an abort rejection alongside the call: a provider that ignores
      // the signal (or a fetch that hangs before headers) must not hold the
      // verdict past the budget.
      const result = await Promise.race([
        provider.classify(normalized, controller.signal),
        rejectOnAbort(controller.signal),
      ]);
      return { verdict: decide(result, policy), result };
    } catch (err) {
      if (!controller.signal.aborted) return { verdict: this.failed(err), result: null };
      return {
        verdict: this.failed(
          caller?.aborted
            ? new Error("cancelled by caller")
            : new Error(`timed out after ${timeoutMs}ms`),
        ),
        result: null,
      };
    } finally {
      clearTimeout(timer);
      caller?.removeEventListener("abort", onCallerAbort);
    }
  }

  private async normalize(input: ScreenInput): Promise<NormalizedInput> {
    const text = input.text?.trim() || undefined;
    const images: ImagePart[] = [];
    for (const source of input.images ?? []) {
      images.push(await toImagePart(source));
    }
    for (const video of input.videos ?? []) {
      images.push(...(await sampleFrames(video, this.config.video)));
    }
    return { text, images };
  }

  /**
   * A cache key, or undefined for anything not worth caching. Text only:
   * the policy is part of the key because the same sentence is a block on a
   * username and an allow in a comment.
   */
  private cacheKey(
    input: NormalizedInput,
    policy: PolicyConfig | undefined,
  ): string | undefined {
    if (!this.cache || input.images.length > 0 || !input.text) return undefined;
    // A NUL separator: it cannot occur in a policy key or in typed
    // text, so no pair of (policy, text) can collide with another.
    return `${stablePolicyKey(policy)}\u0000${input.text}`;
  }

  private failed(err: unknown): Verdict {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      action: this.config.failMode ?? REVIEW,
      categories: [],
      score: 0,
      rule: "failed",
      screened: false,
      detail: `Screening failed: ${reason}`,
    };
  }

  /**
   * Hand the screening to the sink. Never awaited, never able to throw
   * inward: a broken logger must not be able to fail a publish.
   */
  private emit(
    verdict: Verdict,
    input: NormalizedInput,
    provider: string,
    started: number,
    options: ScreenOptions,
  ): void {
    const sink = this.config.sink;
    if (!sink) return;
    const event: ModerationEvent = {
      verdict,
      input: {
        ...(input.text ? { text: input.text.slice(0, EVENT_TEXT_CHARS) } : {}),
        imageCount: input.images.length,
      },
      provider,
      durationMs: Math.round(now() - started),
      ...(options.context !== undefined ? { context: options.context } : {}),
    };
    try {
      void Promise.resolve(sink(event)).catch(() => {});
    } catch {
      /* a sink that throws synchronously is still just a sink */
    }
  }
}

const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

/** What we know about the input when normalisation itself blew up. */
const normalizedFallback = (input: ScreenInput): NormalizedInput => ({
  ...(input.text ? { text: input.text } : {}),
  images: [],
});

/** Policy identity for cache keys — order-independent, cheap. */
function stablePolicyKey(policy: PolicyConfig | undefined): string {
  if (!policy) return "";
  const zero = policy.zeroTolerance
    ? Array.from(policy.zeroTolerance).sort().join(",")
    : "";
  const categories = policy.categories
    ? Object.entries(policy.categories)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, t]) => `${name}:${t.review ?? ""}:${t.block ?? ""}`)
        .join(",")
    : "";
  return `${policy.reviewScore ?? ""}|${policy.blockScore ?? ""}|${zero}|${categories}`;
}

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  // Already aborted? The event fired before we got here and will never
  // fire again — listening for it would wait forever, which is exactly
  // the hang this race exists to prevent.
  if (signal.aborted) return Promise.reject(new Error("aborted"));
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), {
      once: true,
    });
  });
}

export const createModerato = (config: ModeratoConfig = {}): Moderato =>
  new Moderato(config);
