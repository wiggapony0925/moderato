import { describe, expect, it, vi } from "vitest";
import {
  BLOCK,
  REVIEW,
  ALLOW,
  defineModeration,
  mockProvider,
  type Verdict,
} from "../src/index.js";

const action = (v: Verdict) => v.action;

describe("defineModeration — defaults", () => {
  const m = defineModeration();

  it("works with no configuration at all", async () => {
    expect(action(await m.screen("perfectly ordinary post"))).toBe(ALLOW);
    expect(action(await m.screen("this is fucking great"))).toBe(REVIEW);
    expect(action(await m.screen("you are a nigger"))).toBe(BLOCK);
  });

  it("does not detect personal data unless asked", async () => {
    expect(action(await m.screen("ring me on +44 7700 900123"))).toBe(ALLOW);
  });

  it("reports the surfaces you declared, and nothing else", () => {
    expect(m.surfaces).toEqual([]);
    expect(
      defineModeration({ surfaces: { a: {}, b: { kind: "identity" } } }).surfaces,
    ).toEqual(["a", "b"]);
  });
});

describe("category rules", () => {
  // The Instagram case: swearing is how people talk here, slurs are not.
  const instagram = defineModeration({ rules: { profanity: "allow" } });

  it("allows a whole category without touching the rest", async () => {
    expect(action(await instagram.screen("this is fucking great"))).toBe(ALLOW);
    expect(action(await instagram.screen("what an asshole"))).toBe(ALLOW);
    expect(action(await instagram.screen("you are a nigger"))).toBe(BLOCK);
  });

  it("beats the provider's own flag, not just its score", async () => {
    // A classifier that flags without scoring would otherwise walk straight
    // past an "allow" rule.
    const flagOnly = defineModeration({
      rules: { profanity: "allow" },
      provider: mockProvider({ script: () => ({ flags: { profanity: true } }) }),
    });
    expect(action(await flagOnly.screen("anything"))).toBe(ALLOW);
  });

  it("demotes a category to review instead of refusing it", async () => {
    const m = defineModeration({ rules: { hate: "review" } });
    expect(action(await m.screen("you are a nigger"))).toBe(REVIEW);
  });

  it("promotes a category to refused at any score", async () => {
    const m = defineModeration({ rules: { profanity: "block" } });
    expect(action(await m.screen("this is fucking great"))).toBe(BLOCK);
  });

  it("overrides an audience default rather than losing to it", async () => {
    // "sexual" is zero-tolerance by default; an 18+ product says otherwise.
    const m = defineModeration({ rules: { sexual: "review" } });
    expect(m.policyFor().zeroTolerance).not.toContain("sexual");
    expect(m.policyFor().categories?.sexual).toEqual({
      review: 0.55,
      block: Infinity,
    });
  });
});

describe("word allowances", () => {
  const m = defineModeration({ allow: ["fuck", "shit", "ass"] });

  it("permits the words you named and no others", async () => {
    expect(action(await m.screen("this is fucking great"))).toBe(ALLOW);
    expect(action(await m.screen("what an ass"))).toBe(ALLOW);
    expect(action(await m.screen("what a bastard"))).toBe(REVIEW);
    expect(action(await m.screen("you are a nigger"))).toBe(BLOCK);
  });

  it("holds when the word is disguised", async () => {
    // An allowance somebody can type around is not a setting, it is a trap.
    expect(action(await m.screen("what an @ss"))).toBe(ALLOW);
    expect(action(await m.screen("f u c k this"))).toBe(ALLOW);
    expect(action(await m.screen("sh1t"))).toBe(ALLOW);
  });
});

describe("deny", () => {
  it("refuses your own words at any tolerance", async () => {
    const m = defineModeration({ tolerance: "open", deny: ["ourcompetitor"] });
    expect(action(await m.screen("go use ourcompetitor"))).toBe(BLOCK);
    expect(action(await m.screen("go use ours"))).toBe(ALLOW);
  });

  it("takes named categories", async () => {
    const m = defineModeration({
      deny: { spam: ["freerobux"], brand: ["ourcompetitor"] },
    });
    const v = await m.screen("get freerobux now");
    expect(v.action).toBe(BLOCK);
    expect(v.primary).toBe("spam");
  });

  it("keeps the built-in vocabulary alongside yours", async () => {
    const m = defineModeration({ deny: ["ourcompetitor"] });
    expect(action(await m.screen("this is fucking great"))).toBe(REVIEW);
  });
});

