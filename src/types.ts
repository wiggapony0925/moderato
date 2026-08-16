/**
 * The shared vocabulary. Everything else in the package speaks in these
 * terms, and they deliberately mirror the shape of a server-side policy
 * (allow / review / block) rather than a classifier's raw output — the
 * classifier is an implementation detail you can swap.
 */

export const ALLOW = "allow";
export const REVIEW = "review";
export const BLOCK = "block";

export type Action = typeof ALLOW | typeof REVIEW | typeof BLOCK;

/** What screening decided, and enough detail to explain it later. */
export interface Verdict {
  action: Action;
  /** Categories that tripped, worst first. Canonical names ("sexual/minors"). */
  categories: string[];
  /** Highest category score seen (0–1). Useful for ranking a review queue. */
  score: number;
  /** Human-readable note — why the verdict is what it is. */
  detail?: string;
  /**
   * Why the policy landed here. Automation needs to tell a
   * zero-tolerance refusal apart from a confidence-band one apart from a
   * provider outage — they deserve different follow-ups.
   */
  rule?: VerdictRule;
  /** The category that drove the action, if one did. */
  primary?: string;
  /** True when no screening ran (no provider, or nothing to screen). */
  screened?: boolean;
}

export type VerdictRule =
  | "clean"
  | "zero-tolerance"
  | "block-score"
  | "flagged"
  | "failed"
  | "not-screened";

export const blocked = (v: Verdict): boolean => v.action === BLOCK;
export const needsReview = (v: Verdict): boolean =>
  v.action === BLOCK || v.action === REVIEW;

/** What a provider returns: per-category flags and scores, raw. */
export interface ProviderResult {
  /** Category → did the provider itself flag it. */
  flags: Record<string, boolean>;
  /** Category → score 0–1. Keys may use "_" or "/"; the policy canonicalises. */
  scores: Record<string, number>;
}

/** One image, normalised to a data URI — the only form every provider takes. */
export interface ImagePart {
  dataUri: string;
}

/** What the engine hands a provider after normalisation. */
export interface NormalizedInput {
  text?: string;
  images: ImagePart[];
}

/**
 * A classifier. `classify` receives text and/or images in ONE call — one
 * call per screened thing keeps latency and provider bills sane, and it is
 * how multi-modal endpoints (OpenAI omni-moderation) want their input.
 */
export interface ModerationProvider {
  readonly name: string;
  classify(input: NormalizedInput, signal?: AbortSignal): Promise<ProviderResult>;
}

/** Anything screen() accepts as an image. */
export type ImageSource =
  | Blob
  | { dataUri: string }
  | { bytes: Uint8Array; contentType: string };

/** What screen() accepts. Videos are sampled to frames (browser only). */
export interface ScreenInput {
  text?: string | null;
  images?: ImageSource[];
  videos?: Blob[];
}

/** Per-category threshold overrides. Undefined members fall back to the
 *  policy-wide `reviewScore` / `blockScore`. */
export interface CategoryThresholds {
  review?: number;
  block?: number;
}

export interface PolicyConfig {
  /**
   * A hit here refuses outright, at any score. Keep it short: these are the
   * categories where "publish and review later" is not an acceptable
   * position.
   */
  zeroTolerance?: Iterable<string>;
  /**
   * Score above which a category counts even when the provider didn't flag
   * it — the threshold for a *human* to glance at something.
   */
  reviewScore?: number;
  /**
   * Score at or above which ANY category refuses outright, not just the
   * zero-tolerance ones. This is the automation dial: the band between
   * `reviewScore` and `blockScore` is what a human actually sees, and
   * lowering `blockScore` trades queue volume for false refusals.
   * Undefined means "only zeroTolerance blocks".
   */
  blockScore?: number;
  /** Per-category overrides, canonical names ("hate/threatening"). */
  categories?: Record<string, CategoryThresholds>;
}

/** What to do when the provider errors, times out, or can't run. */
export type FailMode = typeof ALLOW | typeof REVIEW | typeof BLOCK;

export interface VideoConfig {
  /** How many frames to sample per video. */
  frames?: number;
  /** Longest edge of a sampled frame, px. */
  maxDimension?: number;
}

/**
 * One screening, as it happened — the record automation is built on.
 * Emitted for every screen() that actually ran a provider, allow included:
 * a queue you can only see the bad half of is a queue you cannot tune.
 */
export interface ModerationEvent {
  verdict: Verdict;
  /** What was screened. Text is truncated; image bytes are never included. */
  input: { text?: string; imageCount: number };
  /** Provider that produced it, or "cache". */
  provider: string;
  /** Wall-clock time the screen took, ms. */
  durationMs: number;
  /** Whatever the caller passed as `context` to screen(). */
  context?: unknown;
}

/**
 * Where screenings go after they're decided — your log, your review queue,
 * your metrics. Never awaited by the engine and never allowed to throw
 * into it: telemetry must not be able to fail a publish.
 */
export type ModerationSink = (event: ModerationEvent) => void | Promise<void>;

export interface CacheConfig {
  /** Max distinct text screenings kept. 0 disables. Default 200. */
  maxEntries?: number;
  /** How long an entry stays fresh, ms. Default 60_000. */
  ttlMs?: number;
}

export interface ModeratoConfig {
  /**
   * The classifier. Omit it and screen() allows everything — that is the
   * server-authoritative mode: the client wraps UX around the *server's*
   * refusals and does no screening of its own.
   *
   * An array is a CHAIN: cheap-and-local first, expensive-and-remote last,
   * short-circuiting as soon as one of them flags something. See
   * `chainProviders`.
   */
  provider?: ModerationProvider | ModerationProvider[];
  policy?: PolicyConfig;
  /** Wall-clock budget for one provider call, ms. */
  timeoutMs?: number;
  /**
   * Verdict when screening can't run. Default "review" — fail open, but
   * never silent: a vendor outage should not become your outage, and the
   * content still gets a human look.
   */
  failMode?: FailMode;
  video?: VideoConfig;
  /**
   * Memoise text-only screenings. A field hook re-screens on every pause in
   * typing, and people retype the same draft constantly — without this you
   * pay the provider for the same sentence a dozen times. Images are never
   * cached (hashing them costs more than it saves).
   */
  cache?: CacheConfig | false;
  /** Where decided screenings go. See `ModerationSink`. */
  sink?: ModerationSink;
}
