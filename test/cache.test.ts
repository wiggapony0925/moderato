import { describe, expect, it } from "vitest";
import { TtlCache } from "../src/index.js";

describe("TtlCache", () => {
  it("returns what it stored", () => {
    const cache = new TtlCache<string>(10, 1000);
    cache.set("a", "one");
    expect(cache.get("a")).toBe("one");
    expect(cache.get("missing")).toBeUndefined();
  });

  it("expires entries", () => {
    let clock = 0;
    const cache = new TtlCache<string>(10, 100, () => clock);
    cache.set("a", "one");
    clock = 99;
    expect(cache.get("a")).toBe("one");
    clock = 100;
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("evicts the least recently used first", () => {
    const cache = new TtlCache<number>(2, 1000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a"); // "a" is now the freshest
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });

  it("stores nothing when its capacity is zero", () => {
    const cache = new TtlCache<number>(0, 1000);
    cache.set("a", 1);
    expect(cache.get("a")).toBeUndefined();
  });

  it("clears", () => {
    const cache = new TtlCache<number>(5, 1000);
    cache.set("a", 1);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
