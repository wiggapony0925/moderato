/**
 * Wordlist provider — evasion-resistant word and phrase matching, offline.
 *
 * Be clear-eyed about the trade: a classifier understands context
 * ("killer deal" vs "I will kill you"); a wordlist never will, and
 * moderation policy built on one alone flags real posts. What a wordlist
 * IS good for: a free, instant, offline gate for the vocabulary you never
 * want regardless of context — and unlike naive implementations, this one
 * survives "f u c k", "n1gger" and "fuuuck" while leaving "Scunthorpe",
 * "class" and "assassin" alone (see normalize.ts).
 *
 * Matching is whole-token: a listed word matches a token exactly or with a
 * common inflection ("fucking", "fuckers"), never as a substring. Entries
 * with spaces match as consecutive-token PHRASES ("blue waffle"), so the
 * corpus's multi-word entries work too.
 */

import type { Span } from "../mask.js";
import { normalizeTokens, type NormalizedToken } from "../normalize.js";
import type {
  ModerationProvider,
  NormalizedInput,
  ProviderResult,
} from "../types.js";
import { COMPOUND_HOMOGRAPHS, COMPOUND_PARTS } from "../vocab/common.js";
import { EN_PROFANITY } from "../vocab/en.js";

/**
 * How aggressive the matcher is allowed to be.
 *
 * The default is whole-token only, which is the setting that never fires on
 * "Scunthorpe". `scanFused` relaxes that for one specific, real problem:
 * **a username has no spaces to tokenise on.** "niggercollector" is a single
 * token, whole-token matching finds nothing in it, and it is exactly the
 * shape abuse takes on identity fields.
 *
 * The guard is length. Short words are the ones that live inside innocent
 * long words — "ass" in "assassin", "cunt" in "Scunthorpe", "cock" in
 * "cockpit", "dick" in "Dickinson". Requiring six characters excludes every
 * one of those while still catching "nigger", "faggot", "asshole",
 * "bastard". It is a real precision/recall trade and the number is the dial.
 */
export interface WordlistOptions {
  /**
   * Words this product is fine with, even though a preset lists them.
   *
   * This is the setting most people actually need, and the reason a preset
   * cannot be a policy. Instagram allows "fuck" in a comment and does not
   * allow slurs; a games community allows most of the list and none of the
   * hate set; a school platform allows none of it. Same vocabulary, three
   * different products, and none of them should be forking a wordlist to
   * express that.
   *
   * Allowances are matched exactly the way listed words are — normalised,
   * inflected, evasion-resistant — so allowing "ass" also allows "@ss" and
   * "a s s", which is the point. If you allow a word, you have allowed it.
   */
  allow?: string[];
  /** Look for listed words INSIDE a longer token. Default false. */
  scanFused?: boolean;
  /** Shortest listed word allowed to match inside a longer token. Default 6. */
  minFusedLength?: number;
  /** Shortest token worth scanning at all. Default 8. */
  minFusedToken?: number;
  /**
   * Split compound words: "shitshow", "asshat", "shithead".
   *
   * Narrower than `scanFused` and much more precise. The listed word has to
   * sit at the START or END of the token, and whatever is left over has to be
   * an ordinary word in its own right. That second test is what separates
   * "shitshow" (shit + show) from "Scunthorpe" (cunt is not at an edge),
   * "class" (cl is not a word) and "assassin" (assin is not a word).
   *
   * Because it works on boundaries rather than length, it catches four-letter
   * words that `scanFused`'s six-character guard has to let through — which
   * is most of the ones people actually compound.
   *
   * Off by default: it changes what gets refused, and that is your call.
   */
  scanCompound?: boolean;
  /** Words allowed to complete a compound. Default `COMPOUND_PARTS`. */
  compoundParts?: string[];
}

export interface WordlistEntry {
  /** Category reported on a hit ("profanity", "hate", …). */
  category: string;
  /** Single words and/or multi-word phrases. */
  words: string[];
  /** Score reported on a hit. */
  score?: number;
}

/** Inflections a listed word also matches ("fuck" → "fucking"). */
const SUFFIXES = ["s", "es", "ed", "er", "ers", "ing", "in"];

const matchesWord = (token: string, word: string): boolean => {
  if (token === word) return true;
  if (!token.startsWith(word)) return false;
  return SUFFIXES.includes(token.slice(word.length));
};

const tokenMatches = (token: NormalizedToken, word: string): boolean =>
  matchesWord(token.exact, word) ||
  matchesWord(token.collapsed, word) ||
  matchesWord(token.bare, word) ||
  matchesWord(collapseRuns(token.bare), word);

const collapseRuns = (token: string): string => token.replace(/(\p{L})\1+/gu, "$1");

