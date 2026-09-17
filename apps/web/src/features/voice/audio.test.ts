import { describe, expect, it } from "vitest";

import { AudioValidationError, audioFileName, isAllowedAudioMimeType, validateAudioBlob } from "./audio";

describe("audio contract", () => {
  it("accepts browser codec parameters and maps a safe extension", () => {
    const blob = new Blob(["audio"], { type: "audio/webm;codecs=opus" });

    expect(isAllowedAudioMimeType(blob.type)).toBe(true);
    expect(audioFileName(blob.type)).toBe("taskflow-recording.webm");
    expect(() => validateAudioBlob(blob, 10)).not.toThrow();
  });

  it("rejects empty, oversized and unsupported blobs", () => {
    expect(() => validateAudioBlob(new Blob([], { type: "audio/wav" }))).toThrow(AudioValidationError);
    expect(() => validateAudioBlob(new Blob(["audio"], { type: "audio/wav" }), 2)).toThrow(AudioValidationError);
    expect(() => validateAudioBlob(new Blob(["audio"], { type: "application/octet-stream" }))).toThrow(AudioValidationError);
  });
});