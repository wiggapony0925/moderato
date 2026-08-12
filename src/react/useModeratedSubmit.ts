/**
 * useModeratedSubmit — one way to publish user content.
 *
 * **Why the policy is NOT here.** Screening belongs on the BACKEND, in one
 * chokepoint. Anything a client decides can be skipped by talking to the
 * API directly, so a client-side check is theatre — and a second copy of
 * the policy drifts from the real one the day either changes. The server
 * is the only thing that can actually refuse.
 *
 * **So what is this for?** Consistency of the RESPONSE. Every publish
 * surface — post, comment, bio, avatar — can come back refused, and
 * without this each screen invents its own handling: one shows a red
 * toast, one silently fails, one leaves a spinner running. This wraps any
 * publish call and gives all of them the same behaviour:
 *
 *   • refused (422)  → `refusal` holds the server's own explanation, the
 *                      draft is KEPT so nothing the user wrote is lost, and
 *                      `onBlocked` fires for surfaces that want a sheet;
 *   • published      → `onDone` fires; the caller clears its draft;
 *   • anything else  → `error`, the ordinary failure path.
 *
 * Queued-for-review is deliberately INVISIBLE to the author: the post is
 * live, and telling someone "this is under review" for content that
 * published fine would be both untrue and chilling.
 */

import { useCallback, useRef, useState } from "react";
import { refusalFrom, type RefusalOptions } from "../refusal.js";

/**
 * Anything that publishes. Either a TanStack-style mutation (structurally
 * typed — no dependency on @tanstack/react-query) or a plain async
 * function.
 *
 * The callback parameters are deliberately `any`: TanStack's MutateOptions
 * types its callbacks with the mutation's own generics, and anything
 * narrower here would fail assignability against every one of them.
 */
export interface MutationCallbacks {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSuccess?: (...args: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onError?: (error: any, ...rest: any[]) => void;
}

export interface MutationLike<TVars> {
  mutate(vars: TVars, callbacks?: MutationCallbacks): void;
  isPending: boolean;
}

export type SubmitTarget<TVars> =
  | MutationLike<TVars>
  | ((vars: TVars) => Promise<unknown>);

export interface ModeratedSubmitOptions extends RefusalOptions {
  /** Fired when the server refuses, with its explanation. */
  onBlocked?: (reason: string) => void;
  /** Fired when it publishes. */
  onDone?: () => void;
}

export interface ModeratedSubmit<TVars> {
  submit: (vars: TVars) => void;
  /** The server's explanation while a refusal is on screen; null otherwise. */
  refusal: string | null;
  /** Clear the refusal — call it when the user edits their draft. */
  dismiss: () => void;
  pending: boolean;
  /** A non-moderation failure (network, auth, …). */
  error: Error | null;
}

const isMutation = <TVars>(
  target: SubmitTarget<TVars>,
): target is MutationLike<TVars> => typeof target !== "function";

/**
 * Wrap any publish mutation or async call.
 *
 * ```ts
 * const create = useCreatePost();
 * const { submit, refusal, dismiss, pending } = useModeratedSubmit(create, {
 *   onDone: () => closeComposer(),
 * });
 * ```
 */
export function useModeratedSubmit<TVars>(
  target: SubmitTarget<TVars>,
  options: ModeratedSubmitOptions = {},
): ModeratedSubmit<TVars> {
  const [refusal, setRefusal] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [fnPending, setFnPending] = useState(false);
  const { onBlocked, onDone, status, fallback } = options;
  // Serial guard for the async-function form: only the latest call's
  // outcome may touch state.
  const seq = useRef(0);

  const settle = useCallback(
    (err: Error | null) => {
      if (err === null) {
        onDone?.();
        return;
      }
      const reason = refusalFrom(err, { status, fallback });
      if (reason) {
        // The draft is intentionally left alone — a refusal that also
        // wipes what someone wrote is punitive, and most refusals are
        // one word away from fine.
        setRefusal(reason);
        onBlocked?.(reason);
        return;
      }
      setError(err);
    },
    [onBlocked, onDone, status, fallback],
  );

  const submit = useCallback(
    (vars: TVars) => {
      setRefusal(null);
      setError(null);
      if (isMutation(target)) {
        target.mutate(vars, {
          onSuccess: () => settle(null),
          onError: (err: unknown) =>
            settle(err instanceof Error ? err : new Error(String(err))),
        });
        return;
      }
      const call = ++seq.current;
      setFnPending(true);
      target(vars).then(
        () => {
          if (seq.current !== call) return;
          setFnPending(false);
          settle(null);
        },
        (err: unknown) => {
          if (seq.current !== call) return;
          setFnPending(false);
          settle(err instanceof Error ? err : new Error(String(err)));
        },
      );
    },
    [target, settle],
  );

  return {
    submit,
    refusal,
    dismiss: useCallback(() => setRefusal(null), []),
    pending: isMutation(target) ? target.isPending : fnPending,
    error,
  };
}
