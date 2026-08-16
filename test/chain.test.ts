import { describe, expect, it, vi } from "vitest";
import { chainProviders, mergeResults, mockProvider } from "../src/index.js";
import type { ModerationProvider } from "../src/index.js";

const clean: ModerationProvider = { name: "clean", classify: async () => ({ flags: {}, scores: {} }) };
const hits = (category: string, score: number): ModerationProvider => ({
  name: category,
  classify: async () => ({ flags: { [category]: true }, scores: { [category]: score } }),
});
const dead: ModerationProvider = {
  name: "dead",
  classify: async () => {
    throw new Error("vendor down");
  },
};

const input = { text: "x", images: [] };

describe("chainProviders", () => {
  it("returns the single provider unwrapped", () => {
    expect(chainProviders([clean])).toBe(clean);
  });

  it("refuses an empty chain rather than silently allowing everything", () => {
    expect(() => chainProviders([])).toThrow(/at least one provider/);
  });

  it("stops at the first provider that flags something", async () => {
    const second = vi.fn(async () => ({ flags: {}, scores: {} }));
    const chain = chainProviders([hits("hate", 0.9), { name: "second", classify: second }]);
    const result = await chain.classify(input);
    expect(result.flags.hate).toBe(true);
    expect(second).not.toHaveBeenCalled();
  });

  it("falls through to the expensive provider when the cheap one is clean", async () => {
    const chain = chainProviders([clean, hits("harassment", 0.8)]);
    expect((await chain.classify(input)).flags.harassment).toBe(true);
  });

  it("survives a dead provider and keeps going", async () => {
    const chain = chainProviders([dead, hits("hate", 0.7)]);
    expect((await chain.classify(input)).flags.hate).toBe(true);
  });

  it("throws only when every provider is dead — the engine turns that into review", async () => {
    const chain = chainProviders([dead, dead]);
    await expect(chain.classify(input)).rejects.toThrow(/vendor down/);
  });

  it("merges every opinion in 'all' mode", async () => {
    const chain = chainProviders([hits("hate", 0.4), hits("violence", 0.9)], {
      mode: "all",
    });
    const result = await chain.classify(input);
    expect(result.flags).toEqual({ hate: true, violence: true });
    expect(result.scores).toEqual({ hate: 0.4, violence: 0.9 });
  });

  it("names itself after its parts, for the sink", () => {
    expect(chainProviders([clean, mockProvider()]).name).toBe("chain(clean+mock)");
  });
});

describe("mergeResults", () => {
  it("keeps the strongest signal per category", () => {
    expect(
      mergeResults([
        { flags: { hate: false }, scores: { hate: 0.2, violence: 0.9 } },
        { flags: { hate: true }, scores: { hate: 0.8 } },
      ]),
    ).toEqual({ flags: { hate: true }, scores: { hate: 0.8, violence: 0.9 } });
  });

  it("is empty for no results", () => {
    expect(mergeResults([])).toEqual({ flags: {}, scores: {} });
  });
});
