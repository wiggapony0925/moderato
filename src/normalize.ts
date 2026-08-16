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
 *   de-leets to "shiti", because "!" maps to "i" — still matches "shit";
 * - fold homoglyphs: Cyrillic "а", Greek "ο" and friends look exactly like
 *   their Latin twins and are the least-effort evasion there is, because
 *   the attacker does not even have to misspell anything.
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

/**
 * Characters that LOOK like Latin letters and are not.
 *
 * This is the evasion that costs nothing to perform and, without a map like
 * this, nothing to get away with: "nigger" typed with a Cyrillic "е" is a
 * different string to every comparison in the world, and identical to every
 * human eye. Unicode publishes a confusables table for exactly this; the
 * subset below is the part that matters for Latin-script matching — Cyrillic
 * and Greek letters whose common forms are visually identical.
 *
 * NFKD (applied first) already folds fullwidth forms, circled letters and
 * the mathematical alphanumerics. It does NOT touch Cyrillic or Greek,
 * because they are genuinely different letters — which is precisely why
 * they work as a disguise.
 */
const CONFUSABLES: Record<string, string> = {
  // Cyrillic
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o", р: "p", с: "c",
  т: "t", у: "y", х: "x", і: "i", ј: "j", ѕ: "s", ԁ: "d", һ: "h", ԛ: "q",
  ԝ: "w", ғ: "f", ц: "u", ь: "b",
  // Greek
  α: "a", β: "b", γ: "y", ε: "e", ζ: "z", η: "n", ι: "i", κ: "k", ν: "v",
  ο: "o", ρ: "p", σ: "o", τ: "t", υ: "u", χ: "x", ϲ: "c", ϳ: "j", ѵ: "v",
  // Latin look-alikes from other blocks
  ı: "i", ȷ: "j", ɑ: "a", ɡ: "g", ɩ: "i",
  // Small capitals (U+1D00 block and friends). No Unicode decomposition, so
  // NFKD leaves them alone — and "ꜰucking" reads perfectly well to a person.
  ᴀ: "a", ʙ: "b", ᴄ: "c", ᴅ: "d", ᴇ: "e", ꜰ: "f", ɢ: "g", ʜ: "h", ɪ: "i",
  ᴊ: "j", ᴋ: "k", ʟ: "l", ᴍ: "m", ɴ: "n", ᴏ: "o", ᴘ: "p", ꞯ: "q", ʀ: "r",
  ꜱ: "s", ᴛ: "t", ᴜ: "u", ᴠ: "v", ᴡ: "w", ʏ: "y", ᴢ: "z",
};

/** Zero-width and joiner characters used to split words invisibly. */
const ZERO_WIDTH = /[​-‍⁠﻿]/u;

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
  /**
   * Where this token starts and ends in the ORIGINAL string.
   *
   * Needed for anything that wants to mask or highlight rather than refuse:
   * replacing a matched word with "####" and letting the message through is
   * very often the kinder answer, and you cannot do it without knowing which
   * characters to replace. Offsets survive every transformation above —
   * "f u c k" spans all seven characters, and a de-leeted "n1gger" spans all
   * six.
   */
  start: number;
  end: number;
}

/** One character of folded text: what it became, and where it came from. */
interface Char {
  /** A letter, or " " for everything that is not one. */
  value: string;
  /** True when the leet map produced this letter from a non-letter. */
  substituted: boolean;
  /** Offsets of the ORIGINAL character this came from. */
  start: number;
  end: number;
}

/**
 * Lowercase, de-accent, de-leet one string; non-letters become spaces.
 *
 * Normalisation runs per source character rather than over the whole string,
 * which is slightly slower and is the only way to keep offsets honest: NFKD
 * changes lengths (a ligature becomes two letters, an accent becomes a letter
 * plus a mark that is then dropped), so a position in the folded string tells
 * you nothing about a position in what the user typed.
 */
function fold(text: string): Char[] {
  const out: Char[] = [];
  let index = 0;
  for (const raw of text) {
    const size = raw.length;
    const start = index;
    index += size;
    if (ZERO_WIDTH.test(raw)) continue;
    const decomposed = raw.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
    for (const ch of decomposed) {
      // Homoglyph first: a Cyrillic "е" must become "e" before anything else
      // decides whether it is a letter worth keeping.
      const deconfused = CONFUSABLES[ch] ?? ch;
      const mapped = LEET[deconfused] ?? deconfused;
      const isLetter = /\p{L}/u.test(mapped);
      out.push({
        value: isLetter ? mapped : " ",
        // A homoglyph swap is not a "substitution" in the `bare` sense — that
        // variant exists to undo punctuation-as-letters, and a Cyrillic "е"
        // was always meant to be a letter.
        substituted: isLetter && mapped !== deconfused,
        start,
        end: start + size,
      });
    }
  }
  return out;
}

const collapseRuns = (token: string): string => token.replace(/(\p{L})\1+/gu, "$1");

interface RawToken {
  word: string;
  /** Parallel to `word`'s characters. */
  substituted: boolean[];
  start: number;
  end: number;
}

/** Split folded characters into words, keeping the substitution flags. */
function split(chars: Char[]): RawToken[] {
  const tokens: RawToken[] = [];
  let word = "";
  let substituted: boolean[] = [];
  let start = 0;
  let end = 0;
  const flush = () => {
    if (word) tokens.push({ word, substituted, start, end });
    word = "";
    substituted = [];
  };
  for (const ch of chars) {
    if (ch.value === " ") {
      flush();
      continue;
    }
    if (!word) start = ch.start;
    end = ch.end;
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
  // A merged run spans everything between its first and last letter, so
  // masking "f u c k" replaces the spaces too.
  start: tokens[0]!.start,
  end: tokens[tokens.length - 1]!.end,
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
    start: token.start,
    end: token.end,
  }));
}