describe("surfaces", () => {
  const m = defineModeration({
    allow: ["ass"],
    surfaces: {
      comment: { kind: "body" },
      username: { kind: "identity" },
      kidsChat: { kind: "body", audience: "minor" },
      bio: { kind: "body", rules: { profanity: "allow" } },
    },
    personalData: ["phone"],
  });

  it("refuses on a username what it only queues in a comment", async () => {
    expect(action(await m.screen("what a bastard", "comment"))).toBe(REVIEW);
    expect(action(await m.screen("what a bastard", "username"))).toBe(BLOCK);
  });

  it("finds a word fused into a username", async () => {
    expect(action(await m.screen("bastardcollector", "comment"))).toBe(ALLOW);
    expect(action(await m.screen("bastardcollector", "username"))).toBe(BLOCK);
  });

  it("refuses a child's phone number and queues an adult's", async () => {
    const text = "ring me on +44 7700 900123";
    expect(action(await m.screen(text, "comment"))).toBe(REVIEW);
    expect(action(await m.screen(text, "kidsChat"))).toBe(BLOCK);
  });

  it("lets a global rule beat the surface's own judgement", async () => {
    // Documented, and it cuts both ways: an explicit rule is an instruction,
    // so a top-level profanity allowance reaches usernames too. Scoping it to
    // a surface is how you say you did not mean that.
    const everywhere = defineModeration({
      rules: { profanity: "allow" },
      surfaces: { username: { kind: "identity" } },
    });
    const scoped = defineModeration({
      surfaces: {
        comment: { rules: { profanity: "allow" } },
        username: { kind: "identity" },
      },
    });
    expect(action(await everywhere.screen("what a bastard", "username"))).toBe(ALLOW);
    expect(action(await scoped.screen("what a bastard", "comment"))).toBe(ALLOW);
    expect(action(await scoped.screen("what a bastard", "username"))).toBe(BLOCK);
  });

  it("merges surface rules over the global ones", async () => {
    expect(action(await m.screen("this is fucking great", "comment"))).toBe(REVIEW);
    expect(action(await m.screen("this is fucking great", "bio"))).toBe(ALLOW);
  });

  it("carries the global allowance into every surface", async () => {
    expect(action(await m.screen("what an ass", "comment"))).toBe(ALLOW);
    expect(action(await m.screen("what an @ss", "bio"))).toBe(ALLOW);
  });

  it("treats an unknown surface name as the defaults", async () => {
    expect(action(await m.screen("what a bastard", "nosuchsurface"))).toBe(REVIEW);
  });
});

describe("tolerance", () => {
  const at = (tolerance: "strict" | "balanced" | "open") =>
    defineModeration({
      tolerance,
      provider: mockProvider({ script: () => ({ scores: { spam: 0.85 } }) }),
    });

  it("moves the automation line, not the zero-tolerance set", async () => {
    expect(action(await at("strict").screen("x"))).toBe(BLOCK);
    expect(action(await at("balanced").screen("x"))).toBe(REVIEW);
    expect(action(await at("open").screen("x"))).toBe(REVIEW);
  });

  it("still refuses the indefensible at every setting", async () => {
    for (const t of ["strict", "balanced", "open"] as const) {
      const m = defineModeration({
        tolerance: t,
        provider: mockProvider({ script: () => ({ flags: { "sexual/minors": true } }) }),
      });
      expect(action(await m.screen("x"))).toBe(BLOCK);
    }
  });
});

describe("audience", () => {
  it("adult keeps only what is indefensible anywhere", () => {
    const zero = defineModeration({ audience: "adult" }).policyFor().zeroTolerance!;
    expect(zero).toContain("sexual/minors");
    expect(zero).not.toContain("sexual");
  });

  it("minor makes personal data a refusal", () => {
    const zero = defineModeration({ audience: "minor" }).policyFor().zeroTolerance!;
    expect(zero).toContain("pii/phone");
    expect(zero).toContain("profanity");
  });
});

