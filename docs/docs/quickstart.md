---
id: quickstart
title: Quickstart
---

# Quickstart

Five minutes, three files. By the end you will have a field that warns people
as they type, and a server that actually refuses the bad ones.

:::tip Want the short version first?
[`defineModeration`](./configuring.md) does all of the wiring below from one
config object written in product terms — what you allow, what you refuse, which
surfaces you have. Come back here when you want to know what it built.
:::

## 1. Install

```bash
npm install moderato
```

Requires Node ≥ 18 (for `fetch` / `Request`). React ≥ 18 only if you use the
hooks.

## 2. Set up the engine on your server

This is where your API key lives, and the only place it should ever be.

```ts title="lib/moderation.ts"
import { createModerato, openAIProvider, POLICY_PRESETS } from "moderato";

export const engine = createModerato({
  provider: openAIProvider({ apiKey: process.env.OPENAI_API_KEY! }),
  policy: POLICY_PRESETS.balanced,
  timeoutMs: 6000,
  failMode: "review", // a vendor outage is not your outage
});
```

If you try to construct `openAIProvider` in a browser it throws on purpose.
Bundling an API key into your frontend hands it to every visitor, and it is an
easy mistake to make by accident.

## 3. Refuse the bad writes

One call at the top of every handler that publishes something. This is the part
that matters — everything after it is user experience.

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

A few things to notice. `guard()` throws only when the policy says *block*; a
`review` verdict comes back normally, because that content is meant to publish.
And opening the case is your code, not ours — it needs your database and your
idea of what a case is.

## 4. Let the browser screen through you

Now for the nice half. Give the browser its own engine, pointed at an endpoint
on your own server, so it can screen text without ever holding a credential.

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

Passing an array makes a **chain**. The wordlist runs first, and if it finds
something the request is never made at all — so the obvious abuse costs you
nothing, and everything ambiguous still gets a real opinion.

## 5. Wrap the input

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

The `check()` call before submitting matters more than it looks. Screening is
debounced, so somebody who types something and immediately hits enter can beat
it. `check()` cancels the wait and screens what is on screen right now.

## What you have now

- an input that tells people instantly — offline, for free — when they have
  typed something obviously against the rules;
- a server that refuses those writes whether or not the browser cooperated;
- one refusal message, owned by your backend, that reads the same everywhere;
- a `review` signal for the cases a person should look at, and nothing in that
  queue that a machine could have decided on its own.

## Next

- [Client or server?](./client-or-server.md) — why it is split like this
- [Policy](./policy.md) — moving the line, per surface
- [Rehearsal metrics](./rehearsal.mdx) — how well the defaults actually do
