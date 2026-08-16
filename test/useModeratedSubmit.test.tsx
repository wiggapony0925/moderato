/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { REFUSED_STATUS, useModeratedSubmit } from "../src/react/index.js";
import type { MutationLike } from "../src/react/index.js";

const refusal = (message: string) =>
  Object.assign(new Error(message), { status: REFUSED_STATUS });

describe("useModeratedSubmit (async function form)", () => {
  it("calls onDone when the publish succeeds", async () => {
    const onDone = vi.fn();
    const publish = vi.fn(async () => undefined);
    const { result } = renderHook(() => useModeratedSubmit(publish, { onDone }));

    act(() => result.current.submit({ body: "hi" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(result.current.refusal).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("surfaces the server's own words on a 422, and keeps the draft", async () => {
    const onBlocked = vi.fn();
    const publish = vi.fn(async () => {
      throw refusal("Keep it about the cards.");
    });
    const { result } = renderHook(() => useModeratedSubmit(publish, { onBlocked }));

    act(() => result.current.submit({ body: "bad" }));
    await waitFor(() =>
      expect(result.current.refusal).toBe("Keep it about the cards."),
    );
    expect(onBlocked).toHaveBeenCalledWith("Keep it about the cards.");
    // A refusal is not an error — the composer stays open, not broken.
    expect(result.current.error).toBeNull();
  });

  it("treats every other failure as an ordinary error", async () => {
    const publish = vi.fn(async () => {
      throw Object.assign(new Error("gateway"), { status: 502 });
    });
    const { result } = renderHook(() => useModeratedSubmit(publish));
    act(() => result.current.submit({}));
    await waitFor(() => expect(result.current.error?.message).toBe("gateway"));
    expect(result.current.refusal).toBeNull();
  });

  it("dismiss() clears the refusal", async () => {
    const publish = vi.fn(async () => {
      throw refusal("no");
    });
    const { result } = renderHook(() => useModeratedSubmit(publish));
    act(() => result.current.submit({}));
    await waitFor(() => expect(result.current.refusal).toBe("no"));
    act(() => result.current.dismiss());
    expect(result.current.refusal).toBeNull();
  });

  it("tracks pending", async () => {
    let release: (() => void) | undefined;
    const publish = vi.fn(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const { result } = renderHook(() => useModeratedSubmit(publish));
    act(() => result.current.submit({}));
    expect(result.current.pending).toBe(true);
    await act(async () => {
      release?.();
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
  });
});

describe("useModeratedSubmit (mutation form)", () => {
  const mutation = (
    behaviour: "ok" | "refuse",
  ): MutationLike<{ body: string }> => ({
    isPending: false,
    mutate: (_vars, callbacks) => {
      if (behaviour === "ok") callbacks?.onSuccess?.();
      else callbacks?.onError?.(refusal("Keep it about the cards."));
    },
  });

  it("works with a TanStack-shaped mutation without importing one", async () => {
    const onDone = vi.fn();
    const { result } = renderHook(() =>
      useModeratedSubmit(mutation("ok"), { onDone }),
    );
    act(() => result.current.submit({ body: "hi" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("routes a mutation's 422 to refusal, not error", async () => {
    const { result } = renderHook(() => useModeratedSubmit(mutation("refuse")));
    act(() => result.current.submit({ body: "bad" }));
    await waitFor(() =>
      expect(result.current.refusal).toBe("Keep it about the cards."),
    );
    expect(result.current.error).toBeNull();
  });
});
