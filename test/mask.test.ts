import { describe, expect, it } from "vitest";
import {
  PROFANITY_PRESET,
  findPii,
  findTerms,
  hashes,
  labelled,
  maskSpans,
  normalizeTokens,
} from "../src/index.js";

describe("token offsets", () => {
  const span = (text: string, i = 0) => {
    const t = normalizeTokens(text)[i]!;
    return text.slice(t.start, t.end);
  };

  it("points back at exactly what was typed", () => {
    expect(span("say n1gger now", 1)).toBe("n1gger");
    expect(span("café shit!", 0)).toBe("café");
  });

  it("spans a whole spaced-out run, separators included", () => {
    // Masking has to replace the spaces too, or "f u c k" becomes "# # # #".
    expect(span("you f u c k off", 1)).toBe("f u c k");
  });

  it("survives the punctuation-as-letter case", () => {
    expect(span("shit!")).toBe("shit!");
  });

  it("survives homoglyphs and zero-width splitting", () => {
    expect(span("nіgger")).toBe("nіgger");
    expect(span("fu​ck")).toBe("fu​ck");
  });
});

describe("findTerms", () => {
  const cats = (text: string, opts = {}) =>
    findTerms(text, PROFANITY_PRESET, opts).map((s) => `${s.category}:${s.value}`);

  it("reports what matched and where", () => {
    expect(cats("this is fucking great")).toEqual(["profanity:fucking"]);
    expect(cats("say n1gg3r loud")).toEqual(["hate:n1gg3r"]);
  });

  it("agrees with the provider about Scunthorpe", () => {
    expect(cats("I grew up in Scunthorpe")).toEqual([]);
    expect(cats("a classic cocktail")).toEqual([]);
  });

  it("honours the fused option", () => {
    expect(cats("bastardcollector")).toEqual([]);
    expect(cats("bastardcollector", { scanFused: true })).toEqual([
      "profanity:bastardcollector",
    ]);
  });
});

describe("maskSpans", () => {
  it("hashes a match, keeping the sentence shape", () => {
    const text = "you f u c k off";
    expect(maskSpans(text, findTerms(text, PROFANITY_PRESET))).toBe("you ####### off");
  });

  it("takes a label instead, when hiding the removal would be worse", () => {
    const text = "ring me on +44 7700 900123";
    expect(maskSpans(text, findPii(text), labelled)).toBe("ring me on [phone removed]");
  });

  it("takes a plain string", () => {
    const text = "this is fucking great";
    expect(maskSpans(text, findTerms(text, PROFANITY_PRESET), "[…]")).toBe(
      "this is […] great",
    );
  });

  it("masks words and personal data in one pass", () => {
    const text = "call me on +44 7700 900123 you bastard";
    const spans = [...findTerms(text, PROFANITY_PRESET), ...findPii(text)];
    expect(maskSpans(text, spans)).toBe("call me on ############### you #######");
  });

  it("drops a span that overlaps one already used", () => {
    // Two detectors claiming the same characters must not double-mask.
    const text = "fucking";
    const span = { category: "a", value: "fucking", start: 0, end: 7 };
    const overlap = { category: "b", value: "uck", start: 1, end: 4 };
    expect(maskSpans(text, [span, overlap], hashes)).toBe("#######");
  });

  it("leaves text with nothing in it alone", () => {
    expect(maskSpans("perfectly ordinary", [])).toBe("perfectly ordinary");
  });

  it("counts characters, not UTF-16 units", () => {
    const span = { category: "x", value: "🙂🙂", start: 0, end: 4 };
    expect(maskSpans("🙂🙂 hi", [span])).toBe("## hi");
  });
});
