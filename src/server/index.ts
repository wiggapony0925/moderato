/**
 * moderato/server — the half that can actually refuse.
 *
 * **Read this before you decide where to put screening.** A client-side
 * check is a courtesy to honest users. It stops the person who typed
 * something awful without thinking, it stops it instantly, and it costs no
 * round trip. It stops nobody who opens the network tab. Anyone can POST to
 * your API directly, and on the day someone does, the only thing standing
 * between them and your feed is the server.
 *
 * So: **screen on both, enforce on one.**
 *
 *   • the client screens for SPEED and KINDNESS — `useModeratedField` tells
 *     you your username is a slur before you fill in the rest of the form;
 *   • the server screens for TRUTH — one chokepoint every write goes
 *     through, one refusal message registry, one audit trail.
 *
 * This module is that chokepoint, in about as little code as it can be:
 *
 *   • `guard()` — screen, and throw a typed 422 if the policy says no.
 *     Call it at the top of every handler that publishes something;
 *   • `createModerationHandler()` — a Fetch-standard endpoint your CLIENT
 *     engine can point `httpProvider` at, so the browser never sees a
 *     vendor key and both halves run the same policy;
 *   • `toNodeHandler()` — the same thing for Express/Connect.
 *
 * Nothing here imports a framework. It is Request in, Response out, which
 * is what Next route handlers, Hono, Bun, Deno, and Cloudflare Workers all
 * speak natively — and `toNodeHandler` bridges the ones that don't.
 */

import type { Moderato, ScreenOptions } from "../engine.js";
import { DEFAULT_REFUSAL_MESSAGE } from "../policy.js";
import { REFUSED_STATUS } from "../refusal.js";
import type { ScreenInput, Verdict } from "../types.js";
import { BLOCK } from "../types.js";

/**
 * The refusal, as an exception your error handler already knows how to
 * turn into a response. `status` is 422 by default — the same status
 * `refusalFrom()` looks for on the client, so the two halves agree without
 * either one being configured.
 */
export class ModerationError extends Error {
  readonly name = "ModerationError";
  readonly code = "moderation_refused";
  readonly status: number;
  readonly verdict: Verdict;

  constructor(verdict: Verdict, message: string, status = REFUSED_STATUS) {
    super(message);
    this.verdict = verdict;
    this.status = status;
  }

  /** The body to send. Categories are NOT included on purpose: a raw
   *  category list reads as an accusation and teaches evasion. */
  toJSON(): { detail: string; code: string } {
    return { detail: this.message, code: this.code };
  }
}

export const isModerationError = (err: unknown): err is ModerationError =>
  err instanceof ModerationError;

export interface GuardOptions extends ScreenOptions {
  /** What the author is told. A function receives the verdict. */
  message?: string | ((verdict: Verdict) => string);
  /** Status for the refusal. Default 422. */
  status?: number;
  /**
   * Also refuse "review" verdicts. Default false: publish-and-queue is the
   * right answer for ordinary content, and auto-refusing everything a
   * classifier finds interesting deletes real posts every day. Turn it on
   * for identity fields, where there is no "review it later" — the handle
   * is already on every row by then.
   */
  refuseOnReview?: boolean;
}

/**
 * Screen one piece of user content and act on the verdict. Returns the
 * verdict for anything publishable; throws `ModerationError` otherwise.
 *
 * ```ts
 * app.post("/comments", async (req, res) => {
 *   const verdict = await guard(engine, { text: req.body.body }, {
 *     context: { userId: req.user.id, surface: "comment" },
 *   });
 *   const comment = await db.comments.create(req.body);
 *   if (verdict.action === "review") await queue.open(comment.id, verdict);
 *   res.json(comment);
 * });
 * ```
 *
 * Note what is NOT folded in: opening the review case. That needs your
 * database and your idea of a case, and a library that guessed at either
 * would be wrong for everyone. `verdict.action === "review"` is the signal;
 * the queue is yours.
 */
export async function guard(
  engine: Moderato,
  input: ScreenInput,
  options: GuardOptions = {},
): Promise<Verdict> {
  const { message, status, refuseOnReview, ...screenOptions } = options;
  const verdict = await engine.screen(input, screenOptions);
  const refuse =
    verdict.action === BLOCK || (refuseOnReview === true && verdict.action === "review");
  if (!refuse) return verdict;
  const copy =
    typeof message === "function"
      ? message(verdict)
      : (message ?? DEFAULT_REFUSAL_MESSAGE);
  throw new ModerationError(verdict, copy, status);
}

// ── the screening endpoint ──

/** The request body `httpProvider` sends. */
export interface ModerationRequestBody {
  text?: string | null;
  images?: string[];
}

/**
 * The response. `flags`/`scores` are what `httpProvider` reads by default,
 * so a client engine re-decides locally — which is how a client can hold a
 * STRICTER policy than the server without a second endpoint. `action` and
 * friends are the server's own verdict, for callers that just want it.
 */
