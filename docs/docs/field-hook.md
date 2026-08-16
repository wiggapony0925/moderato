---
id: field-hook
title: useModeratedField
---

# `useModeratedField`

Wrap any input whose value other people will read: a comment box, a username, a
display name, a list or team title, a bio, a product description, a support
ticket.

```tsx
import { useModeratedField } from "moderato/react";
```

## It renders nothing

No dialog, no styling, no copy beyond one default sentence you will replace. It
returns state; you build the UI. That is deliberate — moderation UI and
moderation wording are product decisions, and a component that made them for you
would be the first thing you deleted.

```tsx
import { useModeratedField } from "moderato/react";
import { POLICY_PRESETS } from "moderato";

function UsernameField() {
  const name = useModeratedField({
    engine,
    policy: POLICY_PRESETS.identity,
    onBlocked: () => track("username_refused"),
  });

  return (
    <>
      <input {...name.inputProps} aria-label="Username" />
      {name.checking && <Spinner />}
      {name.blocked && (
        <MyOwnPopup onDismiss={name.dismiss}>{name.message}</MyOwnPopup>
      )}
      <button
        disabled={name.blocked}
        onClick={async () => {
          if (!(await name.check()).ok) return;
          await api.setUsername(name.value); // the server screens again
        }}
      >
        Save
      </button>
    </>
  );
}
```

Try it on the [playground](./playground.mdx) before you wire it up.

## What you get back

| | |
| --- | --- |
| `inputProps` | spread onto `<input>` / `<textarea>` — value, handlers, `aria-invalid`, `aria-describedby` |
| `nativeProps` | the same for React Native `<TextInput>` (`value`, `onChangeText`, `onBlur`) |
| `messageProps` | put on the element rendering `message`, so screen readers announce it |
| `value` / `setValue` | the current text |
| `blocked` | the current value should not be published |
| `message` | author-facing copy while blocked, else `null` |
| `verdict` | the full decision — `action`, `categories`, `score`, `rule` |
| `checking` | a screen is in flight |
| `check()` | screen **now**, skipping the debounce → `{ ok, verdict }` |
| `dismiss()` | hide the message without changing the value |
| `reset()` | back to empty and unscreened |

## Options

| option | default | what it does |
| --- | --- | --- |
| `engine` | — | required; the same engine for every field is fine |
| `policy` | engine's | per-field policy — see [Policy](./policy.md) |
| `debounceMs` | `400` | quiet time after typing before screening runs |
| `minLength` | `2` | below this, nothing is screened |
| `screenOn` | `"change"` | or `"blur"`, to only screen when focus leaves |
| `blockOn` | `["block"]` | which verdicts count as "do not publish" |
| `message` | a default sentence | a string, or `(verdict) => string` |
| `onBlocked` / `onCleared` | — | fire on the *transitions*, not every render |
| `value` / `onChange` | — | controlled mode |
| `context` | — | passed to the engine's `sink` — put your user id here |

## Always call `check()` before you submit

```tsx
if (!(await name.check()).ok) return;
```

Without it there is a real hole: someone types a slur and presses Enter inside
the debounce window, so no screen ever ran and `blocked` is still `false`. The
server would still refuse — but the point of this hook is that the user finds
out before the round trip, and `check()` is what makes that true.

`check()` cancels any pending debounce, screens the current value, updates the
same state your UI is already reading, and resolves with `{ ok, verdict }`.

## Repeated text is memoised

A field that re-screens on every pause in typing would otherwise bill you for
the same sentence a dozen times as somebody deletes a word and puts it back. The
engine memoises text-only screenings, keyed on the policy — because the same
words are a block on a username and an allow in a comment.

Turn it off with `cache: false` on the engine; clear it with `engine.clearCache()`.

## Latest-wins, always

Screens are asynchronous. A slow early one must never land on top of a fast late
one, or the field shows a refusal for text the user already fixed. The hook
sequences every screen and drops stale results. You do not need to think about
it; it is tested.

## React Native

`moderato/react` imports no DOM. Use `nativeProps`:

```tsx
<TextInput {...name.nativeProps} placeholder="Username" />
{name.blocked && <Text style={styles.error}>{name.message}</Text>}
```

`moderato/web` (the upload picker) is browser-only and must not be imported in
a React Native bundle.
