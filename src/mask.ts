/**
 * Masking — the third outcome, and the one most systems are missing.
 *
 * allow / review / block is a decision about a *message*. Sometimes the right
 * unit is smaller than that. Somebody writes four sentences arranging a
 * meet-up and one of them contains their phone number; refusing the whole
 * thing throws away the other three and tells them nothing useful.
 *
 * Roblox is worth studying here. Their filter does not refuse chat — it
 * replaces the offending characters with hashes and sends the message anyway.
 * Two things fall out of that which are easy to miss:
 *
 * 1. **The conversation survives.** A refused message is a dead end; a masked
 *    one still communicates most of what it meant.
 * 2. **The evader learns nothing.** A refusal is a signal — it tells someone
 *    exactly which word tripped, so they can go and find one that doesn't.
 *    Hashes tell them the filter exists and nothing else.
 *
 * It is not free. Masking is silent about a real violation, so it belongs on
 * ordinary vocabulary and personal information, not on threats. Use it where
 * you would otherwise have queued something, and keep refusing what deserves
 * refusing.
 */

/** A span of the original text, with what it was found to be. */
export interface Span {
  category: string;
  value: string;
  start: number;
  end: number;
}

export type Mask = string | ((span: Span) => string);

const apply = (span: Span, mask: Mask): string =>
  typeof mask === "function" ? mask(span) : mask;

/**
 * Hash out a span, keeping its length so the shape of the sentence survives.
 * This is the Roblox rendering: `"you ####### idiot"`.
 */
export const hashes: Mask = (span) => "#".repeat([...span.value].length);

/** Name what was removed instead of hiding that anything was. */
export const labelled: Mask = (span) =>
  `[${span.category.replace(/^pii\//, "")} removed]`;

/**
 * Replace every span in `text`. Spans may arrive in any order and may
 * overlap; overlapping ones are resolved by keeping the first and dropping
 * anything that intersects it, so a card number already masked is not masked
 * again as a phone number.
 */
export function maskSpans(text: string, spans: Span[], mask: Mask = hashes): string {
  const ordered = spans.slice().sort((a, b) => a.start - b.start || b.end - a.end);
  let out = "";
  let cursor = 0;
  for (const span of ordered) {
    if (span.start < cursor) continue;
    out += text.slice(cursor, span.start) + apply(span, mask);
    cursor = span.end;
  }
  return out + text.slice(cursor);
}
