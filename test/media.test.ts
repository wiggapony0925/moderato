/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  VideoUnsupportedError,
  bytesToDataUri,
  frameTimestamps,
  sampleFrames,
  toImagePart,
} from "../src/index.js";

describe("bytesToDataUri", () => {
  it("encodes bytes with their content type", () => {
    expect(bytesToDataUri(new Uint8Array([1, 2, 3]), "image/png")).toBe(
      "data:image/png;base64,AQID",
    );
  });

  it("handles a payload larger than one btoa chunk", () => {
    const uri = bytesToDataUri(new Uint8Array(70_000).fill(65), "image/jpeg");
    expect(uri.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(uri.length).toBeGreaterThan(90_000);
  });
});

describe("toImagePart", () => {
  it("passes a data URI straight through", async () => {
    expect(await toImagePart({ dataUri: "data:image/png;base64,AA" })).toEqual({
      dataUri: "data:image/png;base64,AA",
    });
  });

  it("encodes raw bytes", async () => {
    const part = await toImagePart({
      bytes: new Uint8Array([255, 216]),
      contentType: "image/jpeg",
    });
    expect(part.dataUri).toBe("data:image/jpeg;base64,/9g=");
  });

  it("reads a Blob", async () => {
    const part = await toImagePart(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
    expect(part.dataUri).toBe("data:image/png;base64,AQID");
  });

  it("assumes jpeg for a Blob with no type", async () => {
    const part = await toImagePart(new Blob([new Uint8Array([1])]));
    expect(part.dataUri.startsWith("data:image/jpeg;base64,")).toBe(true);
  });
});

describe("frameTimestamps", () => {
  it("spreads frames across the duration, avoiding the black ends", () => {
    expect(frameTimestamps(10, 4)).toEqual([1.25, 3.75, 6.25, 8.75]);
  });

  it("copes with an unknown duration", () => {
    expect(frameTimestamps(Number.NaN, 6)).toEqual([0]);
    expect(frameTimestamps(0, 6)).toEqual([0]);
  });

  it("always yields at least one timestamp", () => {
    expect(frameTimestamps(10, 0)).toHaveLength(1);
  });
});

describe("sampleFrames", () => {
  it("says so plainly when video cannot be decoded here", async () => {
    // jsdom has a <video> element and no media pipeline at all — exactly
    // the case that used to hang forever waiting for loadedmetadata.
    await expect(
      sampleFrames(new Blob([new Uint8Array([0])], { type: "video/mp4" })),
    ).rejects.toBeInstanceOf(VideoUnsupportedError);
  });
});
