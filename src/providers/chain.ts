/**
 * Chain providers — cheap and local first, expensive and remote last.
 *
 * This is the shape production moderation actually wants. A wordlist runs
 * in microseconds, offline, for free, and catches the slur someone typed on
 * purpose. A classifier costs a network round trip and understands "I hate
 * black people", which no wordlist ever will. Running the wordlist first and
 * stopping when it hits means the deliberate abuse never reaches your
 * vendor bill, and the ambiguous 99% still gets a real opinion.
 *
 * ```ts
 * chainProviders([
 *   wordlistProvider(PROFANITY_PRESET),  // instant, offline, free
 *   httpProvider({ url: "/api/moderate" }), // your server, your key
 * ])
 * ```
 *
 * A provider that THROWS does not fail the chain — the next one is tried,
 * and only an all-fail chain rethrows. One vendor being down should degrade
 * screening, not stop it.
 */

import type {
  ModerationProvider,
  NormalizedInput,
  ProviderResult,
} from "../types.js";

export interface ChainOptions {
  /**
   * "first-hit" (default) stops at the first provider that flags anything.
   * "all" runs every provider and merges, keeping the highest score per
   * category — use it when you want a second opinion on everything and are
   * willing to pay for it.
   */
  mode?: "first-hit" | "all";
  /** Override what counts as "hit" for first-hit mode. */
  isHit?: (result: ProviderResult) => boolean;
}

const anyFlag = (result: ProviderResult): boolean =>
  Object.values(result.flags).some(Boolean);

/** Merge results, keeping the strongest signal per category. */
export function mergeResults(results: ProviderResult[]): ProviderResult {
  const flags: Record<string, boolean> = {};
  const scores: Record<string, number> = {};
  for (const result of results) {
    for (const [name, hit] of Object.entries(result.flags)) {
      flags[name] = Boolean(flags[name]) || hit;
    }
    for (const [name, score] of Object.entries(result.scores)) {
      scores[name] = Math.max(scores[name] ?? 0, score);
    }
  }
  return { flags, scores };
}

export function chainProviders(
  providers: ModerationProvider[],
  options: ChainOptions = {},
): ModerationProvider {
  if (providers.length === 0) {
    throw new Error("moderato: chainProviders needs at least one provider.");
  }
  if (providers.length === 1) return providers[0]!;

  const mode = options.mode ?? "first-hit";
  const isHit = options.isHit ?? anyFlag;

  return {
    name: `chain(${providers.map((p) => p.name).join("+")})`,
    async classify(
      input: NormalizedInput,
      signal?: AbortSignal,
    ): Promise<ProviderResult> {
      const collected: ProviderResult[] = [];
      const failures: unknown[] = [];

      for (const provider of providers) {
        try {
          const result = await provider.classify(input, signal);
          collected.push(result);
          if (mode === "first-hit" && isHit(result)) break;
        } catch (err) {
          // A dead provider is not a verdict. Remember it in case every
          // one of them is dead, then carry on down the chain.
          failures.push(err);
        }
      }

      if (collected.length === 0) {
        throw failures[0] instanceof Error
          ? failures[0]
          : new Error("moderato: every provider in the chain failed");
      }
      return collected.length === 1 ? collected[0]! : mergeResults(collected);
    },
  };
}