describe("personalData", () => {
  it("takes short names and full ones alike", async () => {
    const short = defineModeration({ personalData: ["card"] });
    const long = defineModeration({ personalData: ["pii/card"] });
    const text = "pay me on 4242 4242 4242 4242";
    expect(action(await short.screen(text))).toBe(BLOCK);
    expect(action(await long.screen(text))).toBe(BLOCK);
  });

  it("detects only the categories you chose", async () => {
    const m = defineModeration({ personalData: ["card"] });
    expect(action(await m.screen("email me at a@b.com"))).toBe(ALLOW);
    expect(action(await defineModeration({ personalData: "all" }).screen("email me at a@b.com"))).toBe(
      REVIEW,
    );
  });
});

describe("mask", () => {
  const m = defineModeration({
    personalData: "all",
    surfaces: { chat: {}, username: { kind: "identity" } },
  });

  it("hides what it finds instead of refusing the message", () => {
    expect(m.mask("call me on +44 7700 900123 you bastard", "chat")).toBe(
      "call me on ############### you #######",
    );
  });

  it("takes any mask", () => {
    expect(m.mask("you bastard", "chat", "***")).toBe("you ***");
  });

  it("leaves alone a word the product allows", () => {
    const relaxed = defineModeration({ allow: ["bastard"] });
    expect(relaxed.mask("you bastard")).toBe("you bastard");
  });

  it("leaves alone a category the product allows", () => {
    const relaxed = defineModeration({ rules: { profanity: "allow" } });
    expect(relaxed.mask("you bastard")).toBe("you bastard");
  });

  it("uses the surface's matcher, so a username is scanned fused", () => {
    expect(m.mask("bastardcollector", "chat")).toBe("bastardcollector");
    expect(m.mask("bastardcollector", "username")).toBe("################");
  });
});

describe("the parts underneath", () => {
  const m = defineModeration({
    surfaces: { comment: {}, other: {}, username: { kind: "identity" } },
  });

  it("hands back the engine and policy for a field hook", () => {
    const f = m.field("username");
    expect(f.engine.enabled).toBe(true);
    expect(f.policy.blockScore).toBe(0.4);
  });

  it("shares one engine between surfaces configured the same way", () => {
    expect(m.engineFor("comment")).toBe(m.engineFor("other"));
    expect(m.engineFor("comment")).not.toBe(m.engineFor("username"));
  });

  it("does not let two surfaces share an engine carrying the wrong policy", async () => {
    const two = defineModeration({
      surfaces: { adults: { audience: "adult" }, kids: { audience: "minor" } },
    });
    expect(two.engineFor("adults")).not.toBe(two.engineFor("kids"));
    expect(action(await two.engineFor("kids").screenText("what a bastard"))).toBe(BLOCK);
  });

  it("honours an explicit policy override wholesale", () => {
    const m2 = defineModeration({
      tolerance: "strict",
      surfaces: { odd: { policy: { blockScore: 0.99, zeroTolerance: [] } } },
    });
    expect(m2.policyFor("odd")).toEqual({ blockScore: 0.99, zeroTolerance: [] });
  });
});

describe("your classifier", () => {
  it("runs after the offline matcher, and only when it has to", async () => {
    const classify = vi.fn(async () => ({ flags: {}, scores: { spam: 0.1 } }));
    const m = defineModeration({ provider: { name: "yours", classify } });

    // The wordlist settles this one on its own; the network stays quiet.
    expect(action(await m.screen("you are a nigger"))).toBe(BLOCK);
    expect(classify).not.toHaveBeenCalled();

    expect(action(await m.screen("perfectly ordinary post"))).toBe(ALLOW);
    expect(classify).toHaveBeenCalledOnce();
  });

  it("passes engine settings through", async () => {
    const sink = vi.fn();
    const m = defineModeration({ sink, cache: false, failMode: "block" });
    await m.screen("this is fucking great");
    expect(sink).toHaveBeenCalledOnce();
  });
});
