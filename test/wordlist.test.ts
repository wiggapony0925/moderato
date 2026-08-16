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

describe("homoglyphs — the evasion that costs nothing to perform", () => {
  it("folds Cyrillic look-alikes", async () => {
    // "nigger" with a Cyrillic "е": a different string to every comparison
    // in the world, and identical to every human eye.
    expect((await classify("you are a nigger")).flags.hate).toBe(true);
    expect((await classify("nіgger")).flags.hate).toBe(true);
    expect((await classify("ѕhit")).flags.profanity).toBe(true);
  });

  it("folds Greek look-alikes", async () => {
    expect((await classify("what a bitch")).flags.profanity).toBe(true);
    expect((await classify("cοck")).flags.profanity).toBe(true);
  });

  it("folds small-caps and other Latin blocks", async () => {
    expect((await classify("ᴀ ꜰucking mess")).flags.profanity).toBe(true);
  });

  it("still leaves genuine non-Latin text alone", async () => {
    // Japanese is not a disguise for anything; folding it would be wrong.
    expect(Object.keys((await classify("これはテストです")).flags)).toEqual([]);
  });
});

describe("fused tokens — the username problem", () => {
  const fused = wordlistProvider(PROFANITY_PRESET, { scanFused: true });
  const scan = (text: string) => fused.classify({ text, images: [] });

  it("finds a slur welded into a handle", async () => {
    // A username has no spaces to tokenise on, so whole-token matching
    // finds nothing here — which is exactly the shape abuse takes there.
    expect((await classify("niggercollector")).flags.hate).toBeUndefined();
    expect((await scan("niggercollector")).flags.hate).toBe(true);
    expect((await scan("xX_faggotslayer_Xx")).flags.hate).toBe(true);
    expect((await scan("totalbastardguy")).flags.profanity).toBe(true);
  });

  it("does NOT resurrect the Scunthorpe problem", async () => {
    // The guard is length: the words that live inside innocent long words
    // are all short, and six characters excludes every one of them.
    for (const clean of [
      "Scunthorpe",
      "assassination",
      "classically",
      "cockpitcrew",
      "Dickinsonian",
      "analystamy",
      "shiitakemushrooms",
      "therapistfinder",
    ]) {
      expect(Object.keys((await scan(clean)).flags)).toEqual([]);
    }
  });

  it("leaves short tokens alone entirely", async () => {
    expect(Object.keys((await scan("assess")).flags)).toEqual([]);
  });

  it("is off by default, because body text does not need it", async () => {
    expect(wordlistProvider(PROFANITY_PRESET).name).toBe("wordlist");
    expect(fused.name).toBe("wordlist+fused");
  });
});
