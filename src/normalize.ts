/**
 * Text normalisation for word matching — the anti-evasion layer.
 *
 * Naive wordlists die two deaths: they miss trivial evasion ("f u c k",
 * "n1gger", "fuuuck") and they flag innocent words that contain bad ones
 * (the Scunthorpe problem). Both are tokenisation bugs, not vocabulary
 * bugs. This module fixes the tokenisation:
 *
 * - lowercase, strip accents and zero-width characters;
 * - map common leetspeak ("1"→"i", "@"→"a", "$"→"s", …);
 * - split into word tokens, then merge runs of single-letter tokens
 *   ("f u c k" → "fuck") — real words are never one letter long in runs;
 * - offer a letter-run-collapsed variant per token ("fuuuck" → "fuck")
 *   so stretched spellings match without turning "class" into "clas"
 *   for matching purposes (both variants are kept);
 * - offer a variant with leet-derived edges stripped, so "shit!" — which
 *   de-leets to "shiti", because "!" maps to "i" — still matches "shit".
 */

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "g",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  "$": "s",
  "!": "i",
  "+": "t",
};

/** Zero-width and joiner characters used to split words invisibly. */
const ZERO_WIDTH = /[​-‍⁠﻿]/g;

export interface NormalizedToken {
  /** The token as typed (lowercased, de-accented, de-leeted). */
  exact: string;
  /** Letter runs collapsed to one ("fuuuck" → "fuck"). */
  collapsed: string;
  /**
   * `exact` with leading and trailing leet-derived characters removed.
   *
   * The de-leeting that turns "n1gger" into "nigger" also turns "shit!"
   * into "shiti", because "!" maps to "i" — and "shiti" matches no word in
   * any list, so a single exclamation mark used to defeat the whole
   * filter. Mapping only interior characters would break "@ss" instead.
   * Keeping both forms costs one string per token and misses neither.
   */
  bare: string;
}

/** One character of folded text: what it became, and whether we invented it. */
interface Char {
  /** A letter, or " " for everything that is not one. */
  value: string;
  /** True when the leet map produced this letter from a non-letter. */
  substituted: boolean;
}

/** Lowercase, de-accent, de-leet one string; non-letters become spaces. */
function fold(text: string): Char[] {
  const normalized = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(ZERO_WIDTH, "")
    .toLowerCase();
  const out: Char[] = [];
  for (const ch of normalized) {
    const mapped = LEET[ch] ?? ch;
    const isLetter = /\p{L}/u.test(mapped);
    out.push({
      value: isLetter ? mapped : " ",
      substituted: isLetter && mapped !== ch,
    });
  }
  return out;
}

const collapseRuns = (token: string): string => token.replace(/(\p{L})\1+/gu, "$1");

interface RawToken {
  word: string;
  /** Parallel to `word`'s characters. */
  substituted: boolean[];
}

/** Split folded characters into words, keeping the substitution flags. */
function split(chars: Char[]): RawToken[] {
  const tokens: RawToken[] = [];
  let word = "";
  let substituted: boolean[] = [];
  const flush = () => {
    if (word) tokens.push({ word, substituted });
    word = "";
    substituted = [];
  };
  for (const ch of chars) {
    if (ch.value === " ") {
      flush();
      continue;
    }
    word += ch.value;
    substituted.push(ch.substituted);
  }
  flush();
  return tokens;
}

/** Strip leet-derived characters from both ends. */
function bareOf({ word, substituted }: RawToken): string {
  let start = 0;
  let end = word.length;
  while (start < end && substituted[start]) start++;
  while (end > start && substituted[end - 1]) end--;
  return word.slice(start, end);
}

const merge = (tokens: RawToken[]): RawToken => ({
  word: tokens.map((t) => t.word).join(""),
  substituted: tokens.flatMap((t) => t.substituted),
});

/**
 * Tokenise text for word matching. Runs of single-letter tokens are merged
 * ("c-u-n-t", "F.U.C.K", "f u c k" all become one token), everything else
 * keeps its own word boundary — which is what protects "Scunthorpe".
 */
export function normalizeTokens(text: string): NormalizedToken[] {
  const raw = split(fold(text));
  const merged: RawToken[] = [];
  let singles: RawToken[] = [];
  const flush = () => {
    if (singles.length >= 2) merged.push(merge(singles));
    else merged.push(...singles);
    singles = [];
  };
  for (const token of raw) {
    if (token.word.length === 1) {
      singles.push(token);
    } else {
      flush();
      merged.push(token);
    }
  }
  flush();
  return merged.map((token) => ({
    exact: token.word,
    collapsed: collapseRuns(token.word),
    bare: bareOf(token),
  }));
}
