/**
 * OpenAI omni-moderation provider — classifies TEXT AND IMAGES in one call
 * across the categories that matter (sexual, sexual/minors, hate,
 * harassment, violence, self-harm, illicit). The moderation endpoint is
 * free to call with any OpenAI API key. No SDK dependency — one fetch.
 */

import type {
  ModerationProvider,
  NormalizedInput,
  ProviderResult,
} from "../types.js";

export const OPENAI_MODERATION_MODEL = "omni-moderation-latest";

export interface OpenAIProviderOptions {
  /** Your OpenAI API key. Get one at https://platform.openai.com/api-keys */
  apiKey: string;
  model?: string;
  baseUrl?: string;
  /**
   * Running this in a browser ships your API key to every visitor. Only
   * set this for local prototyping; in production, call OpenAI from your
   * server (or use `httpProvider` against your own screening endpoint).
   */
  dangerouslyAllowBrowser?: boolean;
  fetch?: typeof fetch;
}

type OpenAIPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export function openAIProvider(options: OpenAIProviderOptions): ModerationProvider {
  if (!options.apiKey) {
    throw new Error("moderato: openAIProvider needs an apiKey.");
  }
  if (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    !options.dangerouslyAllowBrowser
  ) {
    throw new Error(
      "moderato: refusing to use an OpenAI API key in the browser — it would " +
        "be visible to every visitor. Screen on your server, or pass " +
        "{ dangerouslyAllowBrowser: true } if this is a local prototype.",
    );
  }

  const model = options.model ?? OPENAI_MODERATION_MODEL;
  const baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const doFetch = options.fetch ?? fetch;

  return {
    name: "openai",
    async classify(input: NormalizedInput, signal?: AbortSignal): Promise<ProviderResult> {
      const parts: OpenAIPart[] = [];
      if (input.text) parts.push({ type: "text", text: input.text });
      for (const image of input.images) {
        parts.push({ type: "image_url", image_url: { url: image.dataUri } });
      }

      const response = await doFetch(`${baseUrl}/moderations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({ model, input: parts }),
        ...(signal ? { signal } : {}),
      });
      if (!response.ok) {
        throw new Error(
          `moderato: OpenAI moderation returned ${response.status} ${response.statusText}`,
        );
      }
      const payload = (await response.json()) as {
        results?: Array<{
          categories?: Record<string, boolean | null>;
          category_scores?: Record<string, number | null>;
        }>;
      };
      const result = payload.results?.[0];
      const flags: Record<string, boolean> = {};
      const scores: Record<string, number> = {};
      for (const [name, hit] of Object.entries(result?.categories ?? {})) {
        flags[name] = Boolean(hit);
      }
      for (const [name, score] of Object.entries(result?.category_scores ?? {})) {
        scores[name] = typeof score === "number" ? score : 0;
      }
      return { flags, scores };
    },
  };
}
