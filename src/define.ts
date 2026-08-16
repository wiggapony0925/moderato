/**
 * One config object, in the words a product team actually uses.
 *
 * Everything underneath this file is composable on purpose — providers,
 * policies, presets, chains — and composable is not the same as easy. Getting
 * a sensible setup out of the parts means knowing that identity fields want
 * the fused scan, that PII wants its own provider, that the browser wants the
 * cheap matcher first, and which four thresholds move together. That is a lot
 * to know before you have screened your first comment.
 *
 * So this is the front door. You say what your product allows in the terms
 * you would use in a meeting, and it assembles the same objects you would
 * have assembled by hand.
 *
 * There are three dials, and they are deliberately different sizes:
 *
 * - `rules` is the big one — a whole category, permitted or refused.
 *   Instagram allows swearing in comments and does not allow slurs; that is
 *   `{ profanity: "allow" }` and nothing else.
 * - `allow` and `deny` are the small ones — individual words, for when the
 *   category is right and a few of its members are not.
 * - `surfaces` says where each of those applies, because a username is not
 *   a comment and should never be judged like one.
 *
 * A rule beats everything below it, the surface's own judgement included, so
 * a rule that is really about one surface belongs on that surface.
 *
 * ```ts
 * export const moderation = defineModeration({
 *   tolerance: "balanced",
 *   deny: ["ourcompetitor"],            // never, anywhere
 *   personalData: ["card", "ssn"],
 *   surfaces: {
 *     // People swear in comments. A handle is permanent, so it does not.
 *     comment: { kind: "body", rules: { profanity: "allow" } },
 *     username: { kind: "identity" },
 *     kidsChat: { kind: "body", audience: "minor" },
 *   },
 *   provider: httpProvider({ url: "/api/moderate" }),
 * });
 *
 * await moderation.screen(text, "comment");
 * useModeratedField({ ...moderation.field("username") });
 * moderation.mask(text, "kidsChat");
 * ```
 *
 * Nothing here is load-bearing. It returns the engine and the policies, so
 * you can drop to the parts at any point without unpicking anything.
 */

import { Moderato, createModerato, type ScreenOptions } from "./engine.js";
import { hashes, maskSpans, type Mask } from "./mask.js";
import {
  DEFAULT_BLOCK_SCORE,
  DEFAULT_REVIEW_SCORE,
  DEFAULT_ZERO_TOLERANCE,
  UNIVERSAL_ZERO_TOLERANCE,
  canonical,
} from "./policy.js";
import { chainProviders } from "./providers/chain.js";
import {
  PII_CATEGORIES,
  findPii,
  piiProvider,
  type PiiCategory,
} from "./providers/pii.js";
import {
  PROFANITY_PRESET,
  findTerms,
  wordlistProvider,
  type WordlistEntry,
} from "./providers/wordlist.js";
import type {
  CacheConfig,
  CategoryThresholds,
  FailMode,
  ModerationProvider,
  ModerationSink,
  PolicyConfig,
  Verdict,
} from "./types.js";

/** How much benefit of the doubt your product extends, before any rule. */
export type Tolerance = "strict" | "balanced" | "open";

/** Who is writing. Changes what is refused outright, not just how strictly. */
export type Audience = "general" | "adult" | "minor";

/**
 * What kind of field this is.
 *
 * `body` is anything somebody writes and can edit or delete. `identity` is a
 * name — permanent, public, attached to every row the account touches, and
 * with no whitespace for a matcher to work with. The two want genuinely
 * different handling, and it is the one distinction worth making up front.
 */
export type SurfaceKind = "body" | "identity";

/**
 * What a whole category is worth to you.
 *
 * - `"allow"` — never acted on, even if the classifier flags it. This is the
 *   Instagram setting: swearing is part of how people talk here.
 * - `"review"` — always noted, never refused. Someone looks, nothing breaks.
 * - `"block"` — refused at any score, like the built-in zero-tolerance set.
 *
 * A rule beats everything else — the tolerance, the audience defaults and the
 * surface's own judgement — because you wrote it and they are guesses. That
 * cuts both ways: a top-level `{ profanity: "allow" }` allows profanity in
 * usernames too, so put a surface-shaped rule on its surface.
 */
export type CategoryRule = "allow" | "review" | "block";

/** Personal data, in the short names rather than the `pii/` ones. */
export type PersonalDataName =
  | "email"
  | "phone"
  | "ssn"
  | "card"
  | "ip"
  | "location";

export interface SurfaceConfig {
  kind?: SurfaceKind;
  audience?: Audience;
  /** Extra word allowances, this surface only. */
  allow?: string[];
  /** Category rules for this surface, merged over the global ones. */
  rules?: Record<string, CategoryRule>;
  /** Replace the derived policy entirely. The escape hatch. */
  policy?: PolicyConfig;
}

