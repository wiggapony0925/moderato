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
}

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

export interface PolicyConfig {
  /**
   * A hit here refuses outright. Keep it short: these are the categories
   * where "publish and review later" is not an acceptable position.
   */
  zeroTolerance?: Iterable<string>;
  /**
   * Score above which a category counts even when the provider didn't flag
   * it — the threshold for a *human* to glance at something.
   */
  reviewScore?: number;
}

/** What to do when the provider errors, times out, or can't run. */
export type FailMode = typeof ALLOW | typeof REVIEW | typeof BLOCK;

export interface VideoConfig {
  /** How many frames to sample per video. */
  frames?: number;
  /** Longest edge of a sampled frame, px. */
  maxDimension?: number;
}

export interface ModeratoConfig {
  /**
   * The classifier. Omit it and screen() allows everything — that is the
   * server-authoritative mode: the client wraps UX around the *server's*
   * refusals and does no screening of its own.
   */
  provider?: ModerationProvider;
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
}
