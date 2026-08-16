/**
 * moderato — content moderation, in tempo.
 *
 * Framework-agnostic core: verdicts, the allow/review/block policy,
 * providers, and media normalisation. React hooks live in "moderato/react";
 * DOM wrappers (fields, upload pickers) live in "moderato/web".
 */

export {
  ALLOW,
  BLOCK,
  REVIEW,
  blocked,
  needsReview,
} from "./types.js";
export type {
  Action,
  CacheConfig,
  CategoryThresholds,
  FailMode,
  ImagePart,
  ImageSource,
  ModerationEvent,
  ModerationProvider,
  ModerationSink,
  ModeratoConfig,
  NormalizedInput,
  PolicyConfig,
  ProviderResult,
  ScreenInput,
  Verdict,
  VerdictRule,
  VideoConfig,
} from "./types.js";

export {
  DEFAULT_BLOCK_SCORE,
  DEFAULT_REFUSAL_MESSAGE,
  DEFAULT_REVIEW_SCORE,
  DEFAULT_ZERO_TOLERANCE,
  POLICY_PRESETS,
  canonical,
  decide,
} from "./policy.js";

export {
  DEFAULT_CACHE_ENTRIES,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_TIMEOUT_MS,
  Moderato,
  createModerato,
} from "./engine.js";
export type { ScreenOptions, ScreenResult } from "./engine.js";

export { TtlCache } from "./cache.js";

export {
  DEFAULT_REFUSAL_FALLBACK,
  REFUSED_STATUS,
  refusalFrom,
} from "./refusal.js";
export type { RefusalOptions } from "./refusal.js";

export { OPENAI_MODERATION_MODEL, openAIProvider } from "./providers/openai.js";
export type { OpenAIProviderOptions } from "./providers/openai.js";
export { httpProvider } from "./providers/http.js";
export type { HttpProviderOptions } from "./providers/http.js";
export { chainProviders, mergeResults } from "./providers/chain.js";
export type { ChainOptions } from "./providers/chain.js";
export { localProvider } from "./providers/local.js";
export type { LocalRule } from "./providers/local.js";
export {
  PROFANITY_PRESET,
  PROFANITY_PRESET_STRICT,
  wordlistProvider,
} from "./providers/wordlist.js";
export type { WordlistEntry } from "./providers/wordlist.js";
export { EN_PROFANITY } from "./vocab/en.js";
export { normalizeTokens } from "./normalize.js";
export type { NormalizedToken } from "./normalize.js";
export { mockProvider } from "./providers/mock.js";
export type { MockProviderOptions } from "./providers/mock.js";

export { bytesToDataUri, downscaleImage, toImagePart } from "./media/image.js";
export {
  DEFAULT_FRAMES,
  DEFAULT_FRAME_DIMENSION,
  VideoUnsupportedError,
  frameTimestamps,
  sampleFrames,
} from "./media/video.js";
export type { FrameEnv } from "./media/video.js";
