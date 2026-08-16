import { describe, expect, it, vi } from "vitest";
import {
  BLOCK,
  POLICY_PRESETS,
  PROFANITY_PRESET,
  REVIEW,
  createModerato,
  httpProvider,
  mockProvider,
  wordlistProvider,
} from "../src/index.js";
import {
  ModerationError,
  createModerationHandler,
  guard,
  isModerationError,
  toNodeHandler,
} from "../src/server/index.js";

const engine = () =>
  createModerato({ provider: wordlistProvider(PROFANITY_PRESET) });

const post = (body: unknown, init: RequestInit = {}) =>
  new Request("http://api.test/moderate", {
    method: "POST",
    body: JSON.stringify(body),
    ...init,
  });

describe("guard", () => {
  it("returns the verdict for anything publishable", async () => {
    const verdict = await guard(engine(), { text: "a perfectly nice post" });
    expect(verdict.action).toBe("allow");
  });

  it("throws a typed 422 on a block", async () => {
    const error = await guard(engine(), { text: "you are a nigger" }).catch((e) => e);
    expect(isModerationError(error)).toBe(true);
    expect(error.status).toBe(422);
    expect(error.code).toBe("moderation_refused");
    expect(error.verdict.action).toBe(BLOCK);
  });

  it("never puts the category list in front of the author", async () => {
    const error: ModerationError = await guard(engine(), {
      text: "you are a nigger",
    }).catch((e) => e);
    expect(error.toJSON()).toEqual({
      detail: error.message,
      code: "moderation_refused",
    });
    expect(JSON.stringify(error.toJSON())).not.toContain("hate");
  });

  it("takes the caller's copy, so refusal wording stays in one registry", async () => {
    const error = await guard(engine(), { text: "you are a nigger" }, {
      message: "Keep it about the cards.",
    }).catch((e) => e);
    expect(error.message).toBe("Keep it about the cards.");
  });

  it("publishes-and-queues a review verdict by default", async () => {
    const verdict = await guard(engine(), { text: "this is fucking great" });
    expect(verdict.action).toBe(REVIEW);
  });

  it("refuses a review verdict when the surface has no 'later'", async () => {
    const error = await guard(
      engine(),
      { text: "this is fucking great" },
      { refuseOnReview: true },
    ).catch((e) => e);
    expect(isModerationError(error)).toBe(true);
  });

  it("applies a per-surface policy", async () => {
    await expect(
      guard(engine(), { text: "fuckcollector" }, { policy: POLICY_PRESETS.identity }),
    ).resolves.toBeDefined();
    const error = await guard(
      engine(),
      { text: "fuck collector" },
      { policy: POLICY_PRESETS.identity },
    ).catch((e) => e);
    expect(isModerationError(error)).toBe(true);
  });

  it("does not refuse when screening merely failed — that is a review", async () => {
    const broken = createModerato({
      provider: mockProvider({ failWith: new Error("vendor down") }),
    });
    await expect(guard(broken, { text: "anything" })).resolves.toMatchObject({
      action: REVIEW,
    });
  });
});

