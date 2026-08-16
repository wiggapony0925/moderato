/**
 * The policy: raw classifier output → allow / review / block.
 *
 * Screening is advisory except where it isn't:
 *
 * - a hit in the zero-tolerance set **blocks** — refuse the write;
 * - a category scoring at or above `blockScore` **blocks** too. This is
 *   the automation dial. A classifier at 0.97 on "hate" is not a judgement
 *   call, and making a human confirm it is how a queue fills with work
 *   that only ever has one answer;
 * - anything else the classifier flags (or scores above the review
 *   threshold) **reviews** — publish, but put it in front of a human.
 *   Ordinary speech is full of "sick", "insane", "killer" and "kill it";
 *   auto-deleting on a classifier's say-so deletes real posts;
 * - everything else **allows**, silently.
 *
 * Nothing here does IO or holds state, so it is the same decision on the
 * server and in the browser — which is the point. One policy object,
 * shipped to both, is how the client's preflight and the server's refusal
 * stay in agreement.
 */

import type {
  CategoryThresholds,
  PolicyConfig,
  ProviderResult,
  Verdict,
} from "./types.js";
import { ALLOW, BLOCK, REVIEW } from "./types.js";

/**
 * Categories that are indefensible on ANY platform. Nothing here is a
 * product decision — there is no service, anywhere, whose users are better
 * served by publishing this and reviewing it next Tuesday.
 */
const UNIVERSAL_LIST = [
  "sexual/minors",
  "hate/threatening",
  "harassment/threatening",
  "violence/graphic",
  "self-harm/instructions",
  "illicit/violent",
] as const;

export const UNIVERSAL_ZERO_TOLERANCE: ReadonlySet<string> = new Set(UNIVERSAL_LIST);

/**
 * The default refuse-outright set: the universal list, plus `sexual`.
 *
 * **That last one is a product decision, not a law of nature**, and it is
 * the default because it is the safe answer for the general case — a
 * general-audience app, an app-store listing, anything a sponsor or a
 * school network sees. It is the wrong answer for a dating app, an art
 * community, or any 18+ platform, where adult content is a legitimate part
 * of the product and refusing it is refusing the product.
 *
 * If that is you, do not inherit this set. Use `POLICY_PRESETS.adult`, or
 * pass your own `zeroTolerance` — the whole point of it being a config
 * field is that this library does not get to decide what your service is
 * for.
 */
const DEFAULT_LIST = [...UNIVERSAL_LIST, "sexual"];

export const DEFAULT_ZERO_TOLERANCE: ReadonlySet<string> = new Set(DEFAULT_LIST);

/** Score above which a category counts even when the provider didn't flag it. */
export const DEFAULT_REVIEW_SCORE = 0.55;

/**
 * Score at or above which ANY category refuses outright.
 *
 * This is the line between "a machine noticed something" and "a machine is
 * certain". A classifier returning 0.95 on hate is not making a judgement
 * call, and routing that to a human queue means the slur is live until
 * someone gets to it — which on a small team is hours, and on a weekend is
 * days. Everything below the line still publishes and queues, because that
 * is where the false positives live.
 *
 * Set `blockScore: Infinity` to go back to "only zeroTolerance blocks".
 */
export const DEFAULT_BLOCK_SCORE = 0.92;

/**
 * Canonicalise a category name. Providers spell attributes with "_"
 * ("sexual_minors"); policies are written the way the docs spell them
 * ("sexual/minors").
 */
export const canonical = (name: string): string => name.replaceAll("_", "/");

/**
 * Ready-made policies. Pick one by what the field IS and who your users
 * are, not by how strict you feel — the right answer differs per surface
 * and per product, and these are the shapes that actually recur.
 *
 * None of them is a default: `decide()` with no policy uses
 * `DEFAULT_ZERO_TOLERANCE`, `DEFAULT_REVIEW_SCORE` and
 * `DEFAULT_BLOCK_SCORE`, which is `balanced` in all but name.
 */
export const POLICY_PRESETS = {
  /**
   * General-audience body text — comments, captions, descriptions, posts.
   * Refuses the indefensible, queues the doubtful, lets people talk like
   * people.
   */
  balanced: {
    reviewScore: DEFAULT_REVIEW_SCORE,
    blockScore: DEFAULT_BLOCK_SCORE,
  } satisfies PolicyConfig,

  /**
   * **Identity fields** — usernames, display names, team, list and
   * workspace names: anything permanent, public, and shown next to other
   * people's content. There is no "publish it and review later" for a
   * handle: it is on every row the account touches until someone gets to
   * the queue. So anything that trips at all is refused, and the author is
   * asked for a different name. Nobody is owed their first choice of
   * username.
   */
  identity: {
    reviewScore: 0.4,
    blockScore: 0.4,
    zeroTolerance: [...DEFAULT_LIST, "hate", "harassment", "profanity"],
  } satisfies PolicyConfig,

  /**
   * Brand-safe surfaces — anything a sponsor or an app store reviewer sees.
   * Queues far more than `balanced`; expect to staff it.
   */
  strict: {
    reviewScore: 0.3,
    blockScore: 0.8,
    zeroTolerance: [...DEFAULT_LIST, "hate", "harassment"],
  } satisfies PolicyConfig,

  /**
   * **Platforms where adult content is legitimate** — dating, 18+
   * communities, art and fiction sites. Refuses only what is indefensible
   * anywhere (`UNIVERSAL_ZERO_TOLERANCE`), which very much still includes
   * `sexual/minors` and threats; consensual adult material is left to your
   * age gate and your own rules, where it belongs.
   *
   * This exists so the library's safe default is not mistaken for a claim
   * about what every service should allow.
   */
  adult: {
    reviewScore: 0.6,
    blockScore: DEFAULT_BLOCK_SCORE,
    zeroTolerance: [...UNIVERSAL_LIST],
  } satisfies PolicyConfig,

  /**
   * **Where the author is a minor.**
   *
   * Two things change, and the second matters more than the first.
   *
   * The obvious one: the bar for everything moves down. `strict`-level
   * thresholds, and profanity and harassment become refusals rather than
   * queue items.
   *
   * The one people forget: **personal information becomes zero-tolerance.**
   * A twenty-two-year-old posting their phone number to arrange a collection
   * is doing something ordinary. A thirteen-year-old doing it is the exact
   * situation child-safety law exists about, and a queue a moderator reaches
   * on Tuesday is not a control. It refuses, at any score, every time.
   *
   * moderato cannot know anyone's age — that is your account system. This
   * preset is what you apply once you know. And it is a floor, not
   * compliance: COPPA, the UK Age Appropriate Design Code and their
   * equivalents have obligations no library can discharge for you.
   */
  minor: {
    reviewScore: 0.25,
    blockScore: 0.6,
    zeroTolerance: [
      ...DEFAULT_LIST,
      "hate",
      "harassment",
      "profanity",
      "self-harm",
      "self-harm/intent",
      "violence",
      "illicit",
      // Contact details from a child are not a moderation question.
      "pii/phone",
      "pii/email",
      "pii/location",
      "pii/ssn",
      "pii/card",
    ],
  } satisfies PolicyConfig,
} as const;

