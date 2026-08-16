/**
 * Personal information — the other thing people post that they should not.
 *
 * Toxicity and PII look like the same problem and are not. Nobody types their
 * own phone number to be abusive; they type it because they want a stranger
 * to call them about a sofa, and whether that is fine depends entirely on
 * what your product is for. A marketplace wants it. A children's app must
 * never allow it. A support tool needs the phone number and must never let a
 * card number through.
 *
 * So this ships as a set of detectors you choose from, not a policy. Pick the
 * categories your product cares about and leave the rest off.
 *
 * **Regexes alone are not detectors.** A pattern that matches sixteen digits
 * flags every order number your users ever paste. Every rule here validates
 * what it matched: card numbers by the Luhn checksum, social security numbers
 * against the ranges the SSA never issued, IP addresses by octet range, phone
 * numbers by digit count and separator shape. That is the difference between
 * a detector and a nuisance.
 */

import type {
  ModerationProvider,
  NormalizedInput,
  ProviderResult,
} from "../types.js";

export type PiiCategory =
  | "pii/email"
  | "pii/phone"
  | "pii/ssn"
  | "pii/card"
  | "pii/ip"
  | "pii/location";

export interface PiiMatch {
  category: PiiCategory;
  /** Exactly what was matched, so you can redact or show it. */
  value: string;
  start: number;
  end: number;
}

interface Rule {
  category: PiiCategory;
  pattern: RegExp;
  /** Second gate: is this match actually the thing, or a lookalike? */
  valid: (match: RegExpExecArray) => boolean;
  /** Confidence, which the policy turns into an action. */
  score: number;
}

const digitsOf = (value: string): string => value.replace(/\D/g, "");

/**
 * The Luhn checksum. Every real payment card satisfies it and roughly nine in
 * ten random digit strings of the same length do not — which is the entire
 * reason this file is not just a regex.
 */
export function luhn(value: string): boolean {
  const digits = digitsOf(value);
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Ranges the US Social Security Administration has never issued. */
function validSsn(area: string, group: string, serial: string): boolean {
  const a = Number(area);
  if (a === 0 || a === 666 || a >= 900) return false;
  if (Number(group) === 0) return false;
  return Number(serial) !== 0;
}

const RULES: Rule[] = [
  {
    category: "pii/email",
    pattern: /\b[\w.%+'-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/gi,
    valid: () => true,
    score: 0.8,
  },
  {
    // Card numbers first: a 16-digit run also looks like a phone number to a
    // looser pattern, and this one can actually prove itself.
    category: "pii/card",
    pattern: /\b(?:\d[ -]?){12,18}\d\b/g,
    valid: (m) => luhn(m[0]),
    score: 0.97,
  },
  {
    category: "pii/ssn",
    // Dashes or spaces required. A bare nine-digit run is an order number far
    // more often than it is a social security number.
    pattern: /\b(\d{3})[- ](\d{2})[- ](\d{4})\b/g,
    valid: (m) => validSsn(m[1]!, m[2]!, m[3]!),
    score: 0.96,
  },
  {
    category: "pii/phone",
    // Either an international prefix, or a grouped national number. The
    // grouping is the signal — "5550109999" is unrecoverable from an order
    // reference, and guessing costs you more than missing it.
    pattern:
      /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,5})[\s.-]\d{2,4}[\s.-]?\d{2,4}(?:[\s.-]\d{2,4})?/g,
    valid: (m) => {
      const value = m[0].trim();
      const digits = digitsOf(value);
      if (digits.length < 7 || digits.length > 15) return false;
      // Three things share the shape of a phone number and are not one.
      // Dates, in either order:
      if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(value)) return false;
      if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(value)) return false;
      // And a 3-2-4 grouping, which is a social security number's shape. The
      // SSN rule runs first, so anything reaching here in that shape is one
      // the SSN rule already rejected as implausible — it is not a phone
      // number either.
      if (/^\d{3}[- ]\d{2}[- ]\d{4}$/.test(value)) return false;
      const separators = (value.match(/[\s.()-]/g) ?? []).length;
      return value.includes("+") || separators >= 2;
    },
    score: 0.78,
  },
  {
    category: "pii/ip",
    pattern: /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g,
    valid: (m) =>
      [m[1], m[2], m[3], m[4]].every((part) => Number(part) <= 255) &&
      // A version number is the false positive here, and it almost always
      // has a small first octet and no leading zeroes to distinguish it.
      Number(m[1]) > 9,
    score: 0.55,
  },
  {
    category: "pii/location",
    // Four decimal places is roughly eleven metres — house-level. Fewer than
    // that is a city, which nobody needs protecting from.
    pattern: /\b-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/g,
    valid: (m) => {
      const [lat, lon] = m[0].split(",").map((part) => Number(part.trim()));
      return Math.abs(lat!) <= 90 && Math.abs(lon!) <= 180;
    },
    score: 0.75,
  },
];

