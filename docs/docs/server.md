---
id: server
title: The server half
---

# The server half

```ts
import {
  guard,
  ModerationError,
  isModerationError,
  createModerationHandler,
  toNodeHandler,
} from "moderato/server";
```

No framework imports. `Request` in, `Response` out — which is what Next route
handlers, Hono, Bun, Deno and Cloudflare Workers speak natively, and
`toNodeHandler` bridges the ones that do not.

## `guard()` — the chokepoint

Call it at the top of every handler that publishes something.

```ts
const verdict = await guard(engine, { text: body, images }, {
  message: RULES.comment,
  context: { userId, surface: "comment" },
});
```

Returns the verdict for anything publishable. Throws `ModerationError` on a
block.

```ts
class ModerationError extends Error {
  readonly code = "moderation_refused";
  readonly status: number;   // 422 by default
  readonly verdict: Verdict;
  toJSON(): { detail: string; code: string };
}
```

`toJSON()` deliberately omits the category list. A raw list of what tripped
reads as an accusation and teaches evasion — the author needs to know they broke
a rule, not which classifier feature to route around next time.

### Options

| option | default | |
| --- | --- | --- |
| `message` | a generic sentence | string or `(verdict) => string` |
| `status` | `422` | matches `refusalFrom` on the client |
| `refuseOnReview` | `false` | also refuse `review` verdicts — for identity fields |
| `policy` | engine's | per-surface policy |
| `context` | — | forwarded to the sink |
| `signal` | — | caller cancellation |

### What is deliberately not in it

Opening the review case. That needs your database and your idea of a case, and a
library that guessed at either would be wrong for everyone.
`verdict.action === "review"` is the signal; the queue is yours.

```ts
const verdict = await guard(engine, { text });
const post = await db.post.create({ data: { text } });
if (verdict.action === "review") {
  await db.moderationCase.create({
    data: { postId: post.id, categories: verdict.categories, score: verdict.score },
  });
}
```

## `createModerationHandler()` — the screening endpoint

Lets the browser screen through you, so the vendor key never leaves the server.

```ts title="app/api/moderate/route.ts"
export const POST = createModerationHandler(engine, {
  authorize: (req) => Boolean(getSession(req)),
  maxBytes: 8 * 1024 * 1024,
  headers: { "access-control-allow-origin": "https://app.example.com" },
});
```

**Set `authorize`.** An open screening endpoint is a free classifier for the
whole internet, billed to you.

The response carries both the server's verdict *and* the raw `flags` / `scores`,
so a client engine re-decides locally — which is how a client can hold a
**stricter** policy than the server without a second endpoint.

```json
{
  "action": "block",
  "categories": ["hate"],
  "score": 0.99,
  "flags": { "hate": true },
  "scores": { "hate": 0.99 },
  "detail": "Blocked: hate"
}
```

| status | when |
| --- | --- |
| `200` | screened — read `action`, or let `httpProvider` read `flags`/`scores` |
| `400` | body was not JSON |
| `401` | `authorize` returned false |
| `405` | not a POST |
| `413` | body over `maxBytes` |

## Express, Connect, `node:http`

```ts
app.post("/api/moderate", toNodeHandler(createModerationHandler(engine)));
```

Reads the body off the stream itself, so it works with or without
`express.json()` mounted — and uses a pre-parsed `req.body` when a parser
already ran.

## Failure behaviour

`screen()` never throws. What you get instead:

| situation | verdict | `rule` |
| --- | --- | --- |
| no provider configured | `allow` | `not-screened` |
| nothing to screen | `allow` | `not-screened` |
| provider threw or timed out | `failMode` (default `review`) | `failed` |
| every provider in a chain dead | `failMode` | `failed` |

Two things follow from this. An `allow` with `screened: false` is **not** a pass
— it says nothing ran, and your code should be able to tell the difference. And
a `review` from an outage deserves different handling from a `review` from a
real flag; `verdict.rule` is how you tell.

Failing to `review` rather than `block` is the default because a third party's
downtime should not become your downtime. If your compliance posture says
otherwise, set `failMode: "block"`.
