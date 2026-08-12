/**
 * HTTP provider — point moderato at YOUR OWN screening endpoint. This is
 * the production shape for browser apps: the server holds the vendor key
 * (and the real policy), the client just asks it.
 *
 * Default request:  POST url  { "text": "...", "images": ["data:...", …] }
 * Default response: { "flags": {"category": true}, "scores": {"category": 0.9} }
 * Anything else: supply `map` to translate your endpoint's response.
 */

import type {
  ModerationProvider,
  NormalizedInput,
  ProviderResult,
} from "../types.js";

export interface HttpProviderOptions {
  url: string;
  headers?: Record<string, string>;
  /** Translate your endpoint's JSON into flags + scores. */
  map?: (payload: unknown) => ProviderResult;
  fetch?: typeof fetch;
}

export function httpProvider(options: HttpProviderOptions): ModerationProvider {
  const doFetch = options.fetch ?? fetch;
  return {
    name: "http",
    async classify(input: NormalizedInput, signal?: AbortSignal): Promise<ProviderResult> {
      const response = await doFetch(options.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...options.headers },
        body: JSON.stringify({
          text: input.text ?? null,
          images: input.images.map((image) => image.dataUri),
        }),
        ...(signal ? { signal } : {}),
      });
      if (!response.ok) {
        throw new Error(`moderato: screening endpoint returned ${response.status}`);
      }
      const payload = (await response.json()) as unknown;
      if (options.map) return options.map(payload);
      const body = payload as Partial<ProviderResult> | null;
      return {
        flags: body?.flags ?? {},
        scores: body?.scores ?? {},
      };
    },
  };
}
