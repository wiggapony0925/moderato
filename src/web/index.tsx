/**
 * moderato/web — DOM wrappers.
 *
 * RECONSTRUCTED. The original `src/web` was lost with the machine that held
 * the package's git history; it survives in no ref of loupe-web or
 * loupe-frontend, because `npm run sync:moderato` deliberately strips it
 * (`rm -rf vendor/moderato/src/web`) — the vendored copy exists for Metro,
 * and React Native has no DOM. This file is rebuilt from its call sites in
 * loupe-web and from the conventions the rest of the package sets. The
 * public shape (`ModeratedUpload`, render-prop `open`) is pinned by those
 * call sites; the internals are new.
 *
 * The picker is deliberately *not* a screener by default. Per the note in
 * types.ts, a Moderato with no provider allows everything: that is the
 * server-authoritative mode, where the client wraps UX around the server's
 * refusals and does no screening of its own. Pass `engine` only when you
 * want preflight — telling someone their 40MB video will bounce before
 * they wait for the upload. The server still owns the real decision.
 */

import { useCallback, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import type { Moderato } from "../engine.js";
import type { Verdict } from "../types.js";
import { blocked } from "../types.js";

/** What the render prop is handed. */
export interface ModeratedUploadApi {
  /** Open the file picker. No-op when there is no room left. */
  open: () => void;
  /** A preflight screen is in flight (always false without `engine`). */
  screening: boolean;
  /** The most recent preflight verdict, or null. */
  verdict: Verdict | null;
}

export interface ModeratedUploadProps {
  /** Passed straight to the input, and re-checked on the way out. */
  accept?: string;
  multiple?: boolean;
  /**
   * How many more files the caller can take. Selecting more than this
   * keeps the first `remaining` rather than refusing the whole batch —
   * dropping someone's entire selection over an off-by-one is hostile.
   */
  remaining?: number;
  /** Opt in to client-side preflight. Omit for server-authoritative. */
  engine?: Moderato;
  /** The files that survived. Never called with an empty list. */
  onAccept: (files: File[]) => void;
  /** Preflight said block. Only ever called when `engine` is set. */
  onReject?: (files: File[], verdict: Verdict) => void;
  children: (api: ModeratedUploadApi) => ReactNode;
}

/**
 * Does `file` satisfy an accept list ("image/jpeg,image/png", ".webp",
 * "image/*")? Browsers already filter the dialog, but the dialog can be
 * talked past on some platforms, and a drag-and-drop caller never had one.
 */
function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return accept
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => {
      if (entry === "*/*") return true;
      if (entry.startsWith(".")) return name.endsWith(entry);
      if (entry.endsWith("/*")) return type.startsWith(entry.slice(0, -1));
      return type === entry;
    });
}

export function ModeratedUpload({
  accept,
  multiple = false,
  remaining,
  engine,
  onAccept,
  onReject,
  children,
}: ModeratedUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [screening, setScreening] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  // Only the LATEST selection may write state or call back — the same
  // reasoning as useModeration: a slow early screen must not land after a
  // fast late one.
  const seq = useRef(0);

  const full = remaining !== undefined && remaining <= 0;

  const open = useCallback(() => {
    if (full) return;
    inputRef.current?.click();
  }, [full]);

  const handleChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const picked = Array.from(input.files ?? []);
      // Reset immediately: without this, picking the same file twice in a
      // row fires no change event the second time.
      input.value = "";
      if (picked.length === 0) return;

      const allowed = picked.filter((file) => matchesAccept(file, accept));
      const capped =
        remaining === undefined ? allowed : allowed.slice(0, Math.max(0, remaining));
      if (capped.length === 0) return;

      if (!engine) {
        onAccept(capped);
        return;
      }

      const call = ++seq.current;
      setScreening(true);
      // Videos are sampled to frames by the engine; images go as-is.
      const images = capped.filter((file) => !file.type.startsWith("video/"));
      const videos = capped.filter((file) => file.type.startsWith("video/"));
      try {
        const result = await engine.screen({ images, videos });
        if (seq.current !== call) return;
        setVerdict(result);
        if (blocked(result)) {
          onReject?.(capped, result);
          return;
        }
        onAccept(capped);
      } finally {
        if (seq.current === call) setScreening(false);
      }
    },
    [accept, engine, onAccept, onReject, remaining],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: "none" }}
        onChange={handleChange}
      />
      {children({ open, screening, verdict })}
    </>
  );
}
