/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  BLOCK,
  POLICY_PRESETS,
  PROFANITY_PRESET,
  createModerato,
  wordlistProvider,
} from "../src/index.js";
import type { ProviderResult } from "../src/index.js";
import { useModeratedField } from "../src/react/index.js";
import type { UseModeratedFieldOptions } from "../src/react/index.js";

const SLUR = "you are a nigger";

const engine = () => createModerato({ provider: wordlistProvider(PROFANITY_PRESET) });

/** One engine per hook, created once — not once per render. */
const field = (options: Partial<UseModeratedFieldOptions> = {}) => {
  const shared = options.engine ?? engine();
  return renderHook(() =>
    useModeratedField({ debounceMs: 5, ...options, engine: shared }),
  );
};

describe("useModeratedField", () => {
  it("starts clean and unscreened", () => {
    const { result } = field();
    expect(result.current.value).toBe("");
    expect(result.current.verdict).toBeNull();
    expect(result.current.blocked).toBe(false);
    expect(result.current.message).toBeNull();
  });

  it("blocks a slur as it is typed, and offers copy for your own popup", async () => {
    const { result } = field();
    act(() => result.current.setValue(SLUR));
    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.verdict?.action).toBe(BLOCK);
    expect(result.current.message).toMatch(/community rules/i);
    expect(result.current.inputProps["aria-invalid"]).toBe(true);
    expect(result.current.inputProps["aria-describedby"]).toBe(
      result.current.messageProps.id,
    );
  });

  it("leaves ordinary text alone", async () => {
    const { result } = field();
    act(() => result.current.setValue("just pulled a Charizard"));
    await waitFor(() => expect(result.current.verdict).not.toBeNull());
    expect(result.current.blocked).toBe(false);
    expect(result.current.message).toBeNull();
    expect(result.current.inputProps["aria-describedby"]).toBeUndefined();
  });

  it("calls onBlocked once on the way in, and onCleared on the way out", async () => {
    const onBlocked = vi.fn();
    const onCleared = vi.fn();
    const { result } = field({ onBlocked, onCleared });

    act(() => result.current.setValue(SLUR));
    await waitFor(() => expect(onBlocked).toHaveBeenCalledTimes(1));

    // Still blocked, still one call — this is an event, not a state mirror.
    act(() => result.current.setValue(`${SLUR}!`));
    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(onBlocked).toHaveBeenCalledTimes(1);

    act(() => result.current.setValue("just pulled a Charizard"));
    await waitFor(() => expect(onCleared).toHaveBeenCalledTimes(1));
    expect(result.current.blocked).toBe(false);
  });

  it("debounces — one screen per pause, not one per keystroke", async () => {
    const classify = vi.fn(async () => ({ flags: {}, scores: {} }));
    const { result } = field({
      engine: createModerato({ provider: { name: "counted", classify } }),
      debounceMs: 20,
    });
    act(() => {
      result.current.setValue("h");
      result.current.setValue("he");
      result.current.setValue("hel");
      result.current.setValue("hell");
      result.current.setValue("hello");
    });
    await waitFor(() => expect(classify).toHaveBeenCalledTimes(1));
    expect(classify.mock.calls).toHaveLength(1);
  });

  it("clears instantly when the field is emptied", async () => {
    const { result } = field();
    act(() => result.current.setValue(SLUR));
    await waitFor(() => expect(result.current.blocked).toBe(true));
    act(() => result.current.setValue(""));
    expect(result.current.blocked).toBe(false);
    expect(result.current.verdict).toBeNull();
  });

  it("does not screen below minLength", async () => {
    const classify = vi.fn(async () => ({ flags: {}, scores: {} }));
    const { result } = field({
      engine: createModerato({ provider: { name: "counted", classify } }),
      minLength: 4,
    });
    act(() => result.current.setValue("abc"));
    await new Promise((r) => setTimeout(r, 20));
    expect(classify).not.toHaveBeenCalled();
    act(() => result.current.setValue("abcd"));
    await waitFor(() => expect(classify).toHaveBeenCalledTimes(1));
  });

  it("check() flushes the debounce — the submit-inside-the-window hole", async () => {
    const { result } = field({ debounceMs: 10_000 });
    act(() => result.current.setValue(SLUR));
    // Nothing has run yet; a naive field would publish this.
    expect(result.current.verdict).toBeNull();

    let outcome: Awaited<ReturnType<typeof result.current.check>> | undefined;
    await act(async () => {
      outcome = await result.current.check();
    });
    expect(outcome?.ok).toBe(false);
    expect(outcome?.verdict.action).toBe(BLOCK);
    expect(result.current.blocked).toBe(true);
  });

  it("check() says ok for a clean field", async () => {
    const { result } = field();
    act(() => result.current.setValue("just pulled a Charizard"));
    let outcome: Awaited<ReturnType<typeof result.current.check>> | undefined;
    await act(async () => {
      outcome = await result.current.check();
    });
    expect(outcome?.ok).toBe(true);
  });

  it("screens on blur when asked to", async () => {
    const { result } = field({ screenOn: "blur" });
    act(() => result.current.setValue(SLUR));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.verdict).toBeNull();
    await act(async () => {
      result.current.inputProps.onBlur();
    });
    await waitFor(() => expect(result.current.blocked).toBe(true));
  });

  it("takes a per-field policy — a username is not a comment", async () => {
    const shared = engine();
    const comment = renderHook(() =>
      useModeratedField({ engine: shared, debounceMs: 5 }),
    );
    const handle = renderHook(() =>
      useModeratedField({
        engine: shared,
        debounceMs: 5,
        policy: POLICY_PRESETS.identity,
      }),
    );

    act(() => comment.result.current.setValue("this is fucking great"));
    act(() => handle.result.current.setValue("fucking great"));

    await waitFor(() => expect(handle.result.current.blocked).toBe(true));
    await waitFor(() => expect(comment.result.current.verdict).not.toBeNull());
    expect(comment.result.current.blocked).toBe(false);
  });

  it("can be told to stop on review verdicts too", async () => {
    const { result } = field({ blockOn: ["block", "review"] });
    act(() => result.current.setValue("this is fucking great"));
    await waitFor(() => expect(result.current.blocked).toBe(true));
  });

  it("takes custom copy, including per-verdict", async () => {
    const { result } = field({
      message: (verdict) => `No — ${verdict.primary}. Please reword.`,
    });
    act(() => result.current.setValue(SLUR));
    await waitFor(() => expect(result.current.message).toBe("No — hate. Please reword."));
  });

  it("dismiss() hides the message without unblocking", async () => {
    const { result } = field();
    act(() => result.current.setValue(SLUR));
    await waitFor(() => expect(result.current.message).not.toBeNull());
    act(() => result.current.dismiss());
    expect(result.current.message).toBeNull();
    expect(result.current.blocked).toBe(true);
  });

  it("reset() empties and forgets", async () => {
    const { result } = field();
    act(() => result.current.setValue(SLUR));
    await waitFor(() => expect(result.current.blocked).toBe(true));
    act(() => result.current.reset());
    expect(result.current.value).toBe("");
    expect(result.current.verdict).toBeNull();
    expect(result.current.blocked).toBe(false);
  });

  it("works controlled", async () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) =>
        useModeratedField({ engine: engine(), value, onChange, debounceMs: 5 }),
      { initialProps: { value: "" } },
    );
    act(() => result.current.setValue(SLUR));
    expect(onChange).toHaveBeenCalledWith(SLUR);
    // The parent owns the value; the hook must not have invented one.
    expect(result.current.value).toBe("");
    rerender({ value: SLUR });
    await waitFor(() => expect(result.current.blocked).toBe(true));
  });

  it("exposes React Native props too", async () => {
    const { result } = field();
    act(() => result.current.nativeProps.onChangeText(SLUR));
    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.nativeProps.value).toBe(SLUR);
  });

  it("never blocks when the engine has no provider", async () => {
    const { result } = field({ engine: createModerato() });
    act(() => result.current.setValue(SLUR));
    let outcome: Awaited<ReturnType<typeof result.current.check>> | undefined;
    await act(async () => {
      outcome = await result.current.check();
    });
    expect(outcome?.ok).toBe(true);
    expect(result.current.blocked).toBe(false);
  });

  it("does not let a slow early screen land on a fast late one", async () => {
    let resolveFirst: ((value: ProviderResult) => void) | undefined;
    let call = 0;
    const engineWithLag = createModerato({
      cache: false,
      provider: {
        name: "lagging",
        classify: async (): Promise<ProviderResult> => {
          call += 1;
          if (call === 1) {
            return new Promise<ProviderResult>((resolve) => {
              resolveFirst = resolve;
            });
          }
          return { flags: {}, scores: {} };
        },
      },
    });
    const { result } = renderHook(() =>
      useModeratedField({ engine: engineWithLag, debounceMs: 0 }),
    );

    act(() => result.current.setValue("first draft"));
    await waitFor(() => expect(call).toBe(1));
    act(() => result.current.setValue("second draft"));
    await waitFor(() => expect(call).toBe(2));

    // The stale first screen finally answers, claiming a block.
    await act(async () => {
      resolveFirst?.({ flags: { hate: true }, scores: { hate: 0.99 } });
      await Promise.resolve();
    });
    expect(result.current.blocked).toBe(false);
  });
});
