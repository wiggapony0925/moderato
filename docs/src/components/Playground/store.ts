/**
 * Where playground labels live until somebody merges them.
 *
 * The docs site is static — there is no server to POST to, and inventing
 * one would mean asking readers to trust an endpoint with whatever they
 * typed. So labels stay in the reader's own browser and leave as a file
 * they choose to hand over. That is also the honest arrangement: a corpus
 * is a claim about what a product should do, and it should arrive by pull
 * request, reviewed, not by silent collection.
 */

import type { Action } from "moderato";

const KEY = "moderato.playground.corpus.v1";

/** One labelled case, in exactly the shape `corpus/*.jsonl` expects. */
export interface LabelledCase {
  id: string;
  text: string;
  /** What a human says should have happened. */
  expected: Action;
  surface: "comment" | "identity";
  tags: string[];
  note: string | null;
  source: "playground";
  addedAt: string;
  /** What moderato actually said — kept so a disagreement can be studied. */
  observed: { action: Action; score: number; categories: string[]; rule?: string };
  /** Did the reader agree with `observed`? */
  agreed: boolean;
}

const read = (): LabelledCase[] => {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as LabelledCase[]) : [];
  } catch {
    // A corrupted entry is not worth taking the page down for.
    return [];
  }
};

const write = (cases: LabelledCase[]): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(cases));
  } catch {
    /* private mode, quota — the page still works, the label just isn't kept */
  }
};

export const loadCases = read;

export function addCase(item: Omit<LabelledCase, "id" | "addedAt" | "source">): LabelledCase[] {
  const entry: LabelledCase = {
    ...item,
    id: `pg-${Math.random().toString(36).slice(2, 10)}`,
    addedAt: new Date().toISOString().slice(0, 10),
    source: "playground",
  };
  // Newest first: the list under the form is a receipt for what you just
  // did, not an archive.
  const next = [entry, ...read().filter((c) => c.text !== entry.text)];
  write(next);
  return next;
}

export function removeCase(id: string): LabelledCase[] {
  const next = read().filter((c) => c.id !== id);
  write(next);
  return next;
}

export function clearCases(): LabelledCase[] {
  write([]);
  return [];
}

/** The corpus file format: one JSON object per line, no trailing comma. */
export function toJsonl(cases: LabelledCase[]): string {
  return `${cases.map((c) => JSON.stringify(c)).join("\n")}\n`;
}