describe("createModerationHandler", () => {
  it("answers in the shape httpProvider reads", async () => {
    const handler = createModerationHandler(engine());
    const response = await handler(post({ text: "you are a nigger" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.action).toBe(BLOCK);
    expect(body.flags.hate).toBe(true);
    expect(body.scores.hate).toBeGreaterThan(0.9);
  });

  it("closes the loop: a browser engine points httpProvider at it", async () => {
    const handler = createModerationHandler(engine());
    // The client holds NO vendor key — just a URL.
    const browser = createModerato({
      provider: httpProvider({
        url: "http://api.test/moderate",
        fetch: (_url, init) =>
          handler(new Request("http://api.test/moderate", init as RequestInit)),
      }),
    });
    expect((await browser.screenText("you are a nigger")).action).toBe(BLOCK);
    expect((await browser.screenText("nice pull")).action).toBe("allow");
  });

  it("lets the client hold a stricter policy than the server", async () => {
    const handler = createModerationHandler(engine());
    const strictClient = createModerato({
      provider: httpProvider({
        url: "http://api.test/moderate",
        fetch: (_url, init) =>
          handler(new Request("http://api.test/moderate", init as RequestInit)),
      }),
      policy: POLICY_PRESETS.identity,
    });
    // Server says review; the username field says no.
    expect((await strictClient.screenText("fuck collector")).action).toBe(BLOCK);
  });

  it("rejects anything but POST", async () => {
    const handler = createModerationHandler(engine());
    const response = await handler(
      new Request("http://api.test/moderate", { method: "GET" }),
    );
    expect(response.status).toBe(405);
  });

  it("rejects invalid JSON rather than screening garbage", async () => {
    const handler = createModerationHandler(engine());
    const response = await handler(
      new Request("http://api.test/moderate", { method: "POST", body: "{oh no" }),
    );
    expect(response.status).toBe(400);
  });

  it("refuses an oversized body", async () => {
    const handler = createModerationHandler(engine(), { maxBytes: 32 });
    const response = await handler(post({ text: "x".repeat(500) }));
    expect(response.status).toBe(413);
  });

  it("is not a free classifier for the internet", async () => {
    const authorize = vi.fn(() => false);
    const handler = createModerationHandler(engine(), { authorize });
    const response = await handler(post({ text: "hello" }));
    expect(response.status).toBe(401);
    expect(authorize).toHaveBeenCalledOnce();
  });

  it("passes an authorized request through", async () => {
    const handler = createModerationHandler(engine(), {
      authorize: (request) => request.headers.get("authorization") === "Bearer ok",
    });
    const response = await handler(
      post({ text: "hello" }, { headers: { authorization: "Bearer ok" } }),
    );
    expect(response.status).toBe(200);
  });

  it("screens images sent as data URIs", async () => {
    const seen: number[] = [];
    const spy = createModerato({
      provider: {
        name: "spy",
        classify: async (input) => {
          seen.push(input.images.length);
          return { flags: {}, scores: {} };
        },
      },
    });
    const handler = createModerationHandler(spy);
    await handler(post({ images: ["data:image/png;base64,AAAA", "data:image/png;base64,BBBB"] }));
    expect(seen).toEqual([2]);
  });

  it("adds the caller's headers (CORS lives with the app, not the library)", async () => {
    const handler = createModerationHandler(engine(), {
      headers: { "access-control-allow-origin": "https://app.test" },
    });
    const response = await handler(post({ text: "hi" }));
    expect(response.headers.get("access-control-allow-origin")).toBe("https://app.test");
  });
});

describe("toNodeHandler", () => {
  const nodeReq = (body: string, headers: Record<string, string> = {}) => {
    const listeners: Record<string, (chunk?: unknown) => void> = {};
    const req = {
      method: "POST",
      url: "/api/moderate",
      headers,
      on(event: string, listener: (chunk?: unknown) => void) {
        listeners[event] = listener;
        return req;
      },
    };
    queueMicrotask(() => {
      listeners.data?.(body);
      listeners.end?.();
    });
    return req;
  };

  const nodeRes = () => {
    const res = {
      statusCode: 0,
      headers: {} as Record<string, string>,
      body: "",
      setHeader(name: string, value: string) {
        res.headers[name] = value;
        return res;
      },
      end(body?: string) {
        res.body = body ?? "";
        return res;
      },
    };
    return res;
  };

  it("reads the body off the stream", async () => {
    const handler = toNodeHandler(createModerationHandler(engine()));
    const res = nodeRes();
    await handler(nodeReq(JSON.stringify({ text: "you are a nigger" })), res);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).action).toBe(BLOCK);
  });

  it("uses a body a parser already read", async () => {
    const handler = toNodeHandler(createModerationHandler(engine()));
    const res = nodeRes();
    const req = Object.assign(nodeReq(""), { body: { text: "nice pull" } });
    await handler(req, res);
    expect(JSON.parse(res.body).action).toBe("allow");
  });

  it("copies the status and headers back", async () => {
    const handler = toNodeHandler(createModerationHandler(engine()));
    const res = nodeRes();
    await handler({ ...nodeReq(""), method: "GET" }, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers["content-type"]).toBe("application/json");
  });
});
