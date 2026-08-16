---
id: api
title: API reference
---

# API reference

Four entry points. Everything is exported by name; there are no default exports
except the React components.

```ts
import { … } from "moderato";        // core: engine, policy, providers, media
import { … } from "moderato/react";  // hooks — safe in React DOM and React Native
import { … } from "moderato/web";    // DOM components — browser only
import { … } from "moderato/server"; // Node / edge — no framework dependency
```

:::info Kept honest mechanically
Every name below is checked against the package's real exports on every CI run
(`npm run check:docs`). A rename that misses this page fails the build. See
[Upgrading](./upgrading.md).
:::

## `moderato`

### Setup

The front door. One config object in product terms; it assembles the engines
and policies you would otherwise assemble by hand. See [Your
rules](./configuring.md).

| export | signature |
| --- | --- |
| `defineModeration` | `(config?: ModerationConfig) => Moderation` |
| `Moderation#screen` | `(text: string, surface?: string, options?: ScreenOptions) => Promise<Verdict>` |
| `Moderation#field` | `(surface?: string) => { engine, policy }` — spread into `useModeratedField` |
| `Moderation#mask` | `(text: string, surface?: string, mask?: Mask) => string` |
| `Moderation#engineFor` | `(surface?: string) => Moderato` |
| `Moderation#policyFor` | `(surface?: string) => PolicyConfig` |
| `Moderation#surfaces` | `string[]` — the names you declared |

```ts
interface ModerationConfig {
  tolerance?: "strict" | "balanced" | "open";   // default "balanced"
  audience?: "general" | "adult" | "minor";     // default "general"
  rules?: Record<string, "allow" | "review" | "block">;
  allow?: string[];                             // words, matched evasion-resistantly
  deny?: string[] | Record<string, string[]>;   // words, always refused
  personalData?: Array<PersonalDataName | PiiCategory> | "all" | "none";
  vocabulary?: WordlistEntry[];                 // replaces PROFANITY_PRESET
  provider?: ModerationProvider | ModerationProvider[];  // runs after the matcher
  surfaces?: Record<string, SurfaceConfig>;
  timeoutMs?: number;
  failMode?: FailMode;
  cache?: CacheConfig | false;
  sink?: ModerationSink;
}

interface WordlistOptions {
  allow?: string[];          // words this product permits, evasion-resistantly
  scanCompound?: boolean;    // shit+show; boundary + remainder-is-a-word
  compoundParts?: string[];  // your own remainder vocabulary
  scanFused?: boolean;       // any listed word inside a long token (blunter)
  minFusedLength?: number;   // default 6
  minFusedToken?: number;    // default 8
}

interface SurfaceConfig {
  kind?: "body" | "identity";     // identity = permanent, public, no spaces
  audience?: Audience;
  allow?: string[];               // merged over the global ones
  rules?: Record<string, CategoryRule>;
  policy?: PolicyConfig;          // replace the derived policy entirely
}
```

### Engine

| export | signature |
| --- | --- |
| `createModerato` | `(config?: ModeratoConfig) => Moderato` |
| `Moderato` | the class, if you prefer `new` |
| `Moderato#screen` | `(input: ScreenInput, options?: ScreenOptions) => Promise<Verdict>` |
| `Moderato#screenText` | `(text: string, options?: ScreenOptions) => Promise<Verdict>` |
| `Moderato#screenDetailed` | `(input, options?) => Promise<ScreenResult>` — verdict **and** raw provider result |
| `Moderato#enabled` | `boolean` — is a provider configured |
| `Moderato#clearCache` | `() => void` |
| `DEFAULT_TIMEOUT_MS` | `6000` |
| `DEFAULT_CACHE_ENTRIES` | `200` |
| `DEFAULT_CACHE_TTL_MS` | `60_000` |