const HOMOGRAPHS = new Set(COMPOUND_HOMOGRAPHS);

/**
 * Is `token` a compound built on `word`?
 *
 * The word has to sit at an edge and the remainder has to be a word. Both
 * halves matter: the edge test kills "Scunthorpe", the remainder test kills
 * "class" and "assassin". Words that are also ordinary English — "cock" is a
 * rooster — are excluded outright, because no test can save "cocktail".
 */
const isCompound = (token: string, word: string, parts: Set<string>): boolean => {
  if (HOMOGRAPHS.has(word)) return false;
  // A remainder of one or two letters is not a word worth trusting.
  if (token.length < word.length + 3) return false;
  if (token.startsWith(word) && parts.has(token.slice(word.length))) return true;
  return token.endsWith(word) && parts.has(token.slice(0, -word.length));
};

/**
 * The allow list, prepared once.
 *
 * An allowance is checked with the same matcher as a listed word, so
 * allowing "ass" allows "@ss", "a s s" and "asses" too. Anything less would
 * be a setting that works until somebody types around it, which is not a
 * setting, it is a trap.
 */
const prepareAllow = (words: string[] | undefined): string[] =>
  (words ?? []).map((word) => word.toLowerCase().trim()).filter(Boolean);

const isAllowed = (token: NormalizedToken, allow: string[]): boolean =>
  allow.length > 0 && allow.some((word) => tokenMatches(token, word));

/** A phrase matches when its words line up on consecutive tokens. */
const phraseMatches = (tokens: NormalizedToken[], words: string[]): boolean => {
  outer: for (let start = 0; start + words.length <= tokens.length; start++) {
    for (let i = 0; i < words.length; i++) {
      if (!tokenMatches(tokens[start + i]!, words[i]!)) continue outer;
    }
    return true;
  }
  return false;
};

/**
 * Every listed word in `text`, with where it sits in the original string.
 *
 * The matching is identical to what the provider does — same normalisation,
 * same inflections, same phrase and fused handling. The difference is that
 * this reports WHERE, which is what anything that masks or highlights needs.
 */
export function findTerms(
  text: string,
  entries: WordlistEntry[],
  options: WordlistOptions = {},
): Span[] {
  const scanFused = options.scanFused === true;
  const minFusedLength = options.minFusedLength ?? 6;
  const minFusedToken = options.minFusedToken ?? 8;
  const scanCompound = options.scanCompound === true;
  const parts = new Set(options.compoundParts ?? COMPOUND_PARTS);
  const allow = prepareAllow(options.allow);
  const tokens = normalizeTokens(text);
  const found: Span[] = [];

  for (const entry of entries) {
    const singles: string[] = [];
    const phrases: string[][] = [];
    for (const raw of entry.words) {
      const parts = raw.toLowerCase().split(/\s+/).filter(Boolean);
      if (parts.length > 1) phrases.push(parts);
      else if (parts[0]) singles.push(parts[0]);
    }

    for (const token of tokens) {
      if (isAllowed(token, allow)) continue;
      const hit =
        singles.some((word) => tokenMatches(token, word)) ||
        (scanCompound &&
          singles.some((word) => isCompound(token.exact, word, parts))) ||
        (scanFused &&
          token.exact.length >= minFusedToken &&
          singles.some(
            (word) => word.length >= minFusedLength && token.exact.includes(word),
          ));
      if (hit) {
        found.push({
          category: entry.category,
          value: text.slice(token.start, token.end),
          start: token.start,
          end: token.end,
        });
      }
    }

    // Phrases span from the first matched token to the last.
    for (const phrase of phrases) {
      outer: for (let i = 0; i + phrase.length <= tokens.length; i++) {
        for (let j = 0; j < phrase.length; j++) {
          if (!tokenMatches(tokens[i + j]!, phrase[j]!)) continue outer;
          if (isAllowed(tokens[i + j]!, allow)) continue outer;
        }
        const start = tokens[i]!.start;
        const end = tokens[i + phrase.length - 1]!.end;
        found.push({
          category: entry.category,
          value: text.slice(start, end),
          start,
          end,
        });
      }
    }
  }

  return found.sort((a, b) => a.start - b.start || b.end - a.end);
}

