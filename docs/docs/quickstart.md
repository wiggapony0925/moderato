---
id: quickstart
title: Quickstart
---

# Quickstart

Five minutes, three files. At the end you have a field that screens as you type
and a server that refuses the write.

## 1. Install

```bash
npm install moderato
```

Requires Node ≥ 18 (for `fetch` / `Request`). React ≥ 18 only if you use the
hooks.

## 2. The server engine

The vendor key lives here and only here.

```ts title="lib/moderation.ts"
import { createModerato, openAIProvider, POLICY_PRESETS } from "moderato";

export const engine = createModerato({
  provider: openAIProvider({ apiKey: process.env.OPENAI_API_KEY! }),
  policy: POLICY_PRESETS.balanced,
  timeoutMs: 6000,
  failMode: "review", // a vendor outage is not your outage
});
```

`openAIProvider` throws if you construct it in a browser — that would ship your
API key to every visitor.

## 3. Refuse the write

One call at the top of every handler that publishes something.

```ts title="app/api/comments/route.ts"
import { guard, isModerationError } from "moderato/server";
import { engine } from "@/lib/moderation";

export async function POST(request: Request) {
  const { body } = await request.json();

  try {
    const verdict = await guard(engine, { text: body }, {
      message: "That looks like it breaks the community rules. Try rewording it.",
      context: { userId: session.user.id, surface: "comment" },
    });

    const comment = await db.comment.create({ data: { body } });

    // "review" means published — put it in your queue, tell the author nothing.
    if (verdict.action === "review") await queue.open(comment.id, verdict);

    return Response.json(comment);
  } catch (err) {
    if (isModerationError(err)) {
      return Response.json(err.toJSON(), { status: err.status }); // 422
    }
    throw err;
  }
}
```

That is the whole enforcement story. Everything below is user experience.

## 4. Screen the endpoint, not the key

Give the browser its own engine pointed at *your* server, so it can screen
without ever holding a vendor credential.

```ts title="app/api/moderate/route.ts"
import { createModerationHandler } from "moderato/server";
import { engine } from "@/lib/moderation";

export const POST = createModerationHandler(engine, {
  authorize: (req) => Boolean(getSession(req)), // not a free classifier
});
```

```ts title="lib/client-moderation.ts"
import {
  createModerato,
  httpProvider,
  wordlistProvider,
  PROFANITY_PRESET,
} from "moderato";

export const engine = createModerato({
  provider: [
    wordlistProvider(PROFANITY_PRESET),     // instant, offline, free
    httpProvider({ url: "/api/moderate" }), // your server, your key
  ],
});
```

An array is a **chain**: the wordlist runs first and the request is never made
if it hits. Deliberate abuse costs you nothing.

## 5. Wrap the field

```tsx title="components/CommentBox.tsx"
import { useModeratedField } from "moderato/react";
import { engine } from "@/lib/client-moderation";

export function CommentBox({ onPublish }: { onPublish: (text: string) => void }) {
  const body = useModeratedField({ engine });

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        // Flushes the debounce — closes the "typed it and hit enter inside
        // the quiet window" hole.
        if (!(await body.check()).ok) return;
        onPublish(body.value);
      }}
    >
      <textarea {...body.inputProps} aria-label="Comment" />
      {body.blocked && (
        <p {...body.messageProps} className="error">
          {body.message}
        </p>
      )}
      <button disabled={body.blocked || body.checking}>Post</button>
    </form>
  );
}
```

## What you now have

- a field that tells someone instantly, offline, for free, when they have typed
  something obvious;
- a server that refuses the write whether or not the browser cooperated;
- one refusal message, owned by the backend, rendered identically everywhere;
- a `review` signal for the cases a human should see, and nothing in the queue
  that a machine could have decided.

## Next

- [Client or server?](./client-or-server.md) — why it is split like this
- [Policy](./policy.md) — moving the line, per surface
- [Rehearsal metrics](./rehearsal.mdx) — how well the defaults actually do
