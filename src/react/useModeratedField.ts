/**
 * useModeratedField — wrap any input whose value other people will read.
 *
 * A comment box, a username, a display name, a list or team title, a
 * bio, a listing description. Anything where what one person types shows up
 * next to everyone else's content.
 *
 * **What it does.** Screens the value as it is typed (debounced), and hands
 * you back plain state: `blocked`, `message`, `verdict`, `checking`. It
 * renders NOTHING and imports no UI — you own the popup, the sheet, the
 * red underline, the shake animation. That is deliberate: moderation copy
 * and moderation UI are product decisions, and a component that made them
 * for you would be the first thing you'd rip out.
 *
 * ```tsx
 * const name = useModeratedField({
 *   engine,
 *   policy: POLICY_PRESETS.identity,   // handles are permanent and public
 *   onBlocked: () => setShowMyOwnDialog(true),
 * });
 *
 * <input {...name.inputProps} aria-label="Username" />
 * {name.blocked && <MyDialog text={name.message} onEdit={name.dismiss} />}
 *
 * async function save() {
 *   if (!(await name.check()).ok) return;   // flushes the debounce
 *   await api.setUsername(name.value);      // the server screens again
 * }
 * ```
 *
 * **What it is not.** It is not enforcement. Anything a client decides can
 * be skipped by talking to your API directly, so this hook is UX: it tells
 * someone their username will bounce before they fill in the rest of the
 * form, and it stops the honest mistake at the keyboard. The write still
 * has to be screened on the server — see `moderato/server`.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { Moderato, ScreenOptions } from "../engine.js";
import { DEFAULT_REFUSAL_MESSAGE } from "../policy.js";
import type { Action, PolicyConfig, Verdict } from "../types.js";
import { BLOCK } from "../types.js";

export const DEFAULT_DEBOUNCE_MS = 400;
/** Below this, there is nothing to judge and every keystroke is a call. */
export const DEFAULT_MIN_LENGTH = 2;

export interface UseModeratedFieldOptions {
  /** The screening engine. Same one for every field is fine. */
  engine: Moderato;
  /** Controlled mode: pass both, and the hook stops owning the value. */
  value?: string;
  onChange?: (next: string) => void;
  /** Uncontrolled mode: the starting value. */
  initialValue?: string;
  /** Policy for THIS field. See `POLICY_PRESETS`. */
  policy?: PolicyConfig;
  /** Quiet time after typing before screening runs. */
  debounceMs?: number;
  /** Don't screen anything shorter than this. */
  minLength?: number;
  /** Screen while typing, or only when the field loses focus. */
  screenOn?: "change" | "blur";
  /** Which verdicts count as "do not let this be published". */
  blockOn?: Action[];
  /** The author-facing copy. A function gets the verdict. */
  message?: string | ((verdict: Verdict) => string);
  /** Fires on the transition into blocked — hook your dialog here. */
  onBlocked?: (verdict: Verdict) => void;
  /** Fires on the transition out of blocked. */
  onCleared?: () => void;
  /** Passed to the engine's sink. Put the user id here. */
  context?: unknown;
}

/** What `check()` resolves with: the verdict, plus the one bit you asked for. */
export interface FieldCheck {
  ok: boolean;
  verdict: Verdict;
}

export interface ModeratedField {
  value: string;
  setValue: (next: string) => void;
  /** Spread onto a DOM `<input>` or `<textarea>`. */
  inputProps: {
    value: string;
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    onBlur: () => void;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  };
  /** Spread onto a React Native `<TextInput>`. */
  nativeProps: {
    value: string;
    onChangeText: (next: string) => void;
    onBlur: () => void;
  };
  /** Put on the element that renders `message`, so screen readers say it. */
  messageProps: { id: string; role: "alert" };
  /** The latest verdict, or null before anything was screened. */
  verdict: Verdict | null;
  /** A screen is in flight. */
  checking: boolean;
  /** The current value should not be published. */
  blocked: boolean;
  /** Author-facing copy while blocked; null otherwise. */
  message: string | null;
  /**
   * Screen the current value NOW, skipping the debounce. Call it in your
   * submit handler and await it — that closes the window where someone
   * types a slur and hits enter inside the debounce interval.
   */
  check: () => Promise<FieldCheck>;
  /** Hide the message without changing the value (e.g. dialog dismissed). */
  dismiss: () => void;
  /** Back to empty and unscreened. */
  reset: () => void;
}

const copyFor = (
  verdict: Verdict,
  message: UseModeratedFieldOptions["message"],
): string => {
  if (typeof message === "function") return message(verdict);
  return message ?? DEFAULT_REFUSAL_MESSAGE;
};