export interface ModerationConfig {
  /** Default `"balanced"`. */
  tolerance?: Tolerance;
  /** Default `"general"`. */
  audience?: Audience;
  /**
   * What each category is worth to you: `"allow"`, `"review"` or `"block"`.
   * The main dial, and usually the only one a product needs to touch.
   */
  rules?: Record<string, CategoryRule>;
  /**
   * Words your product is fine with, even though the vocabulary lists them.
   * Matched the same evasion-resistant way listed words are, so allowing
   * "ass" allows "@ss" too. Use this when the category is right and a few of
   * its members are not; use `rules` when the category itself is wrong.
   */
  allow?: string[];
  /**
   * Words your product refuses that no preset knows about — a competitor, a
   * banned nickname, a term of art that means something in your community.
   * Always refused, at any tolerance. Pass an object to name the category.
   */
  deny?: string[] | Record<string, string[]>;
  /**
   * Which personal data to detect, in short names (`"card"`, `"ssn"`). `"all"`
   * for every detector, `"none"` to skip it. Default `"none"`.
   */
  personalData?: Array<PersonalDataName | PiiCategory> | "all" | "none";
  /** Replace the built-in vocabulary entirely. */
  vocabulary?: WordlistEntry[];
  /** Your classifier, if you have one. Runs after the offline matcher. */
  provider?: ModerationProvider | ModerationProvider[];
  /** Named surfaces. Anything not named here uses the defaults. */
  surfaces?: Record<string, SurfaceConfig>;

  timeoutMs?: number;
  failMode?: FailMode;
  cache?: CacheConfig | false;
  sink?: ModerationSink;
}

export interface Moderation<S extends string = string> {
  /** The engine for a surface. Named surfaces may differ; most share one. */
  engineFor(surface?: S): Moderato;
  /** The policy for a surface, if you want to pass it somewhere yourself. */
  policyFor(surface?: S): PolicyConfig;
  /** Screen text as a given surface. */
  screen(text: string, surface?: S, options?: ScreenOptions): Promise<Verdict>;
  /**
   * Spread into `useModeratedField` — it carries the right engine and policy
   * for the surface, and you add the callbacks and the copy.
   */
  field(surface?: S): { engine: Moderato; policy: PolicyConfig };
  /**
   * The message with everything objectionable replaced rather than refused.
   * Offline only: it masks what the matcher and the PII rules can locate, and
   * a classifier score has no span to mask.
   */
  mask(text: string, surface?: S, mask?: Mask): string;
  /** The surface names you declared. */
  surfaces: S[];
}

const THRESHOLDS: Record<Tolerance, { review: number; block: number }> = {
  strict: { review: 0.3, block: 0.8 },
  balanced: { review: DEFAULT_REVIEW_SCORE, block: DEFAULT_BLOCK_SCORE },
  open: { review: 0.7, block: 0.96 },
};

/** Categories refused at any score, before rules and the surface have a say. */
function baseZeroTolerance(audience: Audience): string[] {
  if (audience === "adult") return Array.from(UNIVERSAL_ZERO_TOLERANCE);
  if (audience === "minor") {
    return [
      ...Array.from(DEFAULT_ZERO_TOLERANCE),
      "hate",
      "harassment",
      "profanity",
      "self-harm",
      "self-harm/intent",
      "violence",
      "illicit",
      // Contact details from a child are not a moderation question.
      ...Array.from(PII_CATEGORIES),
    ];
  }
  return Array.from(DEFAULT_ZERO_TOLERANCE);
}

const normalizeDeny = (deny: ModerationConfig["deny"]): WordlistEntry[] => {
  if (!deny) return [];
  if (Array.isArray(deny)) {
    return deny.length > 0
      ? [{ category: "denied", words: deny, score: 0.99 }]
      : [];
  }
  return Object.entries(deny)
    .filter(([, words]) => words.length > 0)
    .map(([category, words]) => ({ category, words, score: 0.99 }));
};

const piiCategories = (
  personalData: ModerationConfig["personalData"],
): PiiCategory[] => {
  if (!personalData || personalData === "none") return [];
  if (personalData === "all") return Array.from(PII_CATEGORIES);
  // Both spellings work; the short one is what people reach for.
  return personalData.map((name) =>
    name.startsWith("pii/") ? (name as PiiCategory) : (`pii/${name}` as PiiCategory),
  );
};

