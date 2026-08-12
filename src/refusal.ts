/**
 * The server-refusal contract.
 *
 * A client-side check can be skipped by anyone talking to your API
 * directly, so the only screen that can actually refuse is the server's.
 * The client's job is to recognise that refusal and present it well. The
 * stable contract is the STATUS (422 by default), not the message text —
 * the copy is the server's to change per surface.
 */

export const REFUSED_STATUS = 422;

export const DEFAULT_REFUSAL_FALLBACK =
  "That looks like it breaks the community rules. Try rewording it.";

export interface RefusalOptions {
  /** The status your API uses for "the screen said no". */
  status?: number;
  /** Shown when the server sent no usable message. */
  fallback?: string;
}

/**
 * The server's explanation, if this error was a moderation refusal;
 * `null` for every other kind of failure (network, auth, validation…).
 */
export function refusalFrom(
  err: unknown,
  options: RefusalOptions = {},
): string | null {
  const status = (err as { status?: number } | null | undefined)?.status;
  if (status !== (options.status ?? REFUSED_STATUS)) return null;
  const message = (err as { message?: string } | null | undefined)?.message;
  return message?.trim() || options.fallback || DEFAULT_REFUSAL_FALLBACK;
}
