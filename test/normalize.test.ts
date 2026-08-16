import { describe, expect, it } from "vitest";
import { normalizeTokens } from "../src/index.js";

const exacts = (text: string) => normalizeTokens(text).map((t) => t.exact);
const collapsed = (text: string) => normalizeTokens(text).map((t) => t.collapsed);
const bares = (text: string) => normalizeTokens(text).map((t) => t.bare);

describe("normalizeTokens", () => {
  it("lowercases and splits on non-letters", () => {
    expect(exacts("Hello, World")).toEqual(["hello", "world"]);
  });

  it("merges runs of single letters — the spaced-out evasion", () => {
    expect(exacts("f u c k")).toEqual(["fuck"]);
    expect(exacts("F.U.C.K")).toEqual(["fuck"]);
    expect(exacts("c-u-n-t")).toEqual(["cunt"]);
  });

  it("does not merge a lone single letter into its neighbour", () => {
    expect(exacts("a class act")).toEqual(["a", "class", "act"]);
  });

  it("maps leetspeak", () => {
    expect(exacts("n1gg3r")).toEqual(["nigger"]);
    expect(exacts("@ss")).toEqual(["ass"]);
    expect(exacts("$hit")).toEqual(["shit"]);
  });

  it("strips accents", () => {
    expect(exacts("fúck")).toEqual(["fuck"]);
  });

  it("strips zero-width characters used to split words invisibly", () => {
    expect(exacts("fu​ck")).toEqual(["fuck"]);
    expect(exacts("n‍i‍gger")).toEqual(["nigger"]);
  });

  it("offers a run-collapsed variant for stretched spellings", () => {
    expect(collapsed("fuuuck")).toEqual(["fuck"]);
    // …without destroying the exact form, which is what protects "class".
    expect(exacts("class")).toEqual(["class"]);
    expect(collapsed("class")).toEqual(["clas"]);
  });

  it("keeps a leet-free variant, so punctuation cannot defeat a match", () => {
    // "!" de-leets to "i": without `bare`, "shit!" becomes "shiti" and
    // matches nothing at all.
    expect(exacts("shit!")).toEqual(["shiti"]);
    expect(bares("shit!")).toEqual(["shit"]);
    expect(bares("Hello, World!")).toEqual(["hello", "world"]);
  });

  it("still de-leets when the substitution is leading or interior", () => {
    expect(exacts("@ss")).toEqual(["ass"]);
    expect(exacts("n1gg3r")).toEqual(["nigger"]);
    // A word made only of substitutions keeps its full form to match on.
    expect(exacts("a$$")).toEqual(["ass"]);
  });

  it("keeps innocent words whole (the Scunthorpe problem)", () => {
    expect(exacts("Scunthorpe assassin classic")).toEqual([
      "scunthorpe",
      "assassin",
      "classic",
    ]);
  });

  it("returns nothing for empty or symbol-only input", () => {
    expect(normalizeTokens("")).toEqual([]);
    expect(normalizeTokens("### ???")).toEqual([]);
  });
});