export function defineModeration<S extends string = string>(
  config: ModerationConfig = {},
): Moderation<S> {
  const tolerance = config.tolerance ?? "balanced";
  const audience = config.audience ?? "general";
  const surfaces = config.surfaces ?? {};
  const denyEntries = normalizeDeny(config.deny);
  const pii = piiCategories(config.personalData);
  const vocabulary = [
    ...(config.vocabulary ?? PROFANITY_PRESET),
    ...denyEntries,
  ];

  interface Settings {
    kind: SurfaceKind;
    audience: Audience;
    allow: string[];
    rules: Record<string, CategoryRule>;
    override?: PolicyConfig;
  }

  const settingsFor = (surface?: string): Settings => {
    const s = surface ? surfaces[surface] : undefined;
    return {
      kind: s?.kind ?? "body",
      audience: s?.audience ?? audience,
      allow: [...(config.allow ?? []), ...(s?.allow ?? [])],
      rules: { ...config.rules, ...s?.rules },
      ...(s?.policy ? { override: s.policy } : {}),
    };
  };

  const buildPolicy = (surface?: string): PolicyConfig => {
    const s = settingsFor(surface);
    if (s.override) return s.override;

    const base = THRESHOLDS[tolerance];
    const zero = new Set(baseZeroTolerance(s.audience));
    // A word you explicitly denied is always refused. That is what denying
    // it means; making it depend on a threshold would be a different feature.
    zero.add("denied");
    for (const entry of denyEntries) zero.add(entry.category);

    // A name has no "review it later" — it is on every row the account
    // touches by the time anyone opens the queue. So anything that trips at
    // all is refused, and the author picks something else.
    const identity = s.kind === "identity";
    if (identity) {
      for (const name of ["hate", "harassment", "profanity"]) zero.add(name);
    }
    const line = Math.min(base.review, 0.4);
    const reviewScore = identity ? line : base.review;
    const blockScore = identity ? line : base.block;

    // Rules last, so an explicit decision beats every default above it.
    const categories: Record<string, CategoryThresholds> = {};
    for (const [name, rule] of Object.entries(s.rules)) {
      const key = canonical(name);
      if (rule === "block") {
        zero.add(key);
        continue;
      }
      zero.delete(key);
      categories[key] =
        rule === "allow"
          ? { review: Infinity, block: Infinity }
          : { review: reviewScore, block: Infinity };
    }

    return {
      reviewScore,
      blockScore,
      zeroTolerance: Array.from(zero),
      ...(Object.keys(categories).length > 0 ? { categories } : {}),
    };
  };

  /**
   * Engines are keyed by the things that change them, not by surface name, so
   * a dozen body surfaces configured the same way share one engine — and one
   * cache. The policy is part of the key because the engine carries it as its
   * default, and two surfaces that differ only in policy must not collide.
   */
  const engines = new Map<string, Moderato>();

  const buildEngine = (surface?: string): Moderato => {
    const s = settingsFor(surface);
    const key = [
      s.kind,
      s.allow.join(" "),
      JSON.stringify(buildPolicy(surface)),
    ].join("");
    const existing = engines.get(key);
    if (existing) return existing;

    const offline: ModerationProvider[] = [
      wordlistProvider(vocabulary, {
        allow: s.allow,
        // Compound splitting everywhere: it is boundary-based, so it costs
        // nothing in precision and catches "shithead" and "asshat", which
        // people write in comments as readily as in handles.
        scanCompound: true,
        // The fused scan is the blunt one — any listed word of six letters
        // or more, anywhere inside a long token. Identity fields have no
        // whitespace to tokenise on, so it earns its precision cost there
        // and nowhere else.
        scanFused: s.kind === "identity",
      }),
    ];
    if (pii.length > 0) offline.push(piiProvider({ categories: pii }));

    const configured = config.provider;
    const remote = configured
      ? Array.isArray(configured)
        ? configured
        : [configured]
      : [];
    const providers = [...offline, ...remote];

    const engine = createModerato({
      provider:
        providers.length === 1 ? providers[0]! : chainProviders(providers),
      policy: buildPolicy(surface),
      ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
      ...(config.failMode ? { failMode: config.failMode } : {}),
      ...(config.cache !== undefined ? { cache: config.cache } : {}),
      ...(config.sink ? { sink: config.sink } : {}),
    });
    engines.set(key, engine);
    return engine;
  };

  return {
    surfaces: Object.keys(surfaces) as S[],
    engineFor: (surface) => buildEngine(surface),
    policyFor: (surface) => buildPolicy(surface),
    screen: (text, surface, options) =>
      buildEngine(surface).screenText(text, {
        policy: buildPolicy(surface),
        ...options,
      }),
    field: (surface) => ({
      engine: buildEngine(surface),
      policy: buildPolicy(surface),
    }),
    mask: (text, surface, mask = hashes) => {
      const s = settingsFor(surface);
      // A category you allowed is not masked either. Masking something you
      // said was fine would be the same disagreement as blocking it.
      const permitted = new Set(
        Object.entries(s.rules)
          .filter(([, rule]) => rule === "allow")
          .map(([name]) => canonical(name)),
      );
      const spans = [
        ...findTerms(text, vocabulary, {
          allow: s.allow,
          scanCompound: true,
          scanFused: s.kind === "identity",
        }),
        ...(pii.length > 0 ? findPii(text, { categories: pii }) : []),
      ].filter((span) => !permitted.has(canonical(span.category)));
      return maskSpans(text, spans, mask);
    },
  };
}
