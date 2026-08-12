/**
 * Mock provider — deterministic, scriptable, for tests and benchmarks.
 * Not exported from the package root by accident: it IS part of the public
 * API, because everyone who adopts a moderation layer needs to test the
 * paths they hope never fire.
 */

import type {
  ModerationProvider,
  NormalizedInput,
  ProviderResult,
} from "../types.js";

export interface MockProviderOptions {
  /** Decide the result per input; default = clean result for everything. */
  script?: (input: NormalizedInput) => Partial<ProviderResult>;
  /** Simulated classifier latency, ms. */
  latencyMs?: number;
  /** Throw on every call — for exercising the failure path. */
  failWith?: Error;
}

export function mockProvider(options: MockProviderOptions = {}): ModerationProvider {
  return {
    name: "mock",
    async classify(input: NormalizedInput): Promise<ProviderResult> {
      if (options.latencyMs) {
        await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
      }
      if (options.failWith) throw options.failWith;
      const scripted = options.script?.(input) ?? {};
      return { flags: scripted.flags ?? {}, scores: scripted.scores ?? {} };
    },
  };
}
