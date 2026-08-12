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
 *   for matching purposes (both variants are kept).
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
}

/** Lowercase, de-accent, de-leet one string; non-letters become spaces. */
function letters(text: string): string {
  const folded = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(ZERO_WIDTH, "")
    .toLowerCase();
  let out = "";
  for (const ch of folded) {
    const mapped = LEET[ch] ?? ch;
    out += /\p{L}/u.test(mapped) ? mapped : " ";
  }
  return out;
}

const collapseRuns = (token: string): string => token.replace(/(\p{L})\1+/gu, "$1");

/**
 * Tokenise text for word matching. Runs of single-letter tokens are merged
 * ("c-u-n-t", "F.U.C.K", "f u c k" all become one token), everything else
 * keeps its own word boundary — which is what protects "Scunthorpe".
 */
export function normalizeTokens(text: string): NormalizedToken[] {
  const raw = letters(text).split(/\s+/).filter(Boolean);
  const merged: string[] = [];
  let singles: string[] = [];
  const flush = () => {
    if (singles.length >= 2) merged.push(singles.join(""));
    else merged.push(...singles);
    singles = [];
  };
  for (const token of raw) {
    if (token.length === 1) {
      singles.push(token);
    } else {
      flush();
      merged.push(token);
    }
  }
  flush();
  return merged.map((token) => ({ exact: token, collapsed: collapseRuns(token) }));
}
