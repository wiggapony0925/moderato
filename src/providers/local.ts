/**
 * Local rules provider — pattern matching, no network, text only.
 *
 * Be honest about what this is: wordlists are English-centric, trivially
 * defeated by "f u c k", and they fire on "that headline is insane".
 * They cannot see images at all, and images are most of the risk. Use for dev,
 * tests, air-gapped deployments, or as a fast pre-filter IN FRONT of a
 * real classifier — not as the classifier.
 */

import type {
  ModerationProvider,
  NormalizedInput,
  ProviderResult,
} from "../types.js";

export interface LocalRule {
  /** Canonical category the rule reports ("harassment", "sexual", …). */
  category: string;
  pattern: RegExp;
  /** Score reported on a hit; ≥ the policy's reviewScore to matter. */
  score?: number;
}

export function localProvider(rules: LocalRule[]): ModerationProvider {
  return {
    name: "local",
    async classify(input: NormalizedInput): Promise<ProviderResult> {
      const flags: Record<string, boolean> = {};
      const scores: Record<string, number> = {};
      const text = input.text ?? "";
      for (const rule of rules) {
        // Fresh lastIndex per call — a /g/ regex remembers where it stopped.
        const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
        if (text && pattern.test(text)) {
          flags[rule.category] = true;
          scores[rule.category] = Math.max(
            scores[rule.category] ?? 0,
            rule.score ?? 0.99,
          );
        }
      }
      return { flags, scores };
    },
  };
}