```ts
interface ModeratoConfig {
  provider?: ModerationProvider | ModerationProvider[]; // an array is a chain
  policy?: PolicyConfig;
  timeoutMs?: number;
  failMode?: "allow" | "review" | "block";  // default "review"
  video?: { frames?: number; maxDimension?: number };
  cache?: { maxEntries?: number; ttlMs?: number } | false;
  sink?: ModerationSink;
}

interface ScreenOptions {
  policy?: PolicyConfig;   // per-call override
  context?: unknown;       // forwarded to the sink
  signal?: AbortSignal;    // honoured alongside the engine's timeout
}

interface ScreenInput {
  text?: string | null;
  images?: ImageSource[];  // Blob | {dataUri} | {bytes, contentType}
  videos?: Blob[];         // sampled to frames; browser only
}
```

### Policy

| export | |
| --- | --- |
| `decide` | `(result: ProviderResult, policy?: PolicyConfig) => Verdict` — pure |
| `canonical` | `(name: string) => string` — normalise a category name |
| `POLICY_PRESETS` | `balanced` · `identity` · `strict` · `adult` · `minor` |
| `DEFAULT_ZERO_TOLERANCE` | the default refuse-outright set (includes `sexual`) |
| `UNIVERSAL_ZERO_TOLERANCE` | the part that is indefensible on any platform |
| `DEFAULT_REVIEW_SCORE` | `0.55` |
| `DEFAULT_BLOCK_SCORE` | `0.92` |
| `DEFAULT_REFUSAL_MESSAGE` | the fallback author-facing sentence |
| `ALLOW` `REVIEW` `BLOCK` | the action constants |
| `blocked` / `needsReview` | `(verdict) => boolean` predicates |

```ts
interface PolicyConfig {
  zeroTolerance?: Iterable<string>;
  reviewScore?: number;
  blockScore?: number;                                   // Infinity = never auto-block
  categories?: Record<string, { review?: number; block?: number }>;
}
```

A category with `review: Infinity` is ignored entirely — not scored lower, but
dropped even when the provider flags it. That is the opt-out
`rules: { x: "allow" }` compiles to.

### Providers

| export | |
| --- | --- |
| `openAIProvider` | `(options: OpenAIProviderOptions) => ModerationProvider` |
| `OPENAI_MODERATION_MODEL` | `"omni-moderation-latest"` |
| `httpProvider` | `(options: HttpProviderOptions) => ModerationProvider` |
| `wordlistProvider` | `(entries: WordlistEntry[], options?: WordlistOptions) => ModerationProvider` |
| `COMPOUND_PARTS` | words allowed to complete a compound — see [How it works](./algorithm.mdx) |
| `COMPOUND_HOMOGRAPHS` | listed words that are also ordinary English, never split |
| `localProvider` | `(rules: LocalRule[]) => ModerationProvider` |
| `mockProvider` | `(options?: MockProviderOptions) => ModerationProvider` |
| `chainProviders` | `(providers, options?) => ModerationProvider` |
| `mergeResults` | `(results: ProviderResult[]) => ProviderResult` |
| `piiProvider` | `(options?: PiiOptions) => ModerationProvider` — see [Personal data](./personal-data.md) |
| `findPii` | `(text: string, options?: PiiOptions) => PiiMatch[]` — with offsets |
| `redactPii` | `(text: string, options?) => string` — mask rather than refuse |
| `luhn` | `(value: string) => boolean` — the card checksum, exported on its own |
| `PII_CATEGORIES` | every detector, for building a picker |
| `PROFANITY_PRESET` | curated wordlist entries |
| `PROFANITY_PRESET_STRICT` | the full LDNOOBW corpus + the hate set |
| `EN_PROFANITY` | the raw corpus array |
| `normalizeTokens` | `(text: string) => NormalizedToken[]` — the anti-evasion tokeniser, with source offsets |
| `findTerms` | `(text, entries, options?) => Span[]` — matches, with where they are |

### Media

| export | |
| --- | --- |
| `toImagePart` | `(source: ImageSource) => Promise<ImagePart>` |
| `bytesToDataUri` | `(bytes: Uint8Array, contentType: string) => string` |
| `downscaleImage` | `(blob: Blob, maxDimension?: number) => Promise<Blob>` |
| `sampleFrames` | `(video: Blob, config?, env?) => Promise<ImagePart[]>` |
| `frameTimestamps` | `(duration: number, frames: number) => number[]` |
| `VideoUnsupportedError` | thrown where video cannot be decoded |
| `DEFAULT_FRAMES` / `DEFAULT_FRAME_DIMENSION` | `6` / `512` |

