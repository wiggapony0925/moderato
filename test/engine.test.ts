import { describe, expect, it, vi } from "vitest";
import {
  ALLOW,
  BLOCK,
  POLICY_PRESETS,
  PROFANITY_PRESET,
  REVIEW,
  createModerato,
  mockProvider,
  wordlistProvider,
} from "../src/index.js";
import type { ModerationEvent, NormalizedInput } from "../src/index.js";

const hate = (score = 0.99) =>
  mockProvider({ script: () => ({ flags: { hate: true }, scores: { hate: score } }) });

describe("Moderato.screen", () => {
  it("allows everything when no provider is configured", async () => {
    const engine = createModerato();
    const verdict = await engine.screen({ text: "you are a nigger" });
    expect(verdict.action).toBe(ALLOW);
    // …and says so honestly: nothing was screened, this is not a pass.
    expect(verdict.screened).toBe(false);
    expect(verdict.rule).toBe("not-screened");
    expect(engine.enabled).toBe(false);
  });

  it("allows when there is nothing to screen", async () => {
    const engine = createModerato({ provider: hate() });
    expect((await engine.screen({ text: "   " })).action).toBe(ALLOW);
    expect((await engine.screen({})).action).toBe(ALLOW);
  });

  it("applies the policy to the provider's result", async () => {
    const engine = createModerato({
      provider: hate(0.6),
      policy: { blockScore: 0.9 },
    });
    expect((await engine.screenText("borderline")).action).toBe(REVIEW);
  });

  it("takes a per-call policy override", async () => {
    const engine = createModerato({ provider: hate(0.62) });
    expect((await engine.screenText("a name")).action).toBe(REVIEW);
    const asHandle = await engine.screenText("a name", {
      policy: POLICY_PRESETS.identity,
    });
    expect(asHandle.action).toBe(BLOCK);
  });

  it("reviews — never silently allows — when the provider throws", async () => {
    const engine = createModerato({
      provider: mockProvider({ failWith: new Error("502 from vendor") }),
    });
    const verdict = await engine.screenText("anything");
    expect(verdict.action).toBe(REVIEW);
    expect(verdict.rule).toBe("failed");
    expect(verdict.detail).toContain("502 from vendor");
  });

  it("honours failMode for deployments that would rather refuse", async () => {
    const engine = createModerato({
      provider: mockProvider({ failWith: new Error("down") }),
      failMode: BLOCK,
    });
    expect((await engine.screenText("anything")).action).toBe(BLOCK);
  });

  it("gives up on a slow provider at the timeout", async () => {
    const engine = createModerato({
      provider: mockProvider({ latencyMs: 50 }),
      timeoutMs: 10,
    });
    const verdict = await engine.screenText("slow");
    expect(verdict.rule).toBe("failed");
    expect(verdict.detail).toContain("timed out after 10ms");
  });

  it("honours a caller's abort signal", async () => {
    const engine = createModerato({ provider: mockProvider({ latencyMs: 500 }) });
    const controller = new AbortController();
    const pending = engine.screenText("slow", { signal: controller.signal });
    controller.abort();
    const verdict = await pending;
    expect(verdict.detail).toContain("cancelled by caller");
  });

  it("never throws, whatever the provider does", async () => {
    const engine = createModerato({
      provider: {
        name: "hostile",
        classify: () => {
          throw new Error("synchronous explosion");
        },
      },
    });
    await expect(engine.screenText("x")).resolves.toMatchObject({ rule: "failed" });
  });
});

