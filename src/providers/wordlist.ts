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

import { normalizeTokens, type NormalizedToken } from "../normalize.js";
import type {
  ModerationProvider,
  NormalizedInput,
  ProviderResult,
} from "../types.js";
import { EN_PROFANITY } from "../vocab/en.js";

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

export function wordlistProvider(entries: WordlistEntry[]): ModerationProvider {
  // Precompile: lowercase everything, split phrases once, not per call.
  const prepared = entries.map((entry) => {
    const singles: string[] = [];
    const phrases: string[][] = [];
    for (const raw of entry.words) {
      const parts = raw.toLowerCase().split(/\s+/).filter(Boolean);
      if (parts.length > 1) phrases.push(parts);
      else if (parts[0]) singles.push(parts[0]);
    }
    return { category: entry.category, score: entry.score ?? 0.9, singles: new Set(singles), singlesList: singles, phrases };
  });

  return {
    name: "wordlist",
    async classify(input: NormalizedInput): Promise<ProviderResult> {
      const flags: Record<string, boolean> = {};
      const scores: Record<string, number> = {};
      if (!input.text) return { flags, scores };
      const tokens = normalizeTokens(input.text);
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
          entry.phrases.some((phrase) => phraseMatches(tokens, phrase));
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
  { category: "profanity", score: 0.72, words: [...EN_PROFANITY] },
  { category: "hate", score: 0.99, words: HATE_WORDS },
];
