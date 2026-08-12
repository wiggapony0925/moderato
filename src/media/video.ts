/**
 * Video → frames. Multi-modal moderation endpoints take images, not video,
 * so a video is screened by sampling stills spread across its duration and
 * screening those. A handful of frames catches the overwhelming case (the
 * whole clip is the problem) without shipping megabytes to the classifier.
 *
 * Browser only: decoding video needs a real `<video>` element. The
 * primitives are injectable so tests (and exotic hosts) can supply their
 * own — jsdom has no media pipeline at all.
 */

import type { ImagePart, VideoConfig } from "../types.js";

export interface FrameEnv {
  createVideo(): HTMLVideoElement;
  createCanvas(): HTMLCanvasElement;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export const DEFAULT_FRAMES = 6;
export const DEFAULT_FRAME_DIMENSION = 512;

/** Thrown when there is no way to decode video where we're running. */
export class VideoUnsupportedError extends Error {
  constructor() {
    super(
      "moderato: video decoding isn't available here (a real browser " +
        "<video> element is needed). Sample frames yourself and pass them " +
        "as images.",
    );
    this.name = "VideoUnsupportedError";
  }
}

function defaultEnv(): FrameEnv {
  if (typeof document === "undefined" || typeof URL?.createObjectURL !== "function") {
    throw new VideoUnsupportedError();
  }
  return {
    createVideo: () => document.createElement("video"),
    createCanvas: () => document.createElement("canvas"),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
  };
}

/** Evenly spread timestamps, avoiding the black first and last instants. */
export function frameTimestamps(duration: number, frames: number): number[] {
  const n = Math.max(1, frames);
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  return Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * duration);
}

/** Sample `frames` stills from a video blob as JPEG data URIs. */
export async function sampleFrames(
  video: Blob,
  config: VideoConfig = {},
  env: FrameEnv = defaultEnv(),
): Promise<ImagePart[]> {
  const frames = config.frames ?? DEFAULT_FRAMES;
  const maxDimension = config.maxDimension ?? DEFAULT_FRAME_DIMENSION;

  const el = env.createVideo();
  // An element that exists but cannot decode (jsdom's <video>, a browser
  // without this codec) reports "" from canPlayType — asking it to load
  // anyway would wait forever on events that never fire.
  if (
    typeof el.canPlayType === "function" &&
    el.canPlayType(video.type || "video/mp4") === ""
  ) {
    throw new VideoUnsupportedError();
  }
  el.muted = true;
  el.playsInline = true;
  el.preload = "auto";
  const url = env.createObjectURL(video);

  try {
    await once(el, "loadedmetadata", () => {
      el.src = url;
      el.load();
    });

    const canvas = env.createCanvas();
    const scale = Math.min(
      1,
      maxDimension / Math.max(el.videoWidth || 1, el.videoHeight || 1),
    );
    canvas.width = Math.max(1, Math.round((el.videoWidth || 1) * scale));
    canvas.height = Math.max(1, Math.round((el.videoHeight || 1) * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new VideoUnsupportedError();

    const parts: ImagePart[] = [];
    for (const t of frameTimestamps(el.duration, frames)) {
      await once(el, "seeked", () => {
        el.currentTime = t;
      });
      ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
      parts.push({ dataUri: canvas.toDataURL("image/jpeg", 0.7) });
    }
    return parts;
  } finally {
    env.revokeObjectURL(url);
  }
}

function once(
  target: EventTarget,
  event: string,
  kick: () => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error(`moderato: video "${event}" failed — undecodable file?`));
    };
    const cleanup = () => {
      target.removeEventListener(event, ok);
      target.removeEventListener("error", fail);
    };
    target.addEventListener(event, ok, { once: true });
    target.addEventListener("error", fail, { once: true });
    kick();
  });
}
