---
id: submit-hook
title: useModeratedSubmit
---

# `useModeratedSubmit`

One way to publish user content, so every surface handles a refusal the same.

```tsx
import { useModeratedSubmit } from "moderato/react";

const { submit, refusal, dismiss, pending, error } = useModeratedSubmit(
  createPost,                        // a TanStack mutation or a plain async fn
  { onDone: () => closeComposer() },
);
```

## The problem it solves

Every publish surface can come back refused. Without something shared, each
screen invents its own handling: one shows a red toast, one fails silently, one
leaves a spinner running forever, and one wipes the draft. The last is the worst
— most refusals are one word away from fine, and deleting what somebody wrote is
punitive.

## The contract

| outcome | what happens |
| --- | --- |
| **refused** (HTTP 422) | `refusal` holds *the server's own words*, the draft is kept, `onBlocked` fires |
| **published** | `onDone` fires; the caller clears its own draft |
| **anything else** | `error` — the ordinary failure path, untouched |
| **queued for review** | nothing. The author is told nothing, because the post is live |

That last row is a deliberate product position. Telling someone "this is under
review" about content that published fine is untrue, and it chills exactly the
people least likely to have done anything wrong.

## Targets

It takes either shape, structurally typed — there is no dependency on
`@tanstack/react-query`:

```ts
// a mutation
{ mutate(vars, { onSuccess, onError }): void; isPending: boolean }

// or just a function
(vars) => Promise<unknown>
```

## Clear the refusal as they type

Editing *is* the answer to a refusal, so let the notice go:

```tsx
<textarea
  value={body}
  onChange={(e) => {
    setBody(e.target.value);
    if (refusal) dismiss();
  }}
/>
{refusal && <Notice>{refusal}</Notice>}
```

## The refusal contract itself

`refusalFrom(err, options?)` is the primitive underneath, exported from both
`moderato` and `moderato/react`:

```ts
const reason = refusalFrom(err);        // string, or null for every other error
refusalFrom(err, { status: 451 });      // if your API refuses with something else
refusalFrom(err, { fallback: "Nope." }); // if the server sent no usable message
```

The stable part of the contract is the **status**, not the text. 422 by default,
matching what `guard()` throws — so the two halves agree without either being
configured.