export interface ModerationResponseBody {
  action: Verdict["action"];
  categories: string[];
  score: number;
  flags: Record<string, boolean>;
  scores: Record<string, number>;
  detail?: string;
}

export interface HandlerOptions extends ScreenOptions {
  /** Reject bodies bigger than this. Default 8 MiB (~6 MiB of base64). */
  maxBytes?: number;
  /**
   * Called before screening. Return false to reject with 401 — this is
   * where you check the session, because an open screening endpoint is a
   * free classifier for the whole internet, billed to you.
   */
  authorize?: (request: Request) => boolean | Promise<boolean>;
  /** Extra response headers (CORS, cache-control). */
  headers?: Record<string, string>;
}

export const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

const json = (
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

/**
 * A Fetch-standard screening endpoint backed by `engine`.
 *
 * ```ts
 * // app/api/moderate/route.ts (Next.js)
 * const engine = createModerato({ provider: openAIProvider({ apiKey: process.env.OPENAI_API_KEY! }) });
 * export const POST = createModerationHandler(engine, {
 *   authorize: (req) => Boolean(req.headers.get("cookie")),
 * });
 * ```
 *
 * Point the browser at it with
 * `httpProvider({ url: "/api/moderate" })` and the vendor key never leaves
 * your server.
 */
export function createModerationHandler(
  engine: Moderato,
  options: HandlerOptions = {},
): (request: Request) => Promise<Response> {
  const { maxBytes = DEFAULT_MAX_BYTES, authorize, headers = {}, ...screenOptions } =
    options;

  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, {
        ...headers,
        allow: "POST",
      });
    }
    if (authorize && !(await authorize(request))) {
      return json({ error: "unauthorized" }, 401, headers);
    }

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > maxBytes) {
      return json({ error: "payload_too_large" }, 413, headers);
    }

    let body: ModerationRequestBody;
    try {
      const raw = await request.text();
      if (raw.length > maxBytes) {
        return json({ error: "payload_too_large" }, 413, headers);
      }
      body = raw ? (JSON.parse(raw) as ModerationRequestBody) : {};
    } catch {
      return json({ error: "invalid_json" }, 400, headers);
    }

    const images = Array.isArray(body.images)
      ? body.images
          .filter((uri): uri is string => typeof uri === "string")
          .map((dataUri) => ({ dataUri }))
      : [];
    const input: ScreenInput = {
      ...(typeof body.text === "string" ? { text: body.text } : {}),
      images,
    };

    const { verdict, result } = await engine.screenDetailed(input, screenOptions);
    const payload: ModerationResponseBody = {
      action: verdict.action,
      categories: verdict.categories,
      score: verdict.score,
      // Fall back to synthesising from the verdict when there was no raw
      // result (a failure, or nothing to screen): a client engine must
      // still see the same decision it would have made itself.
      flags: result?.flags ?? Object.fromEntries(verdict.categories.map((c) => [c, true])),
      scores:
        result?.scores ??
        Object.fromEntries(verdict.categories.map((c) => [c, verdict.score])),
      ...(verdict.detail ? { detail: verdict.detail } : {}),
    };
    return json(payload, 200, headers);
  };
}

// ── Node / Express bridge ──

/** The shape of a Node request we need, without depending on @types/node. */
interface NodeRequestLike {
  method?: string | undefined;
  url?: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  on(event: string, listener: (chunk?: unknown) => void): unknown;
}

interface NodeResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
}

/**
 * Wrap a Fetch handler for Express/Connect/`node:http`.
 *
 * ```ts
 * app.post("/api/moderate", toNodeHandler(createModerationHandler(engine)));
 * ```
 *
 * Reads the body off the stream itself, so it works with or without
 * `express.json()` mounted — and if a body parser already ran, the
 * pre-parsed `req.body` is used instead.
 */
export function toNodeHandler(
  handler: (request: Request) => Promise<Response>,
): (req: NodeRequestLike, res: NodeResponseLike) => Promise<void> {
  return async function nodeHandler(req, res): Promise<void> {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers.set(name, value);
      else if (Array.isArray(value)) headers.set(name, value.join(", "));
    }

    const parsed = (req as { body?: unknown }).body;
    const body =
      parsed !== undefined && parsed !== null
        ? typeof parsed === "string"
          ? parsed
          : JSON.stringify(parsed)
        : await readBody(req);
    // The URL is only ever used to satisfy the Request constructor; the
    // handler routes on nothing.
    const request = new Request(`http://moderato.local${req.url ?? "/"}`, {
      method: req.method ?? "POST",
      headers,
      ...(body ? { body } : {}),
    });

    const response = await handler(request);
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(await response.text());
  };
}

function readBody(req: NodeRequestLike): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = "";
    req.on("data", (chunk) => {
      out += String(chunk);
    });
    req.on("end", () => resolve(out));
    req.on("error", (err) => reject(err));
  });
}
