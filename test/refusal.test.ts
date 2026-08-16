import { describe, expect, it } from "vitest";
import {
  DEFAULT_REFUSAL_FALLBACK,
  REFUSED_STATUS,
  refusalFrom,
} from "../src/index.js";

describe("refusalFrom", () => {
  it("returns the server's own words on a refusal", () => {
    const err = Object.assign(new Error("Keep it about the cards."), {
      status: REFUSED_STATUS,
    });
    expect(refusalFrom(err)).toBe("Keep it about the cards.");
  });

  it("falls back when the server sent no usable message", () => {
    const err = Object.assign(new Error("   "), { status: REFUSED_STATUS });
    expect(refusalFrom(err)).toBe(DEFAULT_REFUSAL_FALLBACK);
    expect(refusalFrom(err, { fallback: "Nope." })).toBe("Nope.");
  });

  it("is null for every other kind of failure", () => {
    expect(refusalFrom(Object.assign(new Error("boom"), { status: 500 }))).toBeNull();
    expect(refusalFrom(Object.assign(new Error("nope"), { status: 401 }))).toBeNull();
    expect(refusalFrom(new Error("network"))).toBeNull();
    expect(refusalFrom(null)).toBeNull();
    expect(refusalFrom(undefined)).toBeNull();
  });

  it("honours a different refusal status", () => {
    const err = Object.assign(new Error("no"), { status: 451 });
    expect(refusalFrom(err)).toBeNull();
    expect(refusalFrom(err, { status: 451 })).toBe("no");
  });
});
