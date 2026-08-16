import { describe, expect, it } from "vitest";
import {
  PROFANITY_PRESET,
  PROFANITY_PRESET_STRICT,
  wordlistProvider,
} from "../src/index.js";

const provider = wordlistProvider(PROFANITY_PRESET);
const classify = (text: string) => provider.classify({ text, images: [] });

describe("wordlistProvider", () => {
  it("catches a slur and reports it as hate at near-certainty", async () => {
    const result = await classify("you are a nigger");
    expect(result.flags.hate).toBe(true);
    expect(result.scores.hate).toBeGreaterThanOrEqual(0.99);
  });

  it("catches the spaced-out and leetspeak forms", async () => {
    expect((await classify("n i g g e r")).flags.hate).toBe(true);
    expect((await classify("n1gg3r")).flags.hate).toBe(true);
    expect((await classify("NIGGER")).flags.hate).toBe(true);
  });

  it("separates ordinary profanity from hate, so policy can too", async () => {
    const result = await classify("this is fucking great");
    expect(result.flags.profanity).toBe(true);
    expect(result.flags.hate).toBeUndefined();
    expect(result.scores.profanity).toBeLessThan(0.9);
  });

  it("is not defeated by trailing punctuation", async () => {
    // "!" de-leets to "i". Before `bare`, "shit!" became "shiti" and
    // matched nothing — one keystroke turned the filter off.
    for (const text of ["shit!", "fuck!!!", "you are a nigger!"]) {
      expect(Object.keys((await classify(text)).flags).length).toBeGreaterThan(0);
    }
  });

  it("matches common inflections", async () => {
    for (const text of ["fucking", "fuckers", "fucked"]) {
      expect((await classify(text)).flags.profanity).toBe(true);
    }
  });

  it("does not match inside another word", async () => {
    for (const clean of [
      "Scunthorpe",
      "assassin",
      "classic",
      "cocktail",
      "Dickens",
      "Essex",
    ]) {
      const result = await classify(`a post about ${clean}`);
      expect(Object.keys(result.flags)).toEqual([]);
    }
  });

  it("leaves collector vocabulary alone", async () => {
    for (const clean of [
      "this pull is sick",
      "insane centering on this one",
      "killer deal, I would steal that",
    ]) {
      expect(Object.keys((await classify(clean)).flags)).toEqual([]);
    }
  });

  it("returns nothing for an empty input", async () => {
    expect(await provider.classify({ images: [] })).toEqual({ flags: {}, scores: {} });
  });

  it("cannot see images — which is the point of pairing it with a classifier", async () => {
    const result = await provider.classify({
      images: [{ dataUri: "data:image/png;base64,AAAA" }],
    });
    expect(result.flags).toEqual({});
  });

  it("matches multi-word phrases in the strict corpus", async () => {
    const strict = wordlistProvider(PROFANITY_PRESET_STRICT);
    const result = await strict.classify({ text: "a barely legal joke", images: [] });
    expect(result.flags.profanity).toBe(true);
  });

  it("understands custom categories", async () => {
    const custom = wordlistProvider([
      { category: "spam", words: ["free robux", "click here"], score: 0.8 },
    ]);
    const result = await custom.classify({ text: "FREE ROBUX now", images: [] });
    expect(result.flags.spam).toBe(true);
    expect(result.scores.spam).toBeCloseTo(0.8);
  });
});
