/**
 * useModeration — client-side preflight over a Moderato engine.
 *
 * Preflight is UX, not enforcement: it lets you tell someone their video
 * will bounce BEFORE they upload 40MB, or soften a "post" button while a
 * caption reads as harassment. The server still owns the real decision.
 */

import { useCallback, useRef, useState } from "react";
import type { Moderato } from "../engine.js";
import type { ScreenInput, Verdict } from "../types.js";

export interface UseModeration {
  /** Screen something. Resolves with the verdict it also puts in state. */
  check: (input: ScreenInput) => Promise<Verdict>;
  /** The latest verdict, or null before any check (or after reset). */
  verdict: Verdict | null;
  checking: boolean;
  reset: () => void;
}

export function useModeration(engine: Moderato): UseModeration {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [checking, setChecking] = useState(false);
  // Only the LATEST check may write state — checks are async and a slow
  // early result must not overwrite a fast late one.
  const seq = useRef(0);

  const check = useCallback(
    async (input: ScreenInput): Promise<Verdict> => {
      const call = ++seq.current;
      setChecking(true);
      const result = await engine.screen(input);
      if (seq.current === call) {
        setVerdict(result);
        setChecking(false);
      }
      return result;
    },
    [engine],
  );

  const reset = useCallback(() => {
    seq.current++;
    setVerdict(null);
    setChecking(false);
  }, []);

  return { check, verdict, checking, reset };
}