export function wordlistProvider(
  entries: WordlistEntry[],
  options: WordlistOptions = {},
): ModerationProvider {
  const scanFused = options.scanFused === true;
  const minFusedLength = options.minFusedLength ?? 6;
  const minFusedToken = options.minFusedToken ?? 8;
  const scanCompound = options.scanCompound === true;
  const parts = new Set(options.compoundParts ?? COMPOUND_PARTS);
  const allow = prepareAllow(options.allow);

  // Precompile: lowercase everything, split phrases once, not per call.
  const prepared = entries.map((entry) => {
    const singles: string[] = [];
    const phrases: string[][] = [];
    for (const raw of entry.words) {
      const parts = raw.toLowerCase().split(/\s+/).filter(Boolean);
      if (parts.length > 1) phrases.push(parts);
      else if (parts[0]) singles.push(parts[0]);
    }
    // Words long enough to be safe to look for inside another word, plus
    // phrases with their spaces removed — "blue waffle" typed as one token
    // is the same evasion by another route.
    const fusable = scanFused
      ? [
          ...singles.filter((word) => word.length >= minFusedLength),
          ...phrases.map((parts) => parts.join("")).filter((w) => w.length >= minFusedLength),
        ]
      : [];
    return {
      category: entry.category,
      score: entry.score ?? 0.9,
      singles: new Set(singles),
      singlesList: singles,
      phrases,
      fusable,
    };
  });

  return {
    name: `wordlist${scanCompound ? "+compound" : ""}${scanFused ? "+fused" : ""}`,
    async classify(input: NormalizedInput): Promise<ProviderResult> {
      const flags: Record<string, boolean> = {};
      const scores: Record<string, number> = {};
      if (!input.text) return { flags, scores };
      const all = normalizeTokens(input.text);
      // Allowed words are removed before anything looks at them, so an
      // allowance holds for the fused scan and the phrase pass as well.
      const tokens = allow.length > 0 ? all.filter((t) => !isAllowed(t, allow)) : all;
      for (const entry of prepared) {
        // Exact-token lookups first (fast path for big vocabularies),
        // then the suffix pass, then phrases.
        const hit =
          tokens.some(
            (token) =>
              entry.singles.has(token.exact) ||
              entry.singles.has(token.collapsed) ||
              entry.singles.has(token.bare),
          ) ||
          tokens.some((token) =>
            entry.singlesList.some((word) => tokenMatches(token, word)),
          ) ||
          entry.phrases.some((phrase) => phraseMatches(tokens, phrase)) ||
          // Compound splitting before the fused scan: it is the more precise
          // of the two, and it catches the short words fused cannot.
          (scanCompound &&
            tokens.some((token) =>
              entry.singlesList.some((word) =>
                isCompound(token.exact, word, parts),
              ),
            )) ||
          // Fused scan, last because it is the most expensive and the least
          // precise: only long tokens, only long words.
          (entry.fusable.length > 0 &&
            tokens.some(
              (token) =>
                token.exact.length >= minFusedToken &&
                entry.fusable.some((word) => token.exact.includes(word)),
            ));
        if (hit) {
          flags[entry.category] = true;
          scores[entry.category] = Math.max(scores[entry.category] ?? 0, entry.score);
        }
      }
      return { flags, scores };
    },
  };
}

/** Slurs and dehumanising terms — reported as "hate" at near-certainty.
 *  Curated separately from the bulk corpus so policy can treat hate as
 *  zero-tolerance while ordinary profanity stays review-band. */
const HATE_WORDS = [
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "dyke",
  "kike",
  "spic",
  "chink",
  "gook",
  "wetback",
  "beaner",
  "raghead",
  "towelhead",
  "tranny",
  "shemale",
  "retard",
  "retards",
  "coon",
  "darkie",
  "golliwog",
  "paki",
  "zipperhead",
];

/**
 * The curated core: high-precision everyday profanity + the hate set.
 * Small enough to read in one sitting, safe enough to run on a live
 * community without flagging half the feed.
 */
export const PROFANITY_PRESET: WordlistEntry[] = [
  {
    category: "profanity",
    score: 0.72,
    words: [
      "fuck",
      "motherfucker",
      "shit",
      "bullshit",
      "ass",
      "asshole",
      "bitch",
      "bastard",
      "cunt",
      "pussy",
      "dick",
      "cock",
      "twat",
      "wanker",
      "prick",
      "slut",
      "whore",
      "douchebag",
      "jackass",
      "dumbass",
    ],
  },
  { category: "hate", score: 0.99, words: HATE_WORDS },
];

/**
 * Maximum recall: the full vendored LDNOOBW corpus (403 entries incl.
 * multi-word phrases) as "profanity", with the hate set elevated on top.
 * This is the family-friendly / brand-safety dial — expect it to flag
 * clinical and borderline vocabulary that PROFANITY_PRESET lets pass;
 * that's the point of choosing it.
 */
export const PROFANITY_PRESET_STRICT: WordlistEntry[] = [
  { category: "profanity", score: 0.72, words: Array.from(EN_PROFANITY) },
  { category: "hate", score: 0.99, words: HATE_WORDS },
];