export function useModeratedField(
  options: UseModeratedFieldOptions,
): ModeratedField {
  const {
    engine,
    value: controlled,
    onChange,
    initialValue = "",
    policy,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    minLength = DEFAULT_MIN_LENGTH,
    screenOn = "change",
    blockOn,
    message,
    onBlocked,
    onCleared,
    context,
  } = options;

  const [own, setOwn] = useState(initialValue);
  const isControlled = controlled !== undefined;
  const value = isControlled ? controlled : own;

  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const blocking = useMemo(() => new Set<Action>(blockOn ?? [BLOCK]), [blockOn]);

  // Latest-wins. Screens are async and a slow early one must never land on
  // top of a fast late one — that is how a field ends up showing a refusal
  // for text the user already fixed.
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef(true);
  // The value as of this render, readable from a stale closure — `check()`
  // has to screen what is on screen NOW, not what it captured.
  const latest = useRef(value);
  latest.current = value;

  // Callbacks in a ref so the debounce effect doesn't re-arm (and re-delay
  // the screen) every time a parent re-renders with new inline lambdas.
  const handlers = useRef({ onBlocked, onCleared });
  handlers.current = { onBlocked, onCleared };

  useEffect(
    () => () => {
      live.current = false;
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const wasBlocked = useRef(false);
  const settle = useCallback(
    (next: Verdict | null) => {
      setVerdict(next);
      const nowBlocked = next !== null && blocking.has(next.action);
      if (nowBlocked && !wasBlocked.current) handlers.current.onBlocked?.(next);
      if (!nowBlocked && wasBlocked.current) handlers.current.onCleared?.();
      wasBlocked.current = nowBlocked;
    },
    [blocking],
  );

  const screenOptions = useMemo<ScreenOptions>(
    () => ({
      ...(policy ? { policy } : {}),
      ...(context !== undefined ? { context } : {}),
    }),
    [policy, context],
  );

  /** Screen `text` immediately. Returns the verdict it also puts in state. */
  const run = useCallback(
    async (text: string): Promise<Verdict> => {
      const call = ++seq.current;
      const trimmed = text.trim();
      if (trimmed.length < minLength) {
        if (live.current) {
          setChecking(false);
          settle(null);
        }
        return {
          action: "allow",
          categories: [],
          score: 0,
          rule: "not-screened",
          screened: false,
        };
      }
      setChecking(true);
      const result = await engine.screenText(trimmed, screenOptions);
      if (!live.current || seq.current !== call) return result;
      setChecking(false);
      setDismissed(false);
      settle(result);
      return result;
    },
    [engine, minLength, screenOptions, settle],
  );

  const schedule = useCallback(
    (text: string) => {
      if (timer.current) clearTimeout(timer.current);
      // An empty-again field clears instantly: making someone stare at a
      // refusal for text they already deleted is just rude.
      if (text.trim().length < minLength) {
        seq.current++;
        setChecking(false);
        settle(null);
        return;
      }
      timer.current = setTimeout(() => {
        void run(text);
      }, debounceMs);
    },
    [debounceMs, minLength, run, settle],
  );

  const setValue = useCallback(
    (next: string) => {
      latest.current = next;
      if (isControlled) onChange?.(next);
      else setOwn(next);
      // Typing IS the answer to a refusal — let the message go as they fix it.
      setDismissed(false);
      if (screenOn === "change") schedule(next);
      else if (verdict) settle(null);
    },
    [isControlled, onChange, schedule, screenOn, settle, verdict],
  );

  const onBlur = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    void run(latest.current);
  }, [run]);

  const check = useCallback(async (): Promise<FieldCheck> => {
    if (timer.current) clearTimeout(timer.current);
    const result = await run(latest.current);
    return { ok: !blocking.has(result.action), verdict: result };
  }, [blocking, run]);

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    seq.current++;
    if (isControlled) onChange?.("");
    else setOwn("");
    latest.current = "";
    setChecking(false);
    setDismissed(false);
    settle(null);
  }, [isControlled, onChange, settle]);

  const messageId = useId();
  const isBlocked = verdict !== null && blocking.has(verdict.action);
  const showMessage = isBlocked && !dismissed;

  return {
    value,
    setValue,
    inputProps: {
      value,
      onChange: (event) => setValue(event.target.value),
      onBlur,
      "aria-invalid": isBlocked,
      "aria-describedby": showMessage ? messageId : undefined,
    },
    nativeProps: { value, onChangeText: setValue, onBlur },
    messageProps: { id: messageId, role: "alert" },
    verdict,
    checking,
    blocked: isBlocked,
    message: showMessage && verdict ? copyFor(verdict, message) : null,
    check,
    dismiss: useCallback(() => setDismissed(true), []),
    reset,
  };
}
