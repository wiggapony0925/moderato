/**
 * The policy: raw classifier output → allow / review / block.
 *
 * Screening is advisory except where it isn't:
 *
 * - a hit in the zero-tolerance set **blocks** — refuse the write;
 * - anything else the classifier flags (or scores above the review
 *   threshold) **reviews** — publish, but put it in front of a human.
 *   Community vocabulary is full of "sick", "insane", "killer" and
 *   "steal"; auto-deleting on a classifier's say-so deletes real posts;
 * - everything else **allows**, silently.
 */

import type { PolicyConfig, ProviderResult, Verdict } from "./types.js";
import { ALLOW, BLOCK, REVIEW } from "./types.js";

/**
 * The default refuse-outright set. Deliberately short: the categories where
 * "publish it and review later" is not an acceptable position to have
 * taken, legally or morally.
 */
export const DEFAULT_ZERO_TOLERANCE: ReadonlySet<string> = new Set([
  "sexual/minors",
  "sexual",
  "hate/threatening",
  "harassment/threatening",
  "violence/graphic",
  "self-harm/instructions",
  "illicit/violent",
]);

/** Score above which a category counts even when the provider didn't flag it. */
export const DEFAULT_REVIEW_SCORE = 0.55;

/**
 * Canonicalise a category name. Providers spell attributes with "_"
 * ("sexual_minors"); policies are written the way the docs spell them
 * ("sexual/minors").
 */
export const canonical = (name: string): string => name.replaceAll("_", "/");

/** Apply the policy to one classifier result. Pure — no IO, no state. */
export function decide(result: ProviderResult, policy: PolicyConfig = {}): Verdict {
  const zeroTolerance = new Set(policy.zeroTolerance ?? DEFAULT_ZERO_TOLERANCE);
  const reviewScore = policy.reviewScore ?? DEFAULT_REVIEW_SCORE;

  const scoreOf = (name: string): number => {
    for (const [key, value] of Object.entries(result.scores)) {
      if (canonical(key) === canonical(name)) return value;
    }
    return 0;
  };

  const names = new Set<string>();
  for (const [name, hit] of Object.entries(result.flags)) {
    if (hit) names.add(canonical(name));
  }
  for (const [name, score] of Object.entries(result.scores)) {
    if (score >= reviewScore) names.add(canonical(name));
  }

  const tripped = [...names].sort((a, b) => scoreOf(b) - scoreOf(a));
  const worst = Math.max(0, ...Object.values(result.scores));

  if (tripped.some((name) => zeroTolerance.has(name))) {
    return {
      action: BLOCK,
      categories: tripped,
      score: worst,
      detail: `Blocked: ${tripped.join(", ")}`,
    };
  }
  if (tripped.length > 0) {
    return {
      action: REVIEW,
      categories: tripped,
      score: worst,
      detail: `Flagged: ${tripped.join(", ")}`,
    };
  }
  return { action: ALLOW, categories: [], score: worst };
}

/**
 * What the author is told on a block. Names the policy, not the classifier
 * — a raw category list reads as an accusation and teaches evasion.
 */
export const DEFAULT_REFUSAL_MESSAGE =
  "This looks like it breaks the community rules. Please reword it and try again.";