### Masking

The third outcome: replace the offending characters and let the message
through. See [Personal data & age](./personal-data.md).

| export | |
| --- | --- |
| `maskSpans` | `(text: string, spans: Span[], mask?: Mask) => string` |
| `hashes` | the Roblox rendering — `####`, length preserved |
| `labelled` | `[phone removed]`, when hiding the removal would be worse |

### Refusals and utilities

| export | |
| --- | --- |
| `refusalFrom` | `(err: unknown, options?: RefusalOptions) => string \| null` |
| `REFUSED_STATUS` | `422` |
| `DEFAULT_REFUSAL_FALLBACK` | the fallback string |
| `TtlCache` | the memo, if you want one of your own |

## `moderato/react`

| export | |
| --- | --- |
| `useModeratedField` | wrap an input — [guide](./field-hook.md) |
| `useModeratedSubmit` | wrap a publish call — [guide](./submit-hook.md) |
| `useModeration` | low-level: `check()`, `verdict`, `checking`, `reset()` |
| `DEFAULT_DEBOUNCE_MS` / `DEFAULT_MIN_LENGTH` | `400` / `2` |
| `refusalFrom` `REFUSED_STATUS` `DEFAULT_REFUSAL_FALLBACK` | re-exported |

## `moderato/web`

| export | |
| --- | --- |
| `ModeratedUpload` | file picker with optional preflight — [guide](./uploads.md) |

## `moderato/server`

| export | |
| --- | --- |
| `guard` | `(engine, input, options?) => Promise<Verdict>` — throws on block |
| `ModerationError` | `status` `code` `verdict` `toJSON()` |
| `isModerationError` | `(err: unknown) => err is ModerationError` |
| `createModerationHandler` | `(engine, options?) => (request: Request) => Promise<Response>` |
| `toNodeHandler` | `(handler) => (req, res) => Promise<void>` |
| `DEFAULT_MAX_BYTES` | `8 * 1024 * 1024` |

## Types

Exported from the entry point that uses them:

`Moderation` · `ModerationConfig` · `SurfaceConfig` · `SurfaceKind` ·
`CategoryRule` · `Tolerance` · `Audience` · `PersonalDataName` ·
`Action` · `Verdict` · `VerdictRule` · `PolicyConfig` · `CategoryThresholds` ·
`ProviderResult` · `ModerationProvider` · `ModeratoConfig` · `ScreenInput` ·
`ScreenOptions` · `ScreenResult` · `NormalizedInput` · `NormalizedToken` ·
`ImagePart` · `ImageSource` · `VideoConfig` · `FrameEnv` · `CacheConfig` ·
`FailMode` · `ModerationEvent` · `ModerationSink` · `RefusalOptions` ·
`WordlistEntry` · `WordlistOptions` · `PiiCategory` · `PiiMatch` · `PiiOptions` · `Span` · `Mask` · `LocalRule` · `ChainOptions` · `HttpProviderOptions` ·
`OpenAIProviderOptions` · `MockProviderOptions` · `ModeratedField` ·
`UseModeratedFieldOptions` · `FieldCheck` · `ModeratedSubmit` ·
`ModeratedSubmitOptions` · `MutationLike` · `MutationCallbacks` ·
`SubmitTarget` · `UseModeration` · `ModeratedUploadProps` ·
`ModeratedUploadApi` · `GuardOptions` · `HandlerOptions` ·
`ModerationRequestBody` · `ModerationResponseBody`

## Telemetry

```ts
createModerato({
  provider,
  sink: (event) => {
    metrics.timing("moderation.ms", event.durationMs, { provider: event.provider });
    if (event.verdict.action !== "allow") queue.record(event);
  },
});

interface ModerationEvent {
  verdict: Verdict;
  input: { text?: string; imageCount: number };  // never image bytes
  provider: string;                              // or "cache"
  durationMs: number;
  context?: unknown;                             // whatever you passed
}
```

Every screening is reported, `allow` included — a queue you can only see the bad
half of is a queue you cannot tune. The sink is never awaited by the engine and
cannot throw into it: a broken logger must not be able to fail a publish.
