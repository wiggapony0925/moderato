---
id: uploads
title: Pickers and uploads
---

# Pickers and uploads

```tsx
import { ModeratedUpload } from "moderato/web";
```

Browser only — it renders a hidden `<input type="file">`. React Native has no
DOM; use `moderato/react` and your platform's own picker.

```tsx
<ModeratedUpload
  accept="image/*,video/mp4"
  multiple
  remaining={4 - images.length}
  engine={engine}                                 // omit for no preflight
  onAccept={(files) => setImages([...images, ...files])}
  onReject={(files, verdict) => showSheet(verdict)}
>
  {({ open, screening }) => (
    <button onClick={open} disabled={screening}>Add photos</button>
  )}
</ModeratedUpload>
```

## Why preflight matters more here than for text

A refused caption costs a round trip. A refused upload costs a round trip *plus*
the forty megabytes the user already waited to send, usually on a phone, usually
on cellular. Screening the file before the upload starts is the difference
between a moment of friction and a genuinely bad experience.

Pass `engine` to opt in. Leave it off and the picker is a plain picker — the
server-authoritative mode, where the client wraps UX around the server's
refusals and does no screening of its own.

## Behaviour worth knowing

**Over-selection is capped, not refused.** Pick six files with `remaining={4}`
and you get the first four. Dropping someone's entire selection over an
off-by-one is hostile.

**`accept` is re-checked in code.** Browsers filter the dialog, but the dialog
can be talked past on some platforms, and a drag-and-drop caller never had one.

**Videos are sampled to frames.** Multi-modal endpoints take images, not video,
so a clip is screened by sampling stills across its duration — six by default,
longest edge 512px. That catches a video whose whole point is the problem. It
will not catch four bad seconds in the middle of ten minutes; see
[Limits](./limits.md).

```ts
createModerato({ provider, video: { frames: 10, maxDimension: 640 } });
```

**Picking the same file twice works.** The input is reset on every change, which
is the fix for the classic "no event the second time" bug.

## Media helpers

Exported from `moderato` if you are rolling your own picker:

| | |
| --- | --- |
| `toImagePart(source)` | `Blob` / `{dataUri}` / `{bytes, contentType}` → a data URI |
| `bytesToDataUri(bytes, type)` | the encoding step alone, chunked so large arrays do not blow up `btoa` |
| `downscaleImage(blob, max?)` | browser-only; returns the original on any failure, because a smaller payload is an optimisation and screening must not fail because resizing did |
| `sampleFrames(video, config?, env?)` | video → frames; `env` is injectable for tests |
| `frameTimestamps(duration, n)` | evenly spread, avoiding the black first and last instants |

`sampleFrames` throws `VideoUnsupportedError` where there is no decoder — jsdom,
a server, a browser without the codec — rather than waiting forever on events
that will never fire.
