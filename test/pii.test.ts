import { describe, expect, it } from "vitest";
import {
  BLOCK,
  PII_CATEGORIES,
  REVIEW,
  createModerato,
  findPii,
  luhn,
  piiProvider,
  redactPii,
  POLICY_PRESETS,
} from "../src/index.js";

const cats = (text: string) => findPii(text).map((m) => m.category);

describe("luhn", () => {
  it("accepts real card numbers and rejects lookalikes", () => {
    expect(luhn("4242 4242 4242 4242")).toBe(true);
    expect(luhn("5555555555554444")).toBe(true);
    expect(luhn("378282246310005")).toBe(true);
    // The reason the checksum is here at all: a sixteen-digit order number.
    expect(luhn("1234567890123456")).toBe(false);
    expect(luhn("4242424242424241")).toBe(false);
  });

  it("rejects anything the wrong length", () => {
    expect(luhn("42424242")).toBe(false);
    expect(luhn("42424242424242424242")).toBe(false);
  });
});

describe("findPii", () => {
  it("finds an email", () => {
    expect(cats("write to sam.o'brien+tag@example.co.uk please")).toEqual([
      "pii/email",
    ]);
  });

  it("finds phone numbers in the shapes people actually type", () => {
    for (const phone of [
      "+44 7700 900123",
      "+1 (555) 010-9999",
      "555-010-9999",
      "(020) 7946 0958",
    ]) {
      expect(cats(`call ${phone} today`)).toContain("pii/phone");
    }
  });

  it("does not call an order number or a date a phone number", () => {
    expect(cats("order 5550109999 shipped")).toEqual([]);
    expect(cats("posted on 2026-08-16")).toEqual([]);
    expect(cats("upgrade to 1.2.3 today")).toEqual([]);
  });

  it("finds a card number and ignores a digit string that is not one", () => {
    expect(cats("card 4242 4242 4242 4242")).toEqual(["pii/card"]);
    // Same length, same shape, fails the checksum.
    expect(cats("reference 1234567890123456")).toEqual([]);
  });

  it("finds a social security number, and only a plausible one", () => {
    expect(cats("ssn 123-45-6789")).toEqual(["pii/ssn"]);
    // Ranges the SSA has never issued.
    expect(cats("ssn 000-45-6789")).toEqual([]);
    expect(cats("ssn 666-45-6789")).toEqual([]);
    expect(cats("ssn 900-45-6789")).toEqual([]);
    expect(cats("ssn 123-00-6789")).toEqual([]);
  });

  it("finds house-level coordinates and ignores a city-level one", () => {
    expect(cats("meet me at 51.50722, -0.12750")).toEqual(["pii/location"]);
    expect(cats("somewhere near 51.5, -0.1")).toEqual([]);
  });

  it("finds an IP but not a version string", () => {
    expect(cats("from 203.0.113.42")).toEqual(["pii/ip"]);
    expect(cats("running 1.2.3.4")).toEqual([]);
  });

  it("does not report the same span twice", () => {
    // A card number is also phone-shaped. The more specific rule wins.
    expect(cats("4242 4242 4242 4242")).toEqual(["pii/card"]);
  });

  it("takes a category allowlist — the whole point of the design", () => {
    const text = "call +44 7700 900123 or pay with 4242 4242 4242 4242";
    // A marketplace where people arrange collection wants the phone number
    // through and the card number stopped.
    expect(findPii(text, { categories: ["pii/card"] }).map((m) => m.category)).toEqual([
      "pii/card",
    ]);
  });

  it("reports positions, so a caller can highlight or redact", () => {
    const [match] = findPii("email me: a@b.com");
    expect(match?.value).toBe("a@b.com");
    expect("email me: a@b.com".slice(match!.start, match!.end)).toBe("a@b.com");
  });

  it("finds nothing in ordinary text", () => {
    expect(cats("has anyone else had trouble with the checkout page")).toEqual([]);
  });
});

describe("redactPii", () => {
  it("removes the personal part and keeps the rest", () => {
    expect(redactPii("ring me on +44 7700 900123 tomorrow")).toBe(
      "ring me on [phone removed] tomorrow",
    );
  });

  it("takes a custom mask", () => {
    expect(redactPii("a@b.com", { mask: () => "•••" })).toBe("•••");
  });

  it("only redacts the categories asked for", () => {
    const text = "a@b.com and 4242 4242 4242 4242";
    expect(redactPii(text, { categories: ["pii/card"] })).toBe(
      "a@b.com and [card removed]",
    );
  });
});

describe("piiProvider under the default policy", () => {
  const engine = createModerato({ provider: piiProvider() });

  it("refuses a card number outright", async () => {
    expect((await engine.screenText("pay 4242 4242 4242 4242")).action).toBe(BLOCK);
  });

  it("refuses a social security number outright", async () => {
    expect((await engine.screenText("ssn 123-45-6789")).action).toBe(BLOCK);
  });

  it("queues a phone number rather than refusing it", async () => {
    // Ordinary on a marketplace, worth a glance elsewhere — exactly the
    // sort of judgement that belongs to a human, not a threshold.
    expect((await engine.screenText("call +44 7700 900123")).action).toBe(REVIEW);
  });

  it("leaves clean text alone", async () => {
    expect((await engine.screenText("thanks, that fixed it")).action).toBe("allow");
  });
});

describe("POLICY_PRESETS.minor", () => {
  const engine = createModerato({ provider: piiProvider() });

  it("refuses contact details from a child that an adult could post", async () => {
    const text = "call me on +44 7700 900123";
    expect((await engine.screenText(text)).action).toBe(REVIEW);
    expect(
      (await engine.screenText(text, { policy: POLICY_PRESETS.minor })).action,
    ).toBe(BLOCK);
  });

  it("refuses a home location from a child", async () => {
    const text = "I live at 51.50722, -0.12750";
    expect(
      (await engine.screenText(text, { policy: POLICY_PRESETS.minor })).action,
    ).toBe(BLOCK);
  });

  it("still lets an ordinary message through", async () => {
    expect(
      (await engine.screenText("does anyone play this too", {
        policy: POLICY_PRESETS.minor,
      })).action,
    ).toBe("allow");
  });
});

describe("PII_CATEGORIES", () => {
  it("lists every detector, so a caller can build a picker", () => {
    expect([...PII_CATEGORIES].sort()).toEqual([
      "pii/card",
      "pii/email",
      "pii/ip",
      "pii/location",
      "pii/phone",
      "pii/ssn",
    ]);
  });
});