describe("caching", () => {
  it("screens the same text once", async () => {
    const classify = vi.fn(async () => ({ flags: {}, scores: {} }));
    const engine = createModerato({ provider: { name: "counted", classify } });
    await engine.screenText("hello there");
    await engine.screenText("hello there");
    await engine.screenText("hello there");
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it("keys the cache on the policy, because the same words differ per field", async () => {
    const classify = vi.fn(async () => ({
      flags: { hate: true },
      scores: { hate: 0.62 },
    }));
    const engine = createModerato({ provider: { name: "counted", classify } });
    const comment = await engine.screenText("same words");
    const handle = await engine.screenText("same words", {
      policy: POLICY_PRESETS.identity,
    });
    expect(classify).toHaveBeenCalledTimes(2);
    expect(comment.action).toBe(REVIEW);
    expect(handle.action).toBe(BLOCK);
  });

  it("does not cache a failure — the vendor may be back in a second", async () => {
    let calls = 0;
    const engine = createModerato({
      provider: {
        name: "flaky",
        classify: async () => {
          calls += 1;
          if (calls === 1) throw new Error("down");
          return { flags: {}, scores: {} };
        },
      },
    });
    expect((await engine.screenText("retry me")).rule).toBe("failed");
    expect((await engine.screenText("retry me")).rule).toBe("clean");
    expect(calls).toBe(2);
  });

  it("can be turned off", async () => {
    const classify = vi.fn(async () => ({ flags: {}, scores: {} }));
    const engine = createModerato({ provider: { name: "counted", classify }, cache: false });
    await engine.screenText("hello");
    await engine.screenText("hello");
    expect(classify).toHaveBeenCalledTimes(2);
  });

  it("clears on demand", async () => {
    const classify = vi.fn(async () => ({ flags: {}, scores: {} }));
    const engine = createModerato({ provider: { name: "counted", classify } });
    await engine.screenText("hello");
    engine.clearCache();
    await engine.screenText("hello");
    expect(classify).toHaveBeenCalledTimes(2);
  });
});

describe("the sink", () => {
  it("reports every screening, allow included", async () => {
    const events: ModerationEvent[] = [];
    const engine = createModerato({
      provider: wordlistProvider(PROFANITY_PRESET),
      sink: (event) => void events.push(event),
    });
    await engine.screenText("a perfectly nice post");
    await engine.screenText("you are a nigger", { context: { userId: "u_1" } });

    expect(events).toHaveLength(2);
    expect(events[0]?.verdict.action).toBe(ALLOW);
    expect(events[0]?.provider).toBe("wordlist");
    expect(events[1]?.verdict.action).toBe(BLOCK);
    expect(events[1]?.context).toEqual({ userId: "u_1" });
    expect(events[1]?.input.text).toContain("nigger");
    expect(typeof events[1]?.durationMs).toBe("number");
  });

  it("marks a cache hit as such, so metrics do not double-count", async () => {
    const events: ModerationEvent[] = [];
    const engine = createModerato({
      provider: mockProvider(),
      sink: (event) => void events.push(event),
    });
    await engine.screenText("repeated");
    await engine.screenText("repeated");
    expect(events.map((e) => e.provider)).toEqual(["mock", "cache"]);
  });

  it("cannot break a publish by throwing", async () => {
    const engine = createModerato({
      provider: mockProvider(),
      sink: () => {
        throw new Error("logging is down");
      },
    });
    await expect(engine.screenText("fine")).resolves.toMatchObject({ action: ALLOW });
  });

  it("never carries image bytes, only a count", async () => {
    const events: ModerationEvent[] = [];
    const engine = createModerato({
      provider: mockProvider(),
      sink: (event) => void events.push(event),
    });
    await engine.screen({
      text: "look",
      images: [{ dataUri: "data:image/png;base64,SECRETBYTES" }],
    });
    expect(events[0]?.input.imageCount).toBe(1);
    expect(JSON.stringify(events[0])).not.toContain("SECRETBYTES");
  });
});

describe("screenDetailed", () => {
  it("keeps the raw provider result alongside the verdict", async () => {
    const engine = createModerato({ provider: hate(0.97) });
    const { verdict, result } = await engine.screenDetailed({ text: "x" });
    expect(verdict.action).toBe(BLOCK);
    expect(result?.scores.hate).toBeCloseTo(0.97);
  });

  it("has no raw result when nothing was classified", async () => {
    const engine = createModerato();
    expect((await engine.screenDetailed({ text: "x" })).result).toBeNull();
  });
});

describe("provider chains via config", () => {
  it("accepts an array and stops at the first hit", async () => {
    const remote = vi.fn(async (_input: NormalizedInput) => ({
      flags: {},
      scores: {},
    }));
    const engine = createModerato({
      provider: [
        wordlistProvider(PROFANITY_PRESET),
        { name: "remote", classify: remote },
      ],
    });
    expect((await engine.screenText("you are a nigger")).action).toBe(BLOCK);
    expect(remote).not.toHaveBeenCalled();

    await engine.screenText("a perfectly nice post");
    expect(remote).toHaveBeenCalledTimes(1);
  });

  it("treats an empty array as no provider", async () => {
    const engine = createModerato({ provider: [] });
    expect(engine.enabled).toBe(false);
  });
});
