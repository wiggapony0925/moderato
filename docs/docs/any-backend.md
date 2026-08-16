---
id: any-backend
title: Flask, Django, Rails, Go…
sidebar_label: Any backend
---

# Using moderato with a backend that is not Node

Let me be straight about what this package is, because it changes the answer.

`moderato` is TypeScript. The **hooks** run in your users' browsers, which is
JavaScript no matter what your server is written in. The **server half**
(`moderato/server`) is Node. If your backend is Flask, Django, Rails, Laravel
or Go, that half does not run for you.

That is fine, and it does not mean you are stuck with half a library. What
`moderato/server` actually does is speak a very small HTTP contract — and a
contract is a thing any language can hold up its end of.

## The contract

Thirty lines in any language. Your endpoint receives this:

```json
POST /api/moderate
{
  "text": "the thing somebody typed",
  "images": ["data:image/jpeg;base64,…"]
}
```

and answers with this:

```json
{
  "flags":  { "hate": true },
  "scores": { "hate": 0.99, "harassment": 0.12 }
}
```

That is the whole thing. `flags` is what your classifier itself flagged;
`scores` is the confidence per category. The browser applies the policy to
those numbers locally, which is why nothing about the decision needs to be in
the response.

Point the browser at it and everything else works unchanged:

```ts
import { createModerato, httpProvider, wordlistProvider, PROFANITY_PRESET } from "moderato";

export const engine = createModerato({
  provider: [
    wordlistProvider(PROFANITY_PRESET),     // instant, offline, no backend at all
    httpProvider({ url: "/api/moderate" }), // your Flask app
  ],
});
```

The hooks, the policy, the presets, the PII detectors and the masking all run
in the browser and never touch your server.

## Flask

```python
import os
from flask import Flask, jsonify, request
from openai import OpenAI

app = Flask(__name__)
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])


@app.post("/api/moderate")
def moderate():
    if not session_is_valid(request):
        # An open screening endpoint is a free classifier for the whole
        # internet, billed to you.
        return jsonify(error="unauthorized"), 401

    body = request.get_json(silent=True) or {}
    parts = []
    if body.get("text"):
        parts.append({"type": "text", "text": body["text"]})
    for uri in body.get("images", []):
        parts.append({"type": "image_url", "image_url": {"url": uri}})
    if not parts:
        return jsonify(flags={}, scores={})

    result = client.moderations.create(
        model="omni-moderation-latest", input=parts
    ).results[0]

    return jsonify(
        flags={k: bool(v) for k, v in dict(result.categories).items()},
        scores={k: float(v or 0) for k, v in dict(result.category_scores).items()},
    )
```

One thing to watch, and it has bitten us: the OpenAI Python SDK gives you
*field* names (`self_harm_instructions`), not the documented category names
(`self-harm/instructions`). The client canonicalises punctuation away when it
compares, so both spellings work — but if you write your own policy on the
Python side, compare with the punctuation stripped or you will find that the
category you least wanted published is the one that never matched.

## FastAPI

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

class ScreenRequest(BaseModel):
    text: str | None = None
    images: list[str] = []

@app.post("/api/moderate")
async def moderate(payload: ScreenRequest, user=Depends(current_user)):
    parts = ([{"type": "text", "text": payload.text}] if payload.text else []) + [
        {"type": "image_url", "image_url": {"url": uri}} for uri in payload.images
    ]
    if not parts:
        return {"flags": {}, "scores": {}}
    result = (await client.moderations.create(
        model="omni-moderation-latest", input=parts
    )).results[0]
    return {
        "flags": {k: bool(v) for k, v in dict(result.categories).items()},
        "scores": {k: float(v or 0) for k, v in dict(result.category_scores).items()},
    }
```

## Anything else

Django, Rails, Laravel, Go, Elixir, PHP — the shape does not change. Read
`text` and `images`, call whatever classifier you use, return `flags` and
`scores`. If your classifier is not OpenAI, map its output:

```ts
// on the client, if your endpoint answers in its own shape
httpProvider({
  url: "/api/moderate",
  map: (payload) => ({
    flags: payload.labels,
    scores: payload.confidences,
  }),
});
```

## What you do not get without Node

Two things, and there are answers for both.

**`guard()`** — the one-line "screen this and throw a 422". You write the
equivalent in your own language; it is an `if` around your classifier call.
Keep two habits and you have the important part of it: put the call in **one
place** every write goes through, and keep every refusal message in **one
registry** rather than inventing wording per endpoint.

**The policy on the server.** `decide(result, policy)` is a pure function of
scores and thresholds, and porting it is about forty lines: refuse if any
tripped category is in your zero-tolerance set, refuse if any category is at or
above `blockScore`, queue if anything tripped at all, otherwise allow. The
[Policy](./policy.md) page is the specification; there is no hidden state to
reproduce.

If you want it in front of you, `app/social/moderation.py` in the loupe backend
is exactly this, in Python, in production.

## Is a Python package coming?

Honestly: not unless somebody commits to maintaining it. A second
implementation of the tokeniser and the policy is not hard to write and is very
easy to let drift, and two libraries that disagree about what "blocked" means
would be worse than one library and a documented contract.

The contract above is the supported answer. It is small on purpose.