export const PII_CATEGORIES: readonly PiiCategory[] = RULES.map((r) => r.category);

export interface PiiOptions {
  /**
   * Which categories to look for. Omit for all of them.
   *
   * This is the dial that makes the difference between products. A
   * marketplace where people arrange collection wants phone numbers to pass
   * and card numbers refused; a children's app wants neither. Leave a
   * category out and it is not detected at all — cheaper than detecting it
   * and then deciding to ignore it.
   */
  categories?: PiiCategory[];
  /** Override the confidence for a category. */
  scores?: Partial<Record<PiiCategory, number>>;
}

/** Every piece of personal information in `text`, in the order it appears. */
export function findPii(text: string, options: PiiOptions = {}): PiiMatch[] {
  const wanted = new Set<PiiCategory>(options.categories ?? PII_CATEGORIES);
  const found: PiiMatch[] = [];
  const claimed: Array<[number, number]> = [];

  for (const rule of RULES) {
    if (!wanted.has(rule.category)) continue;
    // Fresh regex per call: a /g/ pattern remembers where it stopped.
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
        continue;
      }
      if (!rule.valid(match)) continue;
      const start = match.index;
      const end = start + match[0].length;
      // Rules run most-specific first, so a card number already claimed by
      // the Luhn rule is not re-reported as a phone number.
      if (claimed.some(([s, e]) => start < e && end > s)) continue;
      claimed.push([start, end]);
      found.push({ category: rule.category, value: match[0], start, end });
    }
  }

  return found.sort((a, b) => a.start - b.start);
}

/**
 * The same text with every detected value replaced.
 *
 * Useful in two places: showing a moderator what was posted without putting
 * somebody's card number in your review queue, and letting a message through
 * with the personal part removed rather than refusing the whole thing —
 * which is very often the kinder answer.
 */
export function redactPii(
  text: string,
  options: PiiOptions & { mask?: (match: PiiMatch) => string } = {},
): string {
  const mask = options.mask ?? ((m) => `[${m.category.replace("pii/", "")} removed]`);
  const matches = findPii(text, options);
  let out = "";
  let cursor = 0;
  for (const match of matches) {
    out += text.slice(cursor, match.start) + mask(match);
    cursor = match.end;
  }
  return out + text.slice(cursor);
}

/**
 * PII as a moderation provider, so it composes with everything else — chain
 * it in front of a classifier, and the policy decides what each category
 * means for your product.
 *
 * With the default policy: card numbers and social security numbers refuse
 * outright (they score above the block line), and emails, phone numbers,
 * coordinates and IPs publish and queue. Change that per category the same
 * way you change anything else — see `PolicyConfig.categories`.
 */
export function piiProvider(options: PiiOptions = {}): ModerationProvider {
  return {
    name: "pii",
    async classify(input: NormalizedInput): Promise<ProviderResult> {
      const flags: Record<string, boolean> = {};
      const scores: Record<string, number> = {};
      if (!input.text) return { flags, scores };
      for (const match of findPii(input.text, options)) {
        const rule = RULES.find((r) => r.category === match.category)!;
        const score = options.scores?.[match.category] ?? rule.score;
        flags[match.category] = true;
        scores[match.category] = Math.max(scores[match.category] ?? 0, score);
      }
      return { flags, scores };
    },
  };
}
