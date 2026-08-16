import { describe, expect, it } from "vitest";
import {
  ALLOW,
  BLOCK,
  DEFAULT_REVIEW_SCORE,
  POLICY_PRESETS,
  REVIEW,
  canonical,
  decide,
} from "../src/index.js";
import type { ProviderResult } from "../src/index.js";

const result = (
  scores: Record<string, number>,
  flags: Record<string, boolean> = {},
): ProviderResult => ({ flags, scores });

describe("canonical", () => {
  it("spells provider attributes the way policy is written", () => {
    expect(canonical("sexual_minors")).toBe("sexual/minors");
    expect(canonical("hate")).toBe("hate");
  });
});

describe("decide", () => {
  it("allows a clean result", () => {
    const verdict = decide(result({ hate: 0.01, violence: 0.02 }));
    expect(verdict.action).toBe(ALLOW);
    expect(verdict.rule).toBe("clean");
    expect(verdict.categories).toEqual([]);
    // The worst score is still reported — it is how a queue gets ranked.
    expect(verdict.score).toBeCloseTo(0.02);
  });

  it("blocks a zero-tolerance category at any score", () => {
    const verdict = decide(result({ "sexual/minors": 0.02 }, { "sexual/minors": true }));
    expect(verdict.action).toBe(BLOCK);
    expect(verdict.rule).toBe("zero-tolerance");
    expect(verdict.primary).toBe("sexual/minors");
  });

  it("reviews — does not block — an ordinary flag", () => {
    const verdict = decide(result({ harassment: 0.7 }, { harassment: true }));
    expect(verdict.action).toBe(REVIEW);
    expect(verdict.rule).toBe("flagged");
  });

  it("counts a high score the provider did not itself flag", () => {
    const verdict = decide(result({ harassment: DEFAULT_REVIEW_SCORE + 0.01 }));
    expect(verdict.action).toBe(REVIEW);
    expect(verdict.categories).toEqual(["harassment"]);
  });

  it("blocks above blockScore even outside the zero-tolerance set", () => {
    const policy = { blockScore: 0.9 };
    expect(decide(result({ harassment: 0.85 }), policy).action).toBe(REVIEW);
    const hard = decide(result({ harassment: 0.95 }), policy);
    expect(hard.action).toBe(BLOCK);
    expect(hard.rule).toBe("block-score");
    expect(hard.primary).toBe("harassment");
  });

  it("blocks a near-certain hit by default — no human in the loop for 0.97", () => {
    const verdict = decide(result({ hate: 0.97 }, { hate: true }));
    expect(verdict.action).toBe(BLOCK);
    expect(verdict.rule).toBe("block-score");
  });

  it("still only queues the uncertain middle by default", () => {
    expect(decide(result({ hate: 0.7 }, { hate: true })).action).toBe(REVIEW);
  });

  it("honours per-category thresholds over the policy-wide ones", () => {
    const policy = {
      reviewScore: 0.5,
      blockScore: 0.95,
      categories: { hate: { review: 0.2, block: 0.6 } },
    };
    expect(decide(result({ hate: 0.25 }), policy).action).toBe(REVIEW);
    expect(decide(result({ hate: 0.65 }), policy).action).toBe(BLOCK);
    // Other categories keep the policy-wide numbers.
    expect(decide(result({ violence: 0.65 }), policy).action).toBe(REVIEW);
  });

  it("sorts tripped categories worst-first, for a ranked queue", () => {
    const verdict = decide(
      result({ harassment: 0.6, violence: 0.9, hate: 0.75 }),
      { reviewScore: 0.5 },
    );
    expect(verdict.categories).toEqual(["violence", "hate", "harassment"]);
    expect(verdict.primary).toBe("violence");
  });

  it("matches underscore-spelled provider output against slash-spelled policy", () => {
    const verdict = decide(result({ sexual_minors: 0.99 }), {
      zeroTolerance: ["sexual/minors"],
      reviewScore: 0.5,
    });
    expect(verdict.action).toBe(BLOCK);
  });

  it("canonicalises the policy's own spelling too", () => {
    const verdict = decide(result({ "sexual/minors": 0.99 }), {
      zeroTolerance: ["sexual_minors"],
    });
    expect(verdict.action).toBe(BLOCK);
  });

  it("can be told never to auto-block, for teams that want every call reviewed", () => {
    const verdict = decide(result({ harassment: 0.999 }), {
      zeroTolerance: [],
      reviewScore: 0.5,
      blockScore: Number.POSITIVE_INFINITY,
    });
    expect(verdict.action).toBe(REVIEW);
  });
});

describe("POLICY_PRESETS.identity", () => {
  const policy = POLICY_PRESETS.identity;

  it("refuses a username the balanced policy would merely queue", () => {
    const flagged = result({ hate: 0.62 }, { hate: true });
    expect(decide(flagged, POLICY_PRESETS.balanced).action).toBe(REVIEW);
    expect(decide(flagged, policy).action).toBe(BLOCK);
  });

  it("refuses ordinary profanity in a handle", () => {
    expect(decide(result({ profanity: 0.72 }, { profanity: true }), policy).action).toBe(
      BLOCK,
    );
  });

  it("still lets an ordinary name through", () => {
    expect(decide(result({ hate: 0.01 }), policy).action).toBe(ALLOW);
  });
});