/** Apply the policy to one classifier result. Pure — no IO, no state. */
export function decide(result: ProviderResult, policy: PolicyConfig = {}): Verdict {
  // `Array.from`, not `[...x]`. Spreading a non-array iterable is correct
  // ES2015, but a consumer whose bundler transpiles spread in loose mode
  // rewrites it to `[].concat(x)` — which appends the Set as ONE element
  // instead of spreading it, and every category comparison then silently
  // fails. A published library does not get to assume its consumers'
  // babel config; `Array.from` is a function call and survives all of them.
  const zeroTolerance = new Set(
    Array.from(policy.zeroTolerance ?? DEFAULT_ZERO_TOLERANCE, canonical),
  );
  const reviewScore = policy.reviewScore ?? DEFAULT_REVIEW_SCORE;
  const blockScore = policy.blockScore ?? DEFAULT_BLOCK_SCORE;

  // One canonicalised score map, built once. The old shape re-scanned every
  // entry for every lookup, which is O(categories²) on a provider that
  // reports thirteen of them per call.
  const scores = new Map<string, number>();
  for (const [name, score] of Object.entries(result.scores)) {
    const key = canonical(name);
    scores.set(key, Math.max(scores.get(key) ?? 0, score));
  }
  const scoreOf = (name: string): number => scores.get(canonical(name)) ?? 0;

  const overrides = (name: string): CategoryThresholds =>
    policy.categories?.[canonical(name)] ?? {};
  const reviewAt = (name: string): number => overrides(name).review ?? reviewScore;
  const blockAt = (name: string): number | undefined =>
    overrides(name).block ?? blockScore;

  const names = new Set<string>();
  for (const [name, hit] of Object.entries(result.flags)) {
    if (hit) names.add(canonical(name));
  }
  // `forEach`, not `for…of`: babel's loose mode compiles for-of as an index
  // loop, which is wrong for a Map. Same reasoning as `Array.from` above.
  scores.forEach((score, name) => {
    if (score >= reviewAt(name)) names.add(name);
  });
  // An unreachable review threshold means "I do not care about this
  // category" — the setting a product reaches for when its classifier
  // reports something it has deliberately decided to permit. It has to beat
  // the provider's own flag as well as the score, or the opt-out only works
  // for providers that happen not to flag, which is not an opt-out.
  names.forEach((name) => {
    if (reviewAt(name) === Infinity) names.delete(name);
  });

  const tripped = Array.from(names).sort((a, b) => scoreOf(b) - scoreOf(a));
  const worst = Math.max(0, ...Array.from(scores.values()));

  const zeroHit = tripped.find((name) => zeroTolerance.has(name));
  if (zeroHit !== undefined) {
    return {
      action: BLOCK,
      categories: tripped,
      score: worst,
      rule: "zero-tolerance",
      primary: zeroHit,
      screened: true,
      detail: `Blocked: ${tripped.join(", ")}`,
    };
  }

  const overBlock = tripped.find((name) => {
    const threshold = blockAt(name);
    return threshold !== undefined && scoreOf(name) >= threshold;
  });
  if (overBlock !== undefined) {
    return {
      action: BLOCK,
      categories: tripped,
      score: worst,
      rule: "block-score",
      primary: overBlock,
      screened: true,
      detail: `Blocked: ${overBlock} at ${scoreOf(overBlock).toFixed(2)}`,
    };
  }

  if (tripped.length > 0) {
    return {
      action: REVIEW,
      categories: tripped,
      score: worst,
      rule: "flagged",
      primary: tripped[0],
      screened: true,
      detail: `Flagged: ${tripped.join(", ")}`,
    };
  }
  return {
    action: ALLOW,
    categories: [],
    score: worst,
    rule: "clean",
    screened: true,
  };
}

/**
 * What the author is told on a block. Names the policy, not the classifier
 * — a raw category list reads as an accusation and teaches evasion.
 */
export const DEFAULT_REFUSAL_MESSAGE =
  "This looks like it breaks the community rules. Please reword it and try again.";
