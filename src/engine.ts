/**
 * The engine: one `screen()` call for text + images + video, one verdict.
 *
 * Failure is open, but never silent. If the provider errors or times out,
 * the verdict is `failMode` (default "review") with a detail saying why —
 * a third party's outage should not become yours, and the alternative to
 * the review flag is content nobody ever looked at.
 */

import { decide } from "./policy.js";
import { toImagePart } from "./media/image.js";
import { sampleFrames } from "./media/video.js";
import type {
  ImagePart,
  ModeratoConfig,
  NormalizedInput,
  ScreenInput,
  Verdict,
} from "./types.js";
import { ALLOW, REVIEW } from "./types.js";

export const DEFAULT_TIMEOUT_MS = 6000;

const allow = (detail?: string): Verdict => ({
  action: ALLOW,
  categories: [],
  score: 0,
  ...(detail ? { detail } : {}),
});

export class Moderato {
  constructor(private readonly config: ModeratoConfig = {}) {}

  /** Is a provider configured, i.e. does screen() actually screen? */
  get enabled(): boolean {
    return Boolean(this.config.provider);
  }

  /**
   * Screen a piece of content in ONE provider call. Returns "allow" when
   * there is nothing to screen or no provider is configured (that is the
   * server-authoritative mode, not a failure). Never throws.
   */
  async screen(input: ScreenInput): Promise<Verdict> {
    const provider = this.config.provider;

    let normalized: NormalizedInput;
    try {
      normalized = await this.normalize(input);
    } catch (err) {
      // Couldn't even read the media (e.g. video with no decoder). That is
      // a screening failure, not an allow.
      return provider ? this.failed(err) : allow();
    }

    if (!normalized.text && normalized.images.length === 0) return allow();
    // NO PROVIDER IS NOT THE SAME AS A FAILED CHECK. Unconfigured means
    // screening is off on purpose — the server (or nobody) is the screen.
    if (!provider) return allow();

    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // Race an abort rejection alongside the call: a provider that ignores
      // the signal (or a fetch that hangs before headers) must not hold the
      // verdict past the budget.
      const result = await Promise.race([
        provider.classify(normalized, controller.signal),
        rejectOnAbort(controller.signal),
      ]);
      return decide(result, this.config.policy);
    } catch (err) {
      return controller.signal.aborted
        ? this.failed(new Error(`timed out after ${timeoutMs}ms`))
        : this.failed(err);
    } finally {
      clearTimeout(timer);
    }
  }

  private async normalize(input: ScreenInput): Promise<NormalizedInput> {
    const text = input.text?.trim() || undefined;
    const images: ImagePart[] = [];
    for (const source of input.images ?? []) {
      images.push(await toImagePart(source));
    }
    for (const video of input.videos ?? []) {
      images.push(...(await sampleFrames(video, this.config.video)));
    }
    return { text, images };
  }

  private failed(err: unknown): Verdict {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      action: this.config.failMode ?? REVIEW,
      categories: [],
      score: 0,
      detail: `Screening failed: ${reason}`,
    };
  }
}

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), {
      once: true,
    });
  });
}

export const createModerato = (config: ModeratoConfig = {}): Moderato =>
  new Moderato(config);
